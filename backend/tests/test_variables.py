import io

import html5lib
import pytest
from pypdf import PdfReader

from app.services.variable_service import DEMO_VARIABLE_VALUES, DEMO_TABLE_ROWS, render_variables
from test_api import body, client, render_saved_pdf


def test_company_client_invoice_and_footer_values_render_in_saved_pdf(client):
    html = "<h1>Variable fixture</h1>" + "".join(
        f"<p>{token}</p>" for token in DEMO_VARIABLE_VALUES
    ) + '<div data-page-break="true"></div><p>{Company Name} / {Client Name}</p>'
    created = client.post("/templates", json=body(html))
    assert created.status_code == 201
    record = created.json()
    response = client.post('/pdf/render', json={'templateId': record['id'], 'documentId': 'demo-invoice'})
    assert response.status_code == 200
    pdf = PdfReader(io.BytesIO(response.content))
    assert len(pdf.pages) == 2
    text = " ".join(" ".join(page.extract_text().split()) for page in pdf.pages)
    for token, value in DEMO_VARIABLE_VALUES.items():
        assert value in text
        assert token not in text
    assert "Northwind Studio / Aurora Logistics LLC" in pdf.pages[1].extract_text()
    assert client.get(f"/templates/{record['id']}").json()["html"] == record["html"]
    for token in DEMO_VARIABLE_VALUES:
        assert token in record["html"]


def test_variables_across_inline_formatting_are_text_and_attributes_are_unchanged():
    html = '<p>Before <strong>{Company </strong><em>Name}</em> / {Company Name} after</p><p><a href="https://example.com/{Company Name}" title="{Client Note}">{Client Name}</a> {Unknown} {Legal Entity Name}</p>'
    value = '<script>alert("x")</script> & Studio'
    output = render_variables(html, {
        "{Company Name}": value,
        "{Client Name}": "{Company Name}",
        "{Client Note}": "Changed",
    })
    fragment = html5lib.parseFragment(output, namespaceHTMLElements=False)
    assert fragment.find(".//script") is None
    assert "".join(fragment[0].itertext()) == f"Before {value} / {value} after"
    assert fragment.find(".//strong").text == value
    assert fragment.find(".//a").text == "{Company Name}"
    assert fragment.find(".//a").attrib == {
        "href": "https://example.com/{Company Name}", "title": "{Client Note}"
    }
    assert "{Unknown} {Legal Entity Name}" in output


def test_variables_do_not_cross_blocks_cells_or_line_breaks():
    html = '<p>{Company </p><p>Name}</p><p>{Company <br>Name}</p><table><tbody><tr><td>{Client </td><td>Name}</td></tr></tbody></table>'
    output = render_variables(html)
    assert "Northwind Studio" not in output
    assert "Aurora Logistics LLC" not in output
    assert "{Company " in output
    assert "{Client " in output


TABLE_HTML = '<figure class="table"><table class="ck-table-resized"><colgroup><col style="width:55%;"><col style="width:10%;"><col style="width:17.5%;"><col style="width:17.5%;"></colgroup><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody><tr><td><strong>{Item <em>Description}</em></strong></td><td style="text-align:right;">{Item Qty}</td><td style="text-align:right;">{Item Rate}</td><td style="text-align:right;">{Item Amount}</td></tr></tbody><tfoot><tr><td colspan="3">Subtotal</td><td>{Subtotal}</td></tr><tr><td colspan="3">VAT ({Tax Rate})</td><td>{Tax Amount}</td></tr><tr><td colspan="3">Total due</td><td><strong>{Total}</strong></td></tr></tfoot></table></figure>'


def test_item_rows_and_footer_render_in_saved_pdf(client):
    created = client.post("/templates", json=body(TABLE_HTML))
    assert created.status_code == 201
    record = created.json()
    fragment = html5lib.parseFragment(render_variables(record["html"]), namespaceHTMLElements=False)
    assert len(fragment.findall(".//thead/tr")) == 1
    assert len(fragment.findall(".//tbody/tr")) == len(DEMO_TABLE_ROWS)
    assert len(fragment.findall(".//tfoot/tr")) == 3
    for row, item in zip(fragment.findall(".//tbody/tr"), DEMO_TABLE_ROWS):
        assert ["".join(cell.itertext()) for cell in row] == list(item.values())
    assert fragment.find(".//tbody/tr/td/strong").text == "Brand identity refresh"
    assert fragment.find(".//tbody/tr/td[@style]").get("style") == "text-align:right;"
    assert fragment.find(".//col").get("style") == "width:55%;"
    response = client.post('/pdf/render', json={'templateId': record['id'], 'documentId': 'demo-invoice'})
    assert response.status_code == 200
    text = " ".join(PdfReader(io.BytesIO(response.content)).pages[0].extract_text().split())
    for item in DEMO_TABLE_ROWS:
        assert text.count(item["{Item Description}"]) == 1
        for value in item.values():
            assert value in text
    assert text.count("Subtotal") == 1
    assert "VAT (20%)" in text
    assert DEMO_VARIABLE_VALUES["{Subtotal}"] in text
    assert DEMO_VARIABLE_VALUES["{Tax Amount}"] in text
    assert DEMO_VARIABLE_VALUES["{Total}"] in text
    assert "{Item" not in text
    assert "{Total}" not in text
    assert client.get(f"/templates/{record['id']}").json()["html"] == record["html"]
    assert len(html5lib.parseFragment(record["html"], namespaceHTMLElements=False).findall(".//tbody/tr")) == 1


def test_empty_items_keep_header_footer_and_static_rows():
    html = TABLE_HTML.replace("</tbody>", '<tr><td colspan="4">Static note</td></tr></tbody>')
    fragment = html5lib.parseFragment(render_variables(html, rows=[]), namespaceHTMLElements=False)
    assert len(fragment.findall(".//thead/tr")) == 1
    assert len(fragment.findall(".//tbody/tr")) == 1
    assert fragment.find(".//tbody/tr/td").text == "Static note"
    assert len(fragment.findall(".//tfoot/tr")) == 3
    assert "{Item" not in "".join(fragment.itertext())


def test_footer_is_moved_after_body_even_without_variables():
    html = '<table><tfoot><tr><td>Total</td></tr></tfoot><tbody><tr><td>Static item</td></tr></tbody></table>'
    fragment = html5lib.parseFragment(render_variables(html), namespaceHTMLElements=False)
    assert [child.tag for child in fragment[0]] == ["tbody", "tfoot"]


def test_merged_row_groups_repeat_together_with_safe_item_text():
    html = '<table><thead><tr><th>{Item Description}</th><th>Amount</th></tr></thead><tbody><tr><td rowspan="2"><strong>{Item Description}</strong></td><td>{Item Rate}</td></tr><tr><td>{Item Amount}</td></tr><tr><td colspan="2">{Total}</td></tr></tbody></table>'
    items = [
        {"{Item Description}": '<script>x</script> & {Company Name}', "{Item Rate}": "$1.00", "{Item Amount}": "$2.00"},
        {"{Item Description}": "Second", "{Item Rate}": "$3.00", "{Item Amount}": "$4.00"},
    ]
    fragment = html5lib.parseFragment(render_variables(html, rows=items), namespaceHTMLElements=False)
    rows = fragment.findall(".//tbody/tr")
    assert len(rows) == 5
    assert rows[0][0].get("rowspan") == rows[2][0].get("rowspan") == "2"
    assert rows[0][0][0].text == '<script>x</script> & {Company Name}'
    assert rows[1][0].text == "$2.00"
    assert rows[2][0][0].text == "Second"
    assert rows[3][0].text == "$4.00"
    assert rows[4][0].text == DEMO_VARIABLE_VALUES["{Total}"]
    assert fragment.find(".//script") is None
    assert fragment.find(".//thead/tr/th").text == "{Item Description}"


def test_item_rows_do_not_repeat_for_attribute_or_cross_cell_placeholders():
    html = '<table><tbody><tr><td><a href="https://example.com/{Item Description}">Link</a></td></tr><tr><td>{Item </td><td>Description}</td></tr><tr><td>{Item Unknown}</td></tr></tbody></table>'
    fragment = html5lib.parseFragment(render_variables(html), namespaceHTMLElements=False)
    assert len(fragment.findall(".//tbody/tr")) == 3
    assert fragment.find(".//a").get("href") == "https://example.com/{Item Description}"
    assert "{Item Unknown}" in "".join(fragment.itertext())


@pytest.mark.parametrize("count", [13, 20, 30, 50, 125])
def test_many_items_use_remaining_page_space_and_keep_rows_and_footer(client, count):
    items = [{**DEMO_TABLE_ROWS[i % len(DEMO_TABLE_ROWS)], "{Item Description}": f"Line{i:03d}", "{Item Amount}": f"End{i:03d}"} for i in range(count)]
    intro = "<h1>Invoice introduction</h1><p>" + "<br>".join(["Company details"] * 10) + "</p><p>" + "<br>".join(["Client details"] * 6) + "</p>"
    html = render_variables(intro + TABLE_HTML.replace("</strong></td>", "</strong><br>Continued description</td>", 1), rows=items)
    response = render_saved_pdf(client, body(html))
    assert response.status_code == 200
    pdf = PdfReader(io.BytesIO(response.content))
    assert len(pdf.pages) > 1
    pages = [" ".join(page.extract_text().split()) for page in pdf.pages]
    assert "Invoice introduction" in pages[0]
    assert "Line000" in pages[0]
    text = " ".join(pages)
    for i in range(count):
        assert text.count(f"Line{i:03d}") == 1
        assert text.count(f"End{i:03d}") == 1
        assert next(p for p in pages if f"Line{i:03d}" in p) == next(p for p in pages if f"End{i:03d}" in p)
    for page in pages:
        if "Line" in page:
            assert page.count("Description") == 1
            assert page.count("Qty") == 1
            assert page.count("Rate") == 1
            assert page.count("Amount") == 1
    assert text.count("Subtotal") == 1
    assert text.count("VAT (20%)") == 1
    assert text.count("Total due") == 1
    assert text.index(f"End{count - 1:03d}") < text.index("Subtotal")
    assert next(p for p in pages if "Subtotal" in p) == next(p for p in pages if "Total due" in p)
