# Papercraft document editor

A reusable React editor built on CKEditor 5 with a paged workspace, rulers, source editing, SQLite template storage, and server-rendered PDF export. The demo includes invoice, estimate, and work-order examples; the editor itself accepts any supported document HTML.

## Run locally

Requires Node.js 22.12+ and Python 3.10+. PDF rendering also needs Pango and its native libraries. On macOS these can be installed with `brew install pango`; see the [WeasyPrint installation documentation](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html).

```bash
npm ci
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

Start the backend:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

On Apple Silicon macOS, prefix that command with `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` if WeasyPrint cannot find the native libraries.

In another terminal:

```bash
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the backend. `DATABASE_URL` overrides the default database at `backend/templates.db`; `API_PROXY_TARGET` overrides Vite's backend target. The backend has no authentication, as specified for this local demo.

## Editing and persistence

- Choose A4/A5, portrait/landscape, and non-negative integer margins in millimetres. Margins must leave room for content.
- Format text, insert and resize images, edit tables, or use Source for supported HTML.
- Insert → Page break inserts a manual break at the cursor; Add page appends a blank page. Manual breaks and intentional blank pages survive save, Source, and undo.
- Natural page boundaries are presentation only. They never become manual breaks in saved HTML. Oversized paragraphs and tables without row spans are divided for display and recombined for canonical storage.
- Save creates or updates the selected template in SQLite. PDF and Print use the saved template and backend document data. If the template is new or has unsaved changes, a dialog offers **Save and download** or **Save and print**, plus **Cancel**. Generation starts only after a successful save. PDF downloads the returned file. Print loads that file into an offscreen native PDF viewer and requests the browser print dialog; there is no PDF preview or PDF.js dependency.
- Browser drafts preserve each template's HTML, name, and settings across switches and reloads. A failed backend request leaves the draft available. Drafts are local to this browser.
- The variables panel inserts placeholders such as `{Company Name}` and `{Client Email}`. All five Company and five Client fields use sample values from `shared/variable-values.json` in backend PDF generation for both download and print. Editing, Source, and saved templates retain the placeholders. Legal entity and unknown placeholders remain unchanged.
- Invoice contains `{Invoice Number}`, `{Issue Date}`, and `{Due Date}`, using sample values `INV-2026-0042`, `2026-05-16`, and `2026-05-30` from the same shared file. The fresh Invoice example uses these placeholders in its header and payment reference.
- Table body contains `{Item Description}`, `{Item Qty}`, `{Item Rate}`, and `{Item Amount}`. Put them in the cells of one body row; print/PDF repeats that row for each sample item, preserving its styling and column widths. Table footer contains `{Subtotal}`, `{Tax Rate}`, `{Tax Amount}`, and `{Total}`. Footer rows are filled once. Sample items and their matching totals live in `shared/table-variables.json`; the fresh Invoice example uses these placeholders.

## Reuse the editor

Build a local package with `npm run build:library`, then run `npm pack`. Install the tarball in the host project. The package exports a typed React component and precompiled, scoped CSS. The host does not need Tailwind.

```jsx
import { DocumentEditor } from "rich-editor-concept";
import "rich-editor-concept/styles.css";

<div style={{ height: 680 }}>
  <DocumentEditor
    licenseKey={licenseKey}
    documentKey={template.id}
    initialHtml={template.html}
    pageSettings={template.pageSettings}
    onChange={setHtml}
    onStateChange={setEditorState}
    variableGroups={variableGroups}
    readOnly={!canEdit}
  />
</div>;
```

`initialHtml` starts an edit session. Change `documentKey` to load another document or an external revision. The host owns template selection, storage, saving, authentication, and output controls. Variable groups are host data; an empty list hides the panel. Tooltip values do not generate document content.

The optional `rich-editor-concept/client` entry provides `createTemplateClient`, `downloadPdf`, and `printPdf`. It supports a host API URL, authentication headers, credentials, custom fetch, and request cancellation. It sends only saved template and document IDs for PDF generation.

See [the embedding guide](docs/embedding.md), [the code review](docs/architecture-review.md), and [backend integration](docs/backend-integration.md). Open `/examples/embedded-editor.html` on the dev server to test two independent editors in a host page.

The demo application is in `src/demo`. It passes a `documentId` that defaults to `"demo-invoice"`. Connect real business data with `create_app(document_lookup=load_document, cors_origins=[...])`; keep access checks in the host application. PDF requests do not accept document values or rows.

## Validation and rendering

`shared/html-contract.json` defines the tag, attribute, class, and CSS subset used by frontend and backend validation. HTML outside that subset is rejected before applying Source, saving, or rendering. Accepted markup may be normalized by CKEditor. Page breaks use `<div data-page-break="true"></div>`; the previous paragraph/span representation is also accepted and normalized.

Uploaded PNG/JPEG/GIF/WebP images are embedded as data URLs. Remote images, SVG, scripts, event handlers, iframes, CSS resource URLs, and arbitrary positioning are rejected. The PDF fetcher cannot fetch network or local-file resources. Images are limited to 5 MB and 20 megapixels; HTML is limited to 8 MB.

`shared/document.css` controls typography and structural spacing in the editor and PDF renderer. Preview uses the CSS-standard conversion of 96 pixels per inch. Tables, paragraphs, and images are measured against the printable area. An indivisible oversized block, such as a table with spanning rows taller than a page, displays a layout error and blocks export until reduced or divided in Source.

The entire document uses one CKEditor editable and one model root. Paper sheets and rulers sit behind that continuous canvas. Automatic page gaps are editing-view UI elements; they never split canonical paragraphs or add entries to undo history. Arrow keys, Shift selection, Select All, Backspace, and Delete work across page boundaries. Explicit page breaks can be removed with Backspace at the start of the following paragraph or Delete at the end of the preceding paragraph. Only the workspace scrolls; individual pages have no scroll containers. Download and print use the same backend PDF renderer. The editor's live pagination remains a frontend presentation function.

Variable substitution affects visible text only, including placeholders split across inline formatting. Values are escaped as text and are not substituted in HTML attributes or across paragraphs, table cells, or line breaks. Resolved values can change line wrapping and automatic pagination in the output; explicit page breaks are preserved.

Print and PDF tables use the space remaining on the current page and continue across subsequent pages between rows. Normal rows stay together, column headers repeat, and footer totals appear once after the last item. Explicit `tfoot` groups stay together.

Table cells share the editor's `0.4em` padding and omit the trailing paragraph margin in the editor and backend PDF renderer. Identical content and column widths therefore use the same row spacing; resolved variables may still add wrapped lines.

Chrome and Edge are the supported editing and native-print baseline. Native print requires a browser with PDF viewing enabled. A browser that cannot load or print the PDF reports an error and offers download through the PDF button. Native print dialogs require a separate browser smoke check; automated tests cannot confirm physical printing. Some native viewers do not send `afterprint`, so their temporary frame and Blob URL remain available for up to five minutes before cleanup. Firefox is best effort; Safari is unsupported. Browser and system font availability can affect pagination. Use the same fonts on frontend and backend for consistent output. This is a structural editor, not a full desktop publishing layout engine.

## API

- `GET /templates?q=...` lists template summaries.
- `POST /templates` creates a template.
- `GET`, `PUT`, `DELETE /templates/{id}` read, update, or delete a template.
- `POST /pdf/render` generates a PDF from `{ "templateId": 1, "documentId": "demo-invoice" }`. Both fields are required. Draft HTML, page settings, values, and rows are rejected; the backend loads them from the saved template and document record. This replaces the former draft-render and saved-template PDF APIs.
- `GET /health` reports backend availability.

Create/update payloads contain `name`, `html`, and `pageSettings` with `pageSize`, `orientation`, and `margins.top/right/bottom/left`. Invalid payloads return 400, unsupported HTML returns 422, and missing templates or documents return 404. PDF responses use `application/pdf`. Interactive API docs are at http://127.0.0.1:8000/docs.

## Verification

```bash
npx playwright install chromium
npm test
npm run test:backend
npm run test:client
npm run build
npm run test:package
```

The browser suite starts isolated servers on ports 5174 and 8001 and uses `backend/test-templates.db`. It covers document switching, reload recovery, source validation, manual breaks, cross-page keyboard navigation and selection, paragraph joins, blank pages, undo, geometry, automatic reflow, overflow, CRUD, PDF downloads, save confirmations, cancellation and failure recovery, and printing the returned PDF through a native viewer frame. Headless tests use full Chromium because the headless shell has no native PDF viewer. They replace the final print call to avoid a system dialog and verify that the frame contains the backend PDF. Backend PDF geometry is also compared with editor geometry. Backend tests use temporary databases and exercise validation, persistence, resource isolation, and PDF dimensions.

For deployment, set `VITE_API_URL` at build time or route `/api` to the backend. `npm run build` writes the editor package to `dist/editor` and the demo to `dist/demo`. `npm run preview` previews the demo. The host supplies its CKEditor license key; the demo supplies `GPL`.
