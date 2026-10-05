import base64
import io
import os
from pathlib import Path
import subprocess
import sys
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader
from app.main import create_app
from app.services.pdf_service import restricted_fetcher
from app.services.html_validation import HtmlValidationError, validate_html

SETTINGS = {"pageSize": "A4", "orientation": "portrait", "margins": {"top": 20, "right": 20, "bottom": 20, "left": 20}}

def body(html="<p>Hello</p>", **extra):
    return {"name": "Example", "html": html, "pageSettings": SETTINGS, **extra}


def render_saved_pdf(client, payload):
    created = client.post('/templates', json=payload)
    assert created.status_code == 201
    return client.post('/pdf/render', json={
        'templateId': created.json()['id'], 'documentId': 'demo-invoice',
    })

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(f"sqlite:///{tmp_path / 'templates.db'}")) as client:
        yield client


def test_crud_and_idempotent_update(client):
    assert client.get('/templates').json() == []
    created = client.post('/templates', json=body())
    assert created.status_code == 201
    record = created.json()
    id = record['id']
    assert client.get(f'/templates/{id}').json() == record
    assert client.put(f'/templates/{id}', json=body()).json() == record
    assert client.get('/templates?q=Exam').json()[0]['id'] == id
    assert client.get('/templates?q=%').json() == []
    updated = client.put(f'/templates/{id}', json=body('<h1>Changed</h1>', name='Renamed')).json()
    assert updated['name'] == 'Renamed'
    assert updated['html'] == '<h1>Changed</h1>'
    assert updated['createdAt'] == record['createdAt']
    assert client.delete(f'/templates/{id}').status_code == 204
    assert client.get(f'/templates/{id}').status_code == 404
    assert client.get('/templates').json() == []


@pytest.mark.parametrize('html', [
    '<script>alert(1)</script>', '<p onclick="alert(1)">Hello</p>',
    '<iframe src="https://example.com"></iframe>', '<img src="file:///etc/passwd">',
    '<img src="http://127.0.0.1:8000/health">', '<a href="javascript:alert(1)">click</a>',
    '<p style="background-color:url(file:///etc/passwd)">x</p>',
    '<p style="position:fixed">x</p>', '<p style="color:var(--evil)">x</p>',
    '<svg><script>alert(1)</script></svg>', '<p><div data-page-break="true">lost text</div></p>',
    '<p><span data-page-break="true"></span>after</p>', '<img src="data:image/png;base64,AA==">',
    '<p data-secret="x">x</p>', '<p style="margin-top:-100px">x</p>',
    '<table class="unsupported-table"><tbody><tr><td>x</td></tr></tbody></table>',
])
def test_rejects_unsafe_or_unsupported_html(client, html):
    assert client.post('/templates', json=body(html)).status_code == 422
    assert client.get('/templates').json() == []


def test_page_settings_and_names(client):
    for settings in [
        {**SETTINGS, 'pageSize': 'Letter'},
        {**SETTINGS, 'orientation': 'sideways'},
        {**SETTINGS, 'margins': {'top': 0, 'bottom': 0, 'left': 110, 'right': 100}},
        {**SETTINGS, 'margins': {'top': 0.5, 'bottom': 20, 'left': 20, 'right': 20}},
        {**SETTINGS, 'margins': {'top': True, 'bottom': 20, 'left': 20, 'right': 20}},
    ]:
        assert client.post('/templates', json=body(pageSettings=settings)).status_code == 400
    assert client.post('/templates', json=body(name='   ')).status_code == 400
    assert client.post('/templates', json={**body(), 'unexpected': 1}).status_code == 400
    assert client.get('/templates/999').status_code == 404
    assert client.post('/pdf/render', json={'templateId': 999, 'documentId': 'demo-invoice'}).status_code == 404


def test_manual_break_pdf_and_geometry(client):
    html = '<h1>First page</h1><div data-page-break="true"></div><h1>Second page</h1>'
    settings = {**SETTINGS, 'pageSize': 'A5', 'orientation': 'landscape'}
    response = render_saved_pdf(client, body(html, pageSettings=settings))
    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/pdf'
    pdf = PdfReader(io.BytesIO(response.content))
    assert len(pdf.pages) == 2
    assert 'First page' in pdf.pages[0].extract_text()
    assert 'Second page' in pdf.pages[1].extract_text()
    assert float(pdf.pages[0].mediabox.width) == pytest.approx(210 * 72 / 25.4, abs=0.1)
    assert float(pdf.pages[0].mediabox.height) == pytest.approx(148 * 72 / 25.4, abs=0.1)


def test_images_and_legacy_breaks(client):
    output = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(output, format='PNG')
    image = base64.b64encode(output.getvalue()).decode()
    html = f'<figure class="image"><img src="data:image/png;base64,{image}" alt="red"></figure><p><span class="page-break-marker" data-page-break="true"></span></p><p>After</p>'
    response = client.post('/templates', json=body(html))
    assert response.status_code == 201
    assert '<div data-page-break="true"></div>' in response.json()['html']
    assert '<img' in response.json()['html']
    assert render_saved_pdf(client, body(html)).status_code == 200


def test_resized_tables_save_and_render_with_column_widths(client):
    html = '<figure class="table"><table class="ck-table-resized"><colgroup><col style="width:30%;"><col style="width:70%;"></colgroup><tbody><tr><td>Narrow column</td><td>Wide column</td></tr></tbody></table></figure>'
    created = client.post('/templates', json=body(html))
    assert created.status_code == 201
    record = created.json()
    assert 'class="ck-table-resized"' in record['html']
    assert 'width:30%' in record['html']
    assert 'width:70%' in record['html']
    assert client.get(f"/templates/{record['id']}").json()['html'] == record['html']
    response = client.post('/pdf/render', json={'templateId': record['id'], 'documentId': 'demo-invoice'})
    assert response.status_code == 200
    pdf = PdfReader(io.BytesIO(response.content))
    assert len(pdf.pages) == 1
    assert 'Narrow column' in pdf.pages[0].extract_text()
    assert 'Wide column' in pdf.pages[0].extract_text()


def test_cell_border_longhands_save_reload_and_render(client):
    # CKEditor expands mixed cell borders into individual side properties.
    style = ';'.join(
        f'border-{side}-{property}:{value}'
        for side in ('top', 'right', 'bottom', 'left')
        for property, value in (('style', 'none'), ('width', '1px'), ('color', 'red'))
    )
    html = f'<table style="border-style:none"><tbody><tr><td style="{style}">Borderless cell</td></tr></tbody></table>'
    created = client.post('/templates', json=body(html))
    assert created.status_code == 201
    record = created.json()
    assert style in record['html']
    assert client.get(f"/templates/{record['id']}").json()['html'] == record['html']
    response = client.post('/pdf/render', json={'templateId': record['id'], 'documentId': 'demo-invoice'})
    assert response.status_code == 200
    assert 'Borderless cell' in PdfReader(io.BytesIO(response.content)).pages[0].extract_text()


def test_resized_images_save_and_render_with_aspect_ratio(client):
    output = io.BytesIO()
    Image.new('RGB', (80, 40), 'red').save(output, format='PNG')
    image = base64.b64encode(output.getvalue()).decode()
    html = f'<figure class="image image_resized" style="width:50%;"><img src="data:image/png;base64,{image}" width="80" height="40" style="aspect-ratio:80/40;"></figure>'
    created = client.post('/templates', json=body(html))
    assert created.status_code == 201
    record = created.json()
    assert 'aspect-ratio:80/40' in record['html']
    assert client.get(f"/templates/{record['id']}").json()['html'] == record['html']
    response = client.post('/pdf/render', json={'templateId': record['id'], 'documentId': 'demo-invoice'})
    assert response.status_code == 200
    pdf = PdfReader(io.BytesIO(response.content))
    assert len(pdf.pages) == 1
    assert len(pdf.pages[0].images) == 1


@pytest.mark.parametrize('ratio', ['80/40', '16 / 9', '1.5', '.5 / 2.5', 'auto', 'auto 80 / 40'])
def test_valid_image_aspect_ratios(ratio):
    html = f'<p style="aspect-ratio:{ratio};">Example</p>'
    assert f'aspect-ratio:{ratio}' in validate_html(html)


@pytest.mark.parametrize('style', [
    'aspect-ratio:0/1', 'aspect-ratio:1/0', 'aspect-ratio:-1/2', 'aspect-ratio:1/-2',
    'aspect-ratio:16/9/3', 'aspect-ratio:1px/2', 'aspect-ratio:auto auto',
    'aspect-ratio:url(file:///etc/passwd)', 'aspect-ratio:calc(16/9)',
    'width:80/40',
])
def test_rejects_invalid_ratios_and_slashes_in_other_css(style):
    with pytest.raises(HtmlValidationError):
        validate_html(f'<p style="{style};">Example</p>')


@pytest.mark.parametrize('url', ['file:///etc/passwd', 'http://localhost:8000', 'https://example.com/a.png', 'data:text/html;base64,AA=='])
def test_pdf_fetcher_never_loads_external_resources(url):
    with pytest.raises(ValueError):
        restricted_fetcher(url)


def test_database_survives_app_restart(tmp_path):
    url = f"sqlite:///{tmp_path / 'persist.db'}"
    with TestClient(create_app(url)) as client:
        id = client.post('/templates', json=body()).json()['id']
    with TestClient(create_app(url)) as client:
        assert client.get(f'/templates/{id}').json()['html'] == '<p>Hello</p>'


def test_pdf_generation_accepts_only_saved_template_and_document_ids(client):
    template_id = client.post('/templates', json=body('<p>Saved content</p>')).json()['id']
    ids = {'templateId': template_id, 'documentId': 'demo-invoice'}
    for payload in [body(), {**ids, 'html': '<p>Injected draft</p>'},
                    {**ids, 'pageSettings': SETTINGS}, {**ids, 'values': {}},
                    {**ids, 'templateId': 0}, {**ids, 'templateId': True},
                    {**ids, 'documentId': ''}, {**ids, 'documentId': ' '},
                    {'templateId': template_id}]:
        assert client.post('/pdf/render', json=payload).status_code == 400
    assert client.post('/pdf/render', json={**ids, 'documentId': 'missing'}).status_code == 404
    response = client.post('/pdf/render', json=ids)
    assert response.status_code == 200
    assert 'attachment' in response.headers['content-disposition']
    assert 'Saved content' in PdfReader(io.BytesIO(response.content)).pages[0].extract_text()


def test_pdf_loads_document_data_by_id_and_keeps_template_unchanged(tmp_path):
    html = '<p>{Client Name}</p><table><tbody><tr><td>{Item Description}</td></tr></tbody></table>'
    loaded = []

    def lookup(document_id):
        loaded.append(document_id)
        return {'values': {'{Client Name}': 'Selected customer'},
                'rows': [{'{Item Description}': 'Selected item'}]}

    with TestClient(create_app(f"sqlite:///{tmp_path / 'custom.db'}", document_lookup=lookup)) as client:
        record = client.post('/templates', json=body(html)).json()
        response = client.post('/pdf/render', json={'templateId': record['id'], 'documentId': 'order-42'})
        assert response.status_code == 200
        assert loaded == ['order-42']
        text = PdfReader(io.BytesIO(response.content)).pages[0].extract_text()
        assert 'Selected customer' in text
        assert 'Selected item' in text
        assert 'Aurora' not in text
        assert client.get(f"/templates/{record['id']}").json()['html'] == record['html']


def test_injected_lookup_can_reject_document(tmp_path):
    def lookup(document_id):
        raise LookupError("Document not found.")

    with TestClient(create_app(f"sqlite:///{tmp_path / 'custom.db'}", document_lookup=lookup)) as client:
        record = client.post('/templates', json=body()).json()
        response = client.post('/pdf/render', json={'templateId': record['id'], 'documentId': 'missing'})
        assert response.status_code == 404
        assert response.json()['detail'] == 'Document not found.'


def test_database_is_initialized_only_at_startup(tmp_path):
    database = tmp_path / 'deferred.db'
    app = create_app(f"sqlite:///{database}")
    assert not database.exists()
    with TestClient(app) as client:
        assert database.exists()
        assert client.get('/templates').json() == []
        assert client.post('/templates', json=body()).status_code == 201


def test_import_does_not_create_database(tmp_path):
    database = tmp_path / 'import.db'
    backend = Path(__file__).resolve().parents[1]
    subprocess.run(
        [sys.executable, '-c', 'import app.main'],
        cwd=backend,
        env={**os.environ, 'DATABASE_URL': f"sqlite:///{database}", 'PYTHONPATH': str(backend)},
        check=True,
        capture_output=True,
        text=True,
    )
    assert not database.exists()


def preflight(client, origin):
    return client.options('/pdf/render', headers={
        'Origin': origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
    })


def test_configurable_cors_replaces_local_defaults(tmp_path):
    origin = 'https://editor.example.com'
    with TestClient(create_app(f"sqlite:///{tmp_path / 'cors.db'}", cors_origins=[origin])) as client:
        allowed = preflight(client, origin)
        assert allowed.status_code == 200
        assert allowed.headers['access-control-allow-origin'] == origin
        denied = preflight(client, 'http://localhost:5173')
        assert denied.status_code == 400
        assert 'access-control-allow-origin' not in denied.headers


def test_empty_cors_origins_disables_cross_origin_access(tmp_path):
    with TestClient(create_app(f"sqlite:///{tmp_path / 'cors.db'}", cors_origins=[])) as client:
        response = preflight(client, 'http://localhost:5173')
        assert response.status_code == 400
        assert 'access-control-allow-origin' not in response.headers


def test_cors_environment_and_explicit_override(tmp_path, monkeypatch):
    monkeypatch.setenv('CORS_ORIGINS', ' https://one.example.com, https://two.example.com, ')
    with TestClient(create_app(f"sqlite:///{tmp_path / 'env.db'}")) as client:
        for origin in ['https://one.example.com', 'https://two.example.com']:
            assert preflight(client, origin).headers['access-control-allow-origin'] == origin
        assert preflight(client, 'http://localhost:5173').status_code == 400
    with TestClient(create_app(f"sqlite:///{tmp_path / 'override.db'}", cors_origins=[])) as client:
        assert preflight(client, 'https://one.example.com').status_code == 400


def test_default_cors_origins(tmp_path, monkeypatch):
    monkeypatch.delenv('CORS_ORIGINS', raising=False)
    with TestClient(create_app(f"sqlite:///{tmp_path / 'defaults.db'}")) as client:
        for origin in ['http://localhost:5173', 'http://127.0.0.1:5173']:
            assert preflight(client, origin).headers['access-control-allow-origin'] == origin


def test_cors_allows_authorization_header(tmp_path):
    origin = 'https://editor.example.com'
    with TestClient(create_app(f"sqlite:///{tmp_path / 'auth-cors.db'}", cors_origins=[origin])) as client:
        response = client.options('/pdf/render', headers={
            'Origin': origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Authorization, Content-Type',
        })
        assert response.status_code == 200
        assert response.headers['access-control-allow-origin'] == origin
        assert 'authorization' in response.headers['access-control-allow-headers'].lower()


@pytest.mark.parametrize('credentials', [False, True])
def test_cors_credentials_require_explicit_configuration(tmp_path, credentials):
    origin = 'https://editor.example.com'
    options = {'cors_allow_credentials': True} if credentials else {}
    with TestClient(create_app(f"sqlite:///{tmp_path / 'credentials.db'}", cors_origins=[origin], **options)) as client:
        for response in [preflight(client, origin), client.get('/health', headers={'Origin': origin})]:
            assert response.status_code == 200
            assert response.headers['access-control-allow-origin'] == origin
            if credentials:
                assert response.headers['access-control-allow-credentials'] == 'true'
            else:
                assert 'access-control-allow-credentials' not in response.headers
