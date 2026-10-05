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

```jsx
import { DocumentEditor } from "./src/features/document-editor/DocumentEditor";

<DocumentEditor
  documentKey={template.id}
  initialHtml={template.html}
  pageSettings={template.pageSettings}
  onChange={setHtml}
  renderHeader={({ isReady, error }) => (
    <button disabled={!isReady || Boolean(error)} onClick={save}>
      Save
    </button>
  )}
/>;
```

`initialHtml` initializes an edit session; change `documentKey` to load another document or an external revision. The host owns page settings, saving, template selection, output actions, and status messages. `showVariables` defaults to false. The optional `variableValues` object supplies sample tooltips in the variables panel; it does not generate document content. Template variables remain unchanged in the editor.

`TemplateEditorApp` accepts a `documentId` prop, which defaults to `"demo-invoice"`. The backend document service currently exposes this one sample record with thirteen items. The document ID is independent of the template ID. Replace `backend/app/services/document_service.py` with a business-record lookup when integrating the editor. The backend fills variables and repeats body rows, including connected rows with merged cells. Headers and footer rows remain. No document values or rows are accepted in the PDF request.

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
npm run build
```

The browser suite starts isolated servers on ports 5174 and 8001 and uses `backend/test-templates.db`. It covers document switching, reload recovery, source validation, manual breaks, cross-page keyboard navigation and selection, paragraph joins, blank pages, undo, geometry, automatic reflow, overflow, CRUD, PDF downloads, save confirmations, cancellation and failure recovery, and printing the returned PDF through a native viewer frame. Headless tests use full Chromium because the headless shell has no native PDF viewer. They replace the final print call to avoid a system dialog and verify that the frame contains the backend PDF. Backend PDF geometry is also compared with editor geometry. Backend tests use temporary databases and exercise validation, persistence, resource isolation, and PDF dimensions.

For deployment, set `VITE_API_URL` at build time or route `/api` to the backend. `npm run build` writes to `dist/`; `npm run preview` previews the frontend build. CKEditor is configured with `licenseKey: "GPL"`; the embedding application's licensing must be compatible with that choice.
