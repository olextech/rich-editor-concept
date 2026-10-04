"""Render template variables without changing the stored template or markup."""
import json
import re
from copy import deepcopy
from pathlib import Path

import html5lib

SHARED = Path(__file__).resolve().parents[3] / "shared"
TABLE_VARIABLES = json.loads((SHARED / "table-variables.json").read_text())
DEMO_VARIABLE_VALUES = {
    **json.loads((SHARED / "variable-values.json").read_text()),
    **TABLE_VARIABLES["footerValues"],
}
DEMO_TABLE_ROWS = TABLE_VARIABLES["rows"]
INLINE_TAGS = {"span", "strong", "b", "em", "i", "u", "s", "sub", "sup", "a"}
TOKEN = re.compile(r"\{[^{}\r\n]+\}")


def for_each_text_run(root, callback, values=None, contexts=None, skip_tables=False):
    contexts = {} if contexts is None else contexts
    values = {} if values is None else values
    nodes = []
    current_values = values

    def flush():
        if nodes:
            callback(nodes, current_values)
        nodes.clear()

    def append(element, attribute, context):
        nonlocal current_values
        if getattr(element, attribute):
            nodes.append((element, attribute))
            current_values = context

    def visit(element, context):
        boundary = element.tag not in INLINE_TAGS
        if boundary:
            flush()
        if skip_tables and element is not root and element.tag == "table":
            return
        next_context = contexts.get(element, context)
        append(element, "text", next_context)
        for child in element:
            visit(child, next_context)
            append(child, "tail", next_context)
        if boundary:
            flush()

    visit(root, values)


def has_item_variables(row):
    found = False

    def check(nodes, values):
        nonlocal found
        text = "".join(getattr(element, attribute) for element, attribute in nodes)
        found = found or any(token in text for token in TABLE_VARIABLES["bodyVariables"])

    for_each_text_run(row, check, skip_tables=True)
    return found


def row_groups(section):
    rows = [element for element in section if element.tag == "tr"]
    start = 0
    while start < len(rows):
        end = start
        index = start
        while index <= end:
            for cell in rows[index]:
                span = int(cell.get("rowspan", "1"))
                span = len(rows) - index if span == 0 else span
                end = min(len(rows) - 1, max(end, index + span - 1))
            index += 1
        yield rows[start:end + 1]
        start = end + 1


def render_variables(html, values=None, rows=None):
    values = DEMO_VARIABLE_VALUES if values is None else values
    rows = DEMO_TABLE_ROWS if rows is None else rows
    if "{" not in html and not re.search(r"<tfoot[\s>]", html, re.I):
        return html
    fragment = html5lib.parseFragment(html, namespaceHTMLElements=False)
    contexts = {}

    def expand(element):
        if element.tag == "table":
            for child in list(element):
                if child.tag == "tfoot":
                    element.remove(child)
                    element.append(child)
        if element.tag in {"table", "tbody"}:
            for group in row_groups(element):
                if not any(has_item_variables(row) for row in group):
                    continue
                position = list(element).index(group[0])
                tail = group[-1].tail
                for item in rows:
                    for row in group:
                        clone = deepcopy(row)
                        element.insert(position, clone)
                        position += 1
                        contexts[clone] = {**values, **item}
                if rows:
                    clone.tail = tail
                for row in group:
                    element.remove(row)
        for child in element:
            expand(child)

    expand(fragment)

    def replace(nodes, context):
        slots = []
        text = ""
        for element, attribute in nodes:
            start = len(text)
            text += getattr(element, attribute)
            slots.append((element, attribute, start, len(text)))
        # Replace in reverse order to preserve original offsets. Retain the
        # formatting of the first character when a token crosses inline tags.
        for match in reversed(list(TOKEN.finditer(text))):
            value = context.get(match[0])
            if not isinstance(value, str):
                continue
            inserted = False
            for element, attribute, start, end in slots:
                if end <= match.start() or start >= match.end():
                    continue
                current = getattr(element, attribute)
                first = max(0, match.start() - start)
                last = min(end, match.end()) - start
                setattr(element, attribute, current[:first] + ("" if inserted else value) + current[last:])
                inserted = True
    for_each_text_run(fragment, replace, values, contexts)
    return html5lib.serialize(fragment, quote_attr_values="always", omit_optional_tags=False, alphabetical_attributes=True)
