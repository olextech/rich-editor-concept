"""Load document data on the server, independently of the selected template.

The local demo has one document. Replace this lookup with the business-record
repository when integrating the editor into an application.
"""
from copy import deepcopy
import json
from pathlib import Path

SHARED = Path(__file__).resolve().parents[3] / "shared"
TABLE_VARIABLES = json.loads((SHARED / "table-variables.json").read_text())
DEMO_VARIABLE_VALUES = {
    **json.loads((SHARED / "variable-values.json").read_text()),
    **TABLE_VARIABLES["footerValues"],
}
DEMO_TABLE_ROWS = TABLE_VARIABLES["rows"]

DEMO_DOCUMENT_ID = "demo-invoice"


def get_document(document_id):
    if document_id != DEMO_DOCUMENT_ID:
        raise LookupError("Document not found.")
    return {"values": deepcopy(DEMO_VARIABLE_VALUES), "rows": deepcopy(DEMO_TABLE_ROWS)}
