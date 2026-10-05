# Implemented design: document editor and backend PDF generation

This document replaces the initial design proposal. See [architecture review](../../docs/architecture-review.md) for findings and [embedding guide](../../docs/embedding.md) for the public interface.

## Module boundaries

- `src/editor`: public React entry, type declarations, scoped CSS, and optional backend client/output helpers.
- `src/features/document-editor`: editing engine, CKEditor plugins, dialogs, canonical HTML validation, geometry, pagination, and keyboard navigation.
- `src/demo`: sample templates, variable groups, template selection, browser drafts, saving, and output confirmation.
- `shared`: supported HTML contract, document typography, and demo business data. Browser builds scope document CSS; backend rendering uses it inside the PDF.
- `backend/app`: app factory, template storage, validation, document lookup, variable filling, row expansion, and WeasyPrint rendering.

## Editor interface

The host supplies a license key, initial HTML, page settings, optional variable groups, read-only state, and callbacks. The component fills its parent container. `documentKey` identifies an editing session. Changes to `initialHtml` with the same key do not replace current edits or undo history. Page settings and read-only mode update without recreating the session.

The editor returns canonical HTML through `onChange` and readiness, layout errors, and page count through `onStateChange`. It does not fetch records, save templates, use browser draft storage, or generate final document content.

One CKEditor model root and editable hold the document. Paper sheets and rulers are presentation. Automatic gaps do not enter saved HTML or undo history. Manual breaks remain in canonical HTML. Existing controller, paginator, and navigation boundaries remain in use.

## Output flow

1. The host checks whether the selected template is new or has unsaved changes.
2. A confirmation offers Save and download or Save and print, plus Cancel.
3. The host saves HTML, name, and page settings. A failed save stops output.
4. The host sends `{templateId, documentId}` to `POST /pdf/render`.
5. The backend loads the saved template and business document, fills text variables and item rows, validates the result, and returns PDF bytes.
6. The host downloads the Blob or loads it in the native PDF viewer and calls print.

There is no PDF.js dependency or draft PDF endpoint. The browser does not resolve business variables for output. The final PDF may have a different page count after variable filling.

## Backend integration

`create_app` accepts a database URL, synchronous document lookup, and CORS origins. Schema initialization occurs at application startup. The lookup returns values and rows for the business document ID. The default lookup exposes the demo invoice. The host owns authentication, authorization, tenancy, storage migrations, and concurrent save policy.

Template CRUD remains at `/templates` and `/templates/{id}`. `GET /health` reports availability. HTML and image limits, resource restrictions, and PDF validation remain enforced.

## Packaging and validation

The private package exports the component, page defaults and validation, type declarations, scoped stylesheet, and optional client entry. React, ReactDOM, and the exact supported CKEditor version are peer dependencies. The library and demo have separate build outputs.

Browser tests cover editing and output plus bounded host layout, independent instances, variables, read-only behavior, hidden resizing, and cleanup. Backend tests cover data lookup, persistence, CORS, initialization, validation, and PDF behavior. Package checks cover tarball contents, consumer build, public imports, types, and server rendering. Native print dialogs need a separate check in supported browsers.
