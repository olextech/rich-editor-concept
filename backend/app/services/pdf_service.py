import logging
import time
from html import escape
from pathlib import Path
from urllib.parse import quote
from .html_validation import validate_html, validate_image
from .variable_service import render_variables

logger = logging.getLogger(__name__)
DOCUMENT_CSS = (Path(__file__).resolve().parents[3] / "shared/document.css").read_text()


def restricted_fetcher(url, *args, **kwargs):
    # Only validated embedded raster images can be fetched, including from CSS.
    from weasyprint import default_url_fetcher
    validate_image(url)
    return default_url_fetcher(url, *args, **kwargs)


def render_pdf(payload):
    started = time.monotonic()
    html = render_variables(validate_html(payload.html))
    from weasyprint import HTML
    settings, margins = payload.pageSettings, payload.pageSettings.margins
    height = (297 if settings.pageSize == "A4" else 210) if settings.orientation == "portrait" else (210 if settings.pageSize == "A4" else 148)
    printable_height = (height - margins.top - margins.bottom) * 96 / 25.4
    css = f"@page {{ size: {settings.pageSize} {settings.orientation}; margin: {margins.top}mm {margins.right}mm {margins.bottom}mm {margins.left}mm; }} body {{ margin: 0; --printable-height-px: {printable_height}px; }}\n" + DOCUMENT_CSS
    source = f'<!doctype html><html><head><meta charset="utf-8"><title>{escape(payload.name)}</title><style>{css}</style></head><body class="print-document">{html}</body></html>'
    result = HTML(string=source, url_fetcher=restricted_fetcher).write_pdf()
    logger.info("PDF rendered in %.3fs", time.monotonic() - started)
    return result


def pdf_headers(name):
    filename = "".join(c for c in name if c.isalnum() or c in " -_").strip() or "document"
    return {"Content-Disposition": f"attachment; filename=document.pdf; filename*=UTF-8''{quote(filename)}.pdf"}
