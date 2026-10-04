"""Measure rendered table row heights in CSS pixels (PDF coordinates use points)."""
import json
import sys

import fitz


with fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf") as pdf:
    print(json.dumps([
        (row.bbox[3] - row.bbox[1]) * 96 / 72
        for page in pdf
        for table in page.find_tables(strategy="lines_strict").tables
        for row in table.rows
    ]))
