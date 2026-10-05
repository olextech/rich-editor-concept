# Embed the document editor

The package supplies a React component for editing document templates. The host supplies HTML, page settings, variables, and a CKEditor license key. The host owns template selection, draft storage, saving, authentication, and PDF actions.

## Install the local package

Build and pack this repository:

```bash
npm run build:library
npm pack --pack-destination /private/tmp
```

In the host project, install the generated tarball and the required peer dependencies:

```bash
npm install /private/tmp/rich-editor-concept-0.0.0.tgz ckeditor5@47.6.1
```

The host must already supply matching React and ReactDOM versions, either React 18 or React 19. Use the exact CKEditor version declared by this package. Installing a second CKEditor version in the host can cause duplicate module errors. TypeScript hosts also need the React type declarations that match their React version.

The package is private. Creating and installing this local tarball does not publish it to a registry. The backend, demo templates, and demo persistence workflow are not part of the editor package.

The host does not need Tailwind. Import the package stylesheet once:

```jsx
import { DocumentEditor } from "rich-editor-concept";
import "rich-editor-concept/styles.css";
```

Supply a CKEditor key that is appropriate for your application. The demo uses `GPL`. This package does not grant a CKEditor license or establish that a larger application's license is compatible.

## Mount the editor

```jsx
import { useState } from "react";
import { DocumentEditor } from "rich-editor-concept";
import "rich-editor-concept/styles.css";

export function TemplateScreen({ template, licenseKey, saveTemplate }) {
  const [html, setHtml] = useState(template.html);
  const [editorState, setEditorState] = useState({
    isReady: false,
    error: "",
    pageCount: 1,
  });

  return (
    <section>
      <button
        disabled={!editorState.isReady || Boolean(editorState.error)}
        onClick={() => saveTemplate({ ...template, html })}
      >
        Save template
      </button>
      <div style={{ height: 680 }}>
        <DocumentEditor
          licenseKey={licenseKey}
          documentKey={`${template.id}:${template.revision}`}
          initialHtml={template.html}
          pageSettings={template.pageSettings}
          onChange={setHtml}
          onStateChange={setEditorState}
          ariaLabel={`Template: ${template.name}`}
        />
      </div>
    </section>
  );
}
```

Mount a new `TemplateScreen` for each selected template, or reset the host's draft state when its template changes. The editor does not reset the host's React state.

The editor fills its parent. Give the parent a height and allow it to shrink inside a flex layout with `min-height: 0`. Use `className` and `style` to configure the editor container. Only its workspace scrolls. It does not set the host page's background, typography, or height.

`initialHtml` is the starting content for an editing session. Changing it with the same `documentKey` does not replace active edits. Change `documentKey` to load a different template or an external revision. Use a stable key; a new key on every keystroke would recreate the session and clear undo history. Page settings and `readOnly` are reactive.

`onChange` supplies canonical HTML. It can also run during initialization if CKEditor normalizes the initial markup. The host must account for that normalization when it compares a draft with a saved template. Automatic page boundaries remain presentation only. Manual page breaks remain in the HTML.

`onStateChange` supplies `{ isReady, error, pageCount }`. Disable saving and output controls until `isReady` is true and `error` is empty. `pageCount` describes the editing canvas; filled variables can change the final PDF's page count. `renderHeader` receives the same state if the host wants controls inside the editor container. `message` accepts a host status element.

## Supply template variables

```jsx
<DocumentEditor
  licenseKey={licenseKey}
  documentKey={template.id}
  initialHtml={template.html}
  variableGroups={[
    {
      id: "customer",
      label: "Customer",
      variables: ["{Customer Name}", "{Customer Email}"],
    },
  ]}
  variableValues={{ "{Customer Name}": "Example customer" }}
  onChange={setHtml}
/>
```

An omitted or empty `variableGroups` list hides the panel. The panel appears when its editor container is at least 1000 pixels wide. Each group has an `id`, `label`, optional `description`, and placeholder strings in `variables`. Values supply tooltips only. The editor inserts placeholders as text and does not load business records or resolve variables.

Set `readOnly` to prevent edits. The host should also disable its save and mutation controls when its own permission rules require that.

## Saving, downloading, and printing

Keep the existing backend output contract:

```json
{ "templateId": 1, "documentId": "business-record-id" }
```

The frontend sends this request to `POST /pdf/render`. It does not send draft HTML, variable values, item rows, or page settings in that request. The backend loads the saved template and business document, fills the variables, and generates the PDF.

The host must implement this sequence:

1. Check whether the template is new or has unsaved changes.
2. If a save is necessary, show **Save and download** or **Save and print**, plus **Cancel**.
3. Save the current template HTML, name, and page settings. Stop if saving fails.
4. Request the PDF using the saved template ID and the business document ID.
5. Download the returned Blob or load it into the native browser PDF viewer and request printing.

The demo in `TemplateEditorApp` and `useTemplates` demonstrates this workflow. These application modules are not public editor exports. The optional `rich-editor-concept/client` entry supplies a configurable API client plus download and native print helpers. It does not supply template state, draft storage, or save confirmation. Adapt the workflow to the host's API, authentication, storage, and route lifecycle.

The backend currently supplies the sample record `demo-invoice`. Inject the larger application's synchronous business-record lookup when creating the API:

```python
from app.main import create_app

app = create_app(
    database_url=database_url,
    document_lookup=load_business_document,
    cors_origins=["https://app.example.com"],
)
```

`load_business_document(document_id)` must return `{"values": {...}, "rows": [...]}` or raise `LookupError` for an unavailable record. Values map placeholder strings to document data. Each row supplies the values for one repeated item. The application must enforce access to both the selected template and business document. `cors_origins=[]` disables cross-origin access for a same-origin deployment. `CORS_ORIGINS` can configure a comma-separated list when no explicit origins are supplied. See [backend integration](backend-integration.md) for bearer headers and cookie credentials.

There is no PDF.js dependency. Native printing requires an enabled browser PDF viewer. Verify the print dialog in each supported browser; an automated print-call check cannot verify a system dialog or physical printing. The editor canvas is a structural preview. The backend PDF is the final document.

## Styles, multiple instances, and server rendering

Editor CSS uses native `@scope` around editor containers and owned popup roots. The supported browser baseline is Chrome and Edge with `@scope` support. The stylesheet does not include an application-wide Tailwind reset. Context menus, tooltips, and CKEditor balloons keep the editor scope when rendered outside the container. Host CSS can still override inherited styles; verify the editor in the actual application shell.

Each instance owns its edit session, toolbar, dialogs, and layout. Give instances distinct `documentKey` values and accessible names. The host must isolate its own draft storage and business state by template, user, and tenant where applicable. The demo's browser draft storage is not a multi-user storage service.

The initial component render can run on the server. CKEditor and DOM-based pagination start after mount in the browser. Import the stylesheet through the host's normal CSS entry. In a framework that distinguishes server and client components, mount this interactive component from a client component. Do not use browser HTML validation helpers during server rendering.

## Integration checks

Before integrating a release, verify these cases in the host application:

- Two editors retain independent content, undo history, dialogs, and variable insertion.
- A bounded parent scrolls within the editor without changing the host layout.
- A hidden editor lays out correctly when it becomes visible.
- Document replacement and unmount during loading release the previous session.
- Read-only mode blocks changes through toolbar, Source, page actions, and variable insertion.
- Host CSS, menus, and dialogs do not change editor styling or focus behavior.
- Save confirmation precedes both output actions, and PDF requests contain only IDs.
- Download and native printing use the PDF returned by the backend.

Use the same document fonts in the browser and backend when output geometry matters. Very large documents and unusual font or line-height settings need application-specific testing. The package does not provide a full desktop publishing engine.
