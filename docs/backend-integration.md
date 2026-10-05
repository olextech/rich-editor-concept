# Backend integration

The editor component does not need this backend. The host application owns
template storage and PDF requests. This FastAPI service is an optional adapter.
PDF generation accepts only saved template and business document IDs:

```json
{ "templateId": 42, "documentId": "invoice-2026-104" }
```

Create an application with a document lookup from your project:

```python
from app.main import create_app


def load_document(document_id):
    invoice = invoice_repository.get(document_id)
    if invoice is None:
        raise LookupError("Document not found.")
    return {
        "values": {
            "{Client Name}": invoice.customer.name,
            "{Invoice Number}": invoice.number,
            "{Total}": invoice.formatted_total,
        },
        "rows": [
            {"{Item Description}": item.description}
            for item in invoice.items
        ],
    }


app = create_app(
    database_url="sqlite:///templates.db",
    document_lookup=load_document,
    cors_origins=["https://your-project.example.com"],
)
```

The lookup is synchronous and runs in the PDF route's worker thread. It returns
variable values and item rows in the format above. The backend inserts these
values into the saved template and repeats the template's item row. Calculate
business totals in the host service before returning the data. A `LookupError`
produces a 404 response. Without an injected lookup, only the `demo-invoice`
sample document is available.

Variable values must be strings. Repeated rows use the item variable names in
`shared/table-variables.json`; custom row tokens alone do not trigger repetition.

`database_url` defaults to `DATABASE_URL`, or the local
`backend/templates.db` file. Database tables are created during FastAPI lifespan
startup. Importing the module or calling `create_app()` does not create a
database file. Run the application's lifespan when using test clients or mounting
the API into another application. A parent application's lifespan must start and
stop the mounted application's lifespan explicitly. Schema creation does not
replace database migrations when the schema changes.

`cors_origins` replaces the default local origins. An empty list disables
cross-origin browser access. If the argument is omitted, `CORS_ORIGINS` can
provide a comma-separated origin list. If neither is configured, the defaults
are `http://localhost:5173` and `http://127.0.0.1:5173`. Existing allowed request
methods stay unchanged. The API permits `Content-Type` and `Authorization`
request headers. The frontend client can supply bearer tokens through its
`headers` option.

For a host that uses cookie sessions across origins, enable credentials
explicitly on the backend and frontend:

```python
app = create_app(
    document_lookup=load_document,
    cors_origins=["https://your-project.example.com"],
    cors_allow_credentials=True,
)
```

```js
const client = createTemplateClient({
  baseUrl: "https://your-api.example.com",
  credentials: "include",
});
```

`cors_allow_credentials` defaults to `False`. Specify the actual host origins;
do not use a wildcard origin for cookie sessions. The host controls cookie
settings and session validation.

Use the larger project's authentication and record-access rules when exposing
these endpoints. The adapter supplies template CRUD and rendering; it does not
supply an authentication system.
