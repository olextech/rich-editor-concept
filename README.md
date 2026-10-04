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
- Save creates or updates the selected template in SQLite. PDF exports the current draft, including changes that have not been saved. Print uses the same page dimensions and shared document styles.
- Browser drafts preserve each template's HTML, name, and settings across switches and reloads. A failed backend request leaves the draft available. Drafts are local to this browser.
- The variables panel inserts placeholders such as `{Company Name}` and `{Client Email}`. All five Company and five Client fields use sample values from `shared/variable-values.json` in browser print and draft/saved PDF exports. Editing, Source, and saved templates retain the placeholders. Legal entity and unknown placeholders remain unchanged.
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

`initialHtml` initializes an edit session; change `documentKey` to load another document or an external revision. The host owns page settings, saving, template selection, and status messages. `showVariables` defaults to false. Pass a `variableValues` object keyed by the complete placeholder (for example, `{ "{Company Name}": "Northwind Studio" }`) to resolve browser print text. `TemplateEditorApp` supplies the demo's storage, controls, and sample values; the demo backend uses the same sample values for PDF rendering.

Pass `variableRows` as an array of objects keyed by the item placeholders to repeat table body rows in browser print. Omitting this prop leaves item placeholders in place; an empty array removes the template body rows. Headers and footer rows remain. Connected rows with merged cells are repeated together so row spans remain valid. The demo supplies thirteen sample items to both export paths.

## Validation and rendering

`shared/html-contract.json` defines the tag, attribute, class, and CSS subset used by frontend and backend validation. HTML outside that subset is rejected before applying Source, saving, or rendering. Accepted markup may be normalized by CKEditor. Page breaks use `<div data-page-break="true"></div>`; the previous paragraph/span representation is also accepted and normalized.

Uploaded PNG/JPEG/GIF/WebP images are embedded as data URLs. Remote images, SVG, scripts, event handlers, iframes, CSS resource URLs, and arbitrary positioning are rejected. The PDF fetcher cannot fetch network or local-file resources. Images are limited to 5 MB and 20 megapixels; HTML is limited to 8 MB.

`shared/document.css` controls typography and structural spacing in the editor and PDF renderer. Preview uses the CSS-standard conversion of 96 pixels per inch. Tables, paragraphs, and images are measured against the printable area. An indivisible oversized block, such as a table with spanning rows taller than a page, displays a layout error and blocks export until reduced or divided in Source.

The entire document uses one CKEditor editable and one model root. Paper sheets and rulers sit behind that continuous canvas. Automatic page gaps are editing-view UI elements; they never split canonical paragraphs or add entries to undo history. Arrow keys, Shift selection, Select All, Backspace, and Delete work across page boundaries. Explicit page breaks can be removed with Backspace at the start of the following paragraph or Delete at the end of the preceding paragraph. Only the workspace scrolls; individual pages have no scroll containers. Browser print renders canonical HTML with the same paper settings as server PDF export.

Variable substitution affects visible text only, including placeholders split across inline formatting. Values are escaped as text and are not substituted in HTML attributes or across paragraphs, table cells, or line breaks. Resolved values can change line wrapping and automatic pagination in the output; explicit page breaks are preserved.

Print and PDF tables use the space remaining on the current page and continue across subsequent pages between rows. Normal rows stay together, column headers repeat, and footer totals appear once after the last item. Explicit `tfoot` groups stay together.

Table cells share the editor's `0.4em` padding and omit the trailing paragraph margin in all three renderers. Identical content and column widths therefore use the same row spacing; resolved variables may still add wrapped lines.

Chrome and Edge are the supported editing baseline. Firefox is best effort; Safari is unsupported. Browser and system font availability can affect pagination. Use the same fonts on frontend and backend for consistent output. This is a structural editor, not a full desktop publishing layout engine.

## API

- `GET /templates?q=...` lists template summaries.
- `POST /templates` creates a template.
- `GET`, `PUT`, `DELETE /templates/{id}` read, update, or delete a template.
- `POST /templates/{id}/pdf` exports the saved version.
- `POST /pdf/render` exports a draft without storing it.
- `GET /health` reports backend availability.

Create/update payloads contain `name`, `html`, and `pageSettings` with `pageSize`, `orientation`, and `margins.top/right/bottom/left`. Invalid payloads return 400, unsupported HTML returns 422, and missing templates return 404. PDF responses use `application/pdf`. Interactive API docs are at http://127.0.0.1:8000/docs.

## Verification

```bash
npx playwright install chromium
npm test
npm run test:backend
npm run build
```

The browser suite starts isolated servers on ports 5174 and 8001 and uses `backend/test-templates.db`. It covers document switching, reload recovery, source validation, manual breaks, cross-page keyboard navigation and selection, paragraph joins, blank pages, undo, geometry, automatic reflow, overflow, CRUD, PDF downloads, and preview/print/PDF structural agreement. Backend tests use temporary databases and exercise validation, persistence, resource isolation, and PDF dimensions.

For deployment, set `VITE_API_URL` at build time or route `/api` to the backend. `npm run build` writes to `dist/`; `npm run preview` previews the frontend build. CKEditor is configured with `licenseKey: "GPL"`; the embedding application's licensing must be compatible with that choice.
