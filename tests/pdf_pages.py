"""Inspect exported PDF structure for browser integration tests."""
import io
import json
import sys
from pypdf import PdfReader

pdf = PdfReader(io.BytesIO(sys.stdin.buffer.read()))
print(json.dumps([page.extract_text() for page in pdf.pages]))
