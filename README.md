# rich-editor-concept

A Vite + React demo for a paged rich-text editor built with CKEditor 5 multi-root editing.

## Requirements

- Node.js 20+ recommended
- npm 10+ recommended

## Install

```bash
npm install
```

## Run in Development

```bash
npm run dev
```

Vite will print a local URL, usually:

```text
http://localhost:5173
```

Open that URL in your browser to use the editor demo.

## Build for Production

```bash
npm run build
```

The production bundle is written to:

```text
dist/
```

## Preview the Production Build

```bash
npm run preview
```

This serves the built app locally so you can verify the production output.

## What the Demo Includes

- CKEditor 5 shared toolbar
- True page-based editing roots
- Page size, orientation, and margin controls
- Per-page rulers
- Add page and delete page actions
- Browser print flow for PDF generation

## Main Files

- [`src/features/rich-editor/EditorDemoPage.jsx`](./src/features/rich-editor/EditorDemoPage.jsx)
- [`src/features/rich-editor/RichTemplateEditor.jsx`](./src/features/rich-editor/RichTemplateEditor.jsx)
- [`src/features/rich-editor/components/PagedWorkspace.jsx`](./src/features/rich-editor/components/PagedWorkspace.jsx)
- [`src/features/rich-editor/lib/pdfDocument.js`](./src/features/rich-editor/lib/pdfDocument.js)

## Notes

- The project currently uses CKEditor with `licenseKey: "GPL"`.
- `npm run build` is the main validation command used in this repo.
