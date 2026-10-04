import base64
import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader
from app.main import create_app
from app.services.pdf_service import restricted_fetcher

SETTINGS = {"pageSize": "A4", "orientation": "portrait", "margins": {"top": 20, "right": 20, "bottom": 20, "left": 20}}

def body(html="<p>Hello</p>", **extra):
    return {"name": "Example", "html": html, "pageSettings": SETTINGS, **extra}

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
    assert client.post('/pdf/render', json=body(html)).status_code == 422
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
    assert client.post('/templates/999/pdf').status_code == 404


def test_manual_break_pdf_and_geometry(client):
    html = '<h1>First page</h1><div data-page-break="true"></div><h1>Second page</h1>'
    settings = {**SETTINGS, 'pageSize': 'A5', 'orientation': 'landscape'}
    response = client.post('/pdf/render', json=body(html, pageSettings=settings))
    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/pdf'
    pdf = PdfReader(io.BytesIO(response.content))
    assert len(pdf.pages) == 2
    assert 'First page' in pdf.pages[0].extract_text()
    assert 'Second page' in pdf.pages[1].extract_text()
    assert float(pdf.pages[0].mediabox.width) == pytest.approx(210 * 72 / 25.4, abs=0.1)
    assert float(pdf.pages[0].mediabox.height) == pytest.approx(148 * 72 / 25.4, abs=0.1)
    assert client.get('/templates').json() == []
    id = client.post('/templates', json=body(html, pageSettings=settings)).json()['id']
    saved_pdf = client.post(f'/templates/{id}/pdf')
    assert len(PdfReader(io.BytesIO(saved_pdf.content)).pages) == 2


def test_images_and_legacy_breaks(client):
    output = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(output, format='PNG')
    image = base64.b64encode(output.getvalue()).decode()
    html = f'<figure class="image"><img src="data:image/png;base64,{image}" alt="red"></figure><p><span class="page-break-marker" data-page-break="true"></span></p><p>After</p>'
    response = client.post('/templates', json=body(html))
    assert response.status_code == 201
    assert '<div data-page-break="true"></div>' in response.json()['html']
    assert '<img' in response.json()['html']
    assert client.post('/pdf/render', json=body(html)).status_code == 200


def test_resized_tables_save_and_render_with_column_widths(client):
    html = '<figure class="table"><table class="ck-table-resized"><colgroup><col style="width:30%;"><col style="width:70%;"></colgroup><tbody><tr><td>Narrow column</td><td>Wide column</td></tr></tbody></table></figure>'
    created = client.post('/templates', json=body(html))
    assert created.status_code == 201
    record = created.json()
    assert 'class="ck-table-resized"' in record['html']
    assert 'width:30%' in record['html']
    assert 'width:70%' in record['html']
    assert client.get(f"/templates/{record['id']}").json()['html'] == record['html']
    for response in [
        client.post('/pdf/render', json=body(html)),
        client.post(f"/templates/{record['id']}/pdf"),
    ]:
        assert response.status_code == 200
        pdf = PdfReader(io.BytesIO(response.content))
        assert len(pdf.pages) == 1
        assert 'Narrow column' in pdf.pages[0].extract_text()
        assert 'Wide column' in pdf.pages[0].extract_text()


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
