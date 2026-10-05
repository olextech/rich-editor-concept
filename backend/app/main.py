import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from .db import Base, Template, create_database, now
from .schemas import Draft, PdfRequest, TemplatePayload
from .services import document_service, pdf_service, template_service
from .services.html_validation import HtmlValidationError

logger = logging.getLogger(__name__)


DEFAULT_CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


def create_app(database_url=None, *, document_lookup=None, cors_origins=None, cors_allow_credentials: bool = False):
    """Create the API with host-owned document lookup and allowed origins.

    ``document_lookup(document_id)`` returns ``{"values": {...}, "rows": [...]}``
    or raises ``LookupError`` when the record is unavailable. It is synchronous;
    FastAPI runs the PDF route in its worker thread pool.
    """
    database_url = database_url or os.environ.get("DATABASE_URL", f"sqlite:///{Path(__file__).resolve().parents[1] / 'templates.db'}")
    engine, sessions = create_database(database_url, initialize=False)
    document_lookup = document_service.get_document if document_lookup is None else document_lookup
    if cors_origins is None:
        configured_origins = os.environ.get("CORS_ORIGINS")
        cors_origins = DEFAULT_CORS_ORIGINS if configured_origins is None else [
            origin.strip() for origin in configured_origins.split(",") if origin.strip()
        ]

    @asynccontextmanager
    async def lifespan(app):
        try:
            Base.metadata.create_all(engine)
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="Paged template editor", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=list(cors_origins), allow_credentials=cors_allow_credentials, allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Content-Type", "Authorization"])

    def session_dependency():
        with sessions() as session:
            yield session

    def get_template(session, template_id):
        row = session.get(Template, template_id)
        if row is None:
            raise HTTPException(404, "Template not found.")
        return row

    @app.exception_handler(RequestValidationError)
    async def invalid_payload(request, error):
        messages = [f"{'.'.join(str(p) for p in item['loc'][1:])}: {item['msg']}" for item in error.errors()]
        return JSONResponse(status_code=400, content={"detail": "; ".join(messages)})

    @app.exception_handler(HtmlValidationError)
    async def invalid_html(request, error):
        logger.info("HTML validation rejected: %s", error)
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @app.exception_handler(SQLAlchemyError)
    async def database_failure(request, error):
        logger.exception("Database operation failed", exc_info=error)
        return JSONResponse(status_code=500, content={"detail": "Template storage is unavailable."})

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/templates")
    def list_templates(q: str = "", session=Depends(session_dependency)):
        return template_service.list_templates(session, q)

    @app.post("/templates", status_code=201)
    def create_template(payload: TemplatePayload, session=Depends(session_dependency)):
        row = template_service.assign(Template(created_at=now()), payload)
        session.add(row)
        session.commit()
        logger.info("Created template %s (%s)", row.id, row.name)
        return template_service.serialize(row)

    @app.get("/templates/{template_id}")
    def read_template(template_id: int, session=Depends(session_dependency)):
        return template_service.serialize(get_template(session, template_id))

    @app.put("/templates/{template_id}")
    def update_template(template_id: int, payload: TemplatePayload, session=Depends(session_dependency)):
        row = template_service.assign(get_template(session, template_id), payload)
        session.commit()
        logger.info("Updated template %s (%s)", row.id, row.name)
        return template_service.serialize(row)

    @app.delete("/templates/{template_id}", status_code=204)
    def delete_template(template_id: int, session=Depends(session_dependency)):
        session.delete(get_template(session, template_id))
        session.commit()
        logger.info("Deleted template %s", template_id)
        return Response(status_code=204)

    def pdf_response(payload, document):
        try:
            data = pdf_service.render_pdf(payload, document)
        except HtmlValidationError:
            raise
        except Exception as error:
            logger.exception("PDF generation failed")
            raise HTTPException(500, "PDF rendering failed. Check the backend PDF dependencies.") from error
        return Response(data, media_type="application/pdf", headers=pdf_service.pdf_headers(payload.name))

    @app.post("/pdf/render")
    def saved_pdf(payload: PdfRequest, session=Depends(session_dependency)):
        data = template_service.serialize(get_template(session, payload.templateId))
        try:
            document = document_lookup(payload.documentId)
        except LookupError as error:
            raise HTTPException(404, str(error)) from error
        return pdf_response(Draft(name=data["name"], html=data["html"], pageSettings=data["pageSettings"]), document)

    return app

app = create_app()
