import base64
import io
import json
import math
import re
from pathlib import Path
import html5lib
from PIL import Image

CONTRACT = json.loads((Path(__file__).resolve().parents[3] / "shared/html-contract.json").read_text())
IMAGE_URL = re.compile(r"data:image/(png|jpeg|gif|webp);base64,([a-z\d+/=\s]+)", re.I)

class HtmlValidationError(ValueError):
    pass


def validate_html(html):
    if not isinstance(html, str) or len(html) > CONTRACT["maxHtmlLength"]:
        raise HtmlValidationError("HTML must be text smaller than 8 MB.")
    parser = html5lib.HTMLParser(namespaceHTMLElements=False)
    fragment = parser.parseFragment(html)
    # Reject parse errors rather than allowing active markup to disappear during parsing.
    if any(error[1] not in ("expected-closing-tag-but-got-eof",) for error in parser.errors):
        raise HtmlValidationError("Malformed HTML. Check the element structure and attributes.")
    parents = {child: parent for parent in fragment.iter() for child in parent}
    for element in fragment.iter():
        tag = element.tag
        if tag == "DOCUMENT_FRAGMENT" or not isinstance(tag, str):
            continue
        if tag not in CONTRACT["tags"]:
            raise HtmlValidationError(f"Unsupported HTML element: <{tag}>.")
        allowed = CONTRACT["attributes"]["*"] + CONTRACT["attributes"].get(tag, [])
        for name, value in element.attrib.items():
            if name not in allowed:
                raise HtmlValidationError(f"Unsupported attribute {name} on <{tag}>.")
            if name == "class" and any(c not in CONTRACT["classes"] for c in value.split()):
                raise HtmlValidationError(f"Unsupported class on <{tag}>.")
            if name == "style":
                validate_style(value)
            if name == "href" and not re.match(r"^(https?://|mailto:|tel:|#)", value, re.I):
                raise HtmlValidationError("Unsupported link URL.")
            if name == "src":
                validate_image(value)
            if name == "data-page-break" and value != "true":
                raise HtmlValidationError('Page break markers must have data-page-break="true".')
            if name in ("width", "height", "colspan", "rowspan", "span") and (not re.fullmatch(r"\d+", value) or int(value) > 10000):
                raise HtmlValidationError(f"Invalid {name}.")
            if name in ("start", "value") and not re.fullmatch(r"-?\d{1,6}", value):
                raise HtmlValidationError(f"Invalid {name}.")
            if name == "target" and value not in ("_blank", "_self"):
                raise HtmlValidationError("Unsupported link target.")
            if name == "rel" and not re.fullmatch(r"(?:noopener|noreferrer|nofollow|\s)*", value):
                raise HtmlValidationError("Unsupported link relationship.")
            if name == "scope" and value not in ("row", "col", "rowgroup", "colgroup"):
                raise HtmlValidationError("Unsupported table scope.")
            if name == "type" and value not in ("1", "a", "A", "i", "I"):
                raise HtmlValidationError("Unsupported list type.")
        if "data-page-break" in element.attrib:
            if len(element) or (element.text or "").strip():
                raise HtmlValidationError("A page break marker must be empty.")
            parent = parents[element]
            legacy = tag == "span" and parent.tag == "p" and len(parent) == 1 and not (parent.text or "").strip() and not (element.tail or "").strip() and parents[parent] is fragment
            if parent is not fragment and not legacy:
                raise HtmlValidationError("Page breaks must be top-level blocks.")
    # Normalize browser-compatible markup and old page-break markers.
    for element in list(fragment):
        if element.tag == "p" and len(element) == 1 and element[0].attrib.get("data-page-break") == "true":
            tail = element.tail
            element.clear()
            element.tail = tail
            element.tag = "div"
            element.set("data-page-break", "true")
        if element.attrib.get("data-page-break") == "true":
            element.tag = "div"
            element.attrib.clear()
            element.set("data-page-break", "true")
    return html5lib.serialize(fragment, quote_attr_values="always", omit_optional_tags=False, alphabetical_attributes=True)


def validate_style(style):
    if re.search(r"[\\{}@<>]|/\*|url\s*\(|expression\s*\(|var\s*\(", style, re.I):
        raise HtmlValidationError("Unsupported CSS in source HTML.")
    for declaration in filter(str.strip, style.split(";")):
        property, separator, value = declaration.partition(":")
        property, value = property.strip().lower(), value.strip()
        supported_value = valid_aspect_ratio(value) if property == "aspect-ratio" else re.fullmatch(r"[\w\s#.,%()'\"+-]+", value) and not re.search(r"(?:^|\s)-\d", value)
        if not separator or property not in CONTRACT["styles"] or not value or not supported_value:
            raise HtmlValidationError(f"Unsupported CSS property or value: {property}.")
        if re.search(r"[()]", value) and not re.fullmatch(r"(?:rgba?|hsla?)\([\d\s.,%]+\)", value, re.I):
            raise HtmlValidationError("Only color functions are supported in CSS.")


def valid_aspect_ratio(value):
    if value.lower() == "auto":
        return True
    ratio = re.fullmatch(r"(?:auto\s+)?(\d*\.?\d+)(?:\s*/\s*(\d*\.?\d+))?", value, re.I)
    return bool(ratio) and all(math.isfinite(number) and number > 0 for number in (float(ratio[1]), float(ratio[2] or "1")))


def validate_image(url):
    match = IMAGE_URL.fullmatch(url)
    if not match:
        raise HtmlValidationError("Images must be uploaded PNG, JPEG, GIF, or WebP files.")
    try:
        data = base64.b64decode(re.sub(r"\s", "", match[2]), validate=True)
        if len(data) > 5_000_000:
            raise ValueError("Image is too large")
        with Image.open(io.BytesIO(data)) as image:
            if image.width * image.height > 20_000_000 or image.format.lower() != match[1].lower():
                raise ValueError("Unsupported image dimensions or format")
            image.verify()
    except Exception as error:
        raise HtmlValidationError("Invalid image or image larger than 5 MB / 20 megapixels.") from error
