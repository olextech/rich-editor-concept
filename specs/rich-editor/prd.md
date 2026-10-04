# PRD: Paged WYSIWYG editor component for document templates in RO App

## 1. Summary

RO App will introduce a reusable paged WYSIWYG editor component for document templates. The component must let users edit page-based HTML templates inside the product while seeing a production-oriented preview without a mandatory separate preview step. The selected implementation path is `Option 2`: `CKEditor 5 + custom paged shell`, rather than a heavyweight embeddable document-editor suite, because document-editor licensing cost is out of scope for the first version.

The component must support page-aware editing, exact-enough preview under a defined `Structural fidelity` contract, horizontal and vertical rulers, explicit page breaks, portrait and landscape orientation, standard WYSIWYG tools, and source mode. The component is intentionally document-agnostic: invoice and act are reference use cases, not hardcoded scope boundaries. Access control, embedding context, and product-level visibility rules are explicitly out of scope for this component task.

## 2. Problem Statement

RO App needs a reusable editor component for printable HTML templates because ordinary rich-text editing does not provide enough confidence in page size, margins, page flow, and final printable output. Without a page-aware editor, users either work in external tools or edit templates inside the product without knowing how the result will actually paginate in print or PDF.

The problem is not solved by adding a generic text editor. RO App needs a component that:

- edits templates in a page-based workspace
- shows a production-oriented preview during editing
- supports horizontal and vertical rulers
- supports explicit page breaks
- preserves a familiar WYSIWYG editing experience
- remains realistic in licensing cost, total ownership cost, and implementation scope

## 3. Goals / Non-Goals

### Goals

- Provide a reusable React-compatible paged editor component for HTML document templates.
- Support page-aware editing with page size presets, orientation, and margin-sensitive layout.
- Make visual editing mode the primary working preview, without requiring a separate preview step for normal use.
- Support `Structural fidelity` between editor preview and final print/PDF output.
- Support horizontal and vertical rulers as part of the core editing experience.
- Support standard WYSIWYG capabilities:
  - text formatting
  - alignment
  - lists
  - tables
  - images
  - source/HTML mode
- Support explicit page breaks in both visual mode and source mode.
- Keep the component document-agnostic so it can be reused across template scenarios in RO App.

### Non-Goals

- Full Google Docs or Word Online parity.
- Real-time collaboration.
- Comments, suggestions, or review workflows.
- Production data binding and variables beyond the sample Company, Client, Invoice, and table fields.
- Advanced document automation.
- Freeform desktop-publishing layout.
- Role/permission model for who can use the component.
- Product-level workflow for where the component is embedded.
- Customer-facing document builder.

## 4. Personas / Users

### Template author

- Uses the component to edit printable templates.
- Expects to see the document as pages, not as an infinite text surface.
- Wants confidence that the edited layout will match final print/PDF structure.

### Advanced template author

- Uses source mode for targeted corrections.
- Expects source editing to operate on canonical HTML.
- Accepts that only a supported HTML subset is guaranteed to round-trip safely through visual mode.

## 5. Use Cases / Jobs To Be Done

- When a user edits a document template, they want to see page boundaries, margins, and rulers while making changes.
- When a user changes font size, alignment, table structure, image size, or page settings, they want to see the resulting page flow immediately.
- When a user inserts a manual page break, they want the editor preview and final print/PDF output to respect that break consistently.
- When a user switches between portrait and landscape, they want the page layout and rulers to update accordingly.
- When an advanced user edits HTML directly, they want to return to visual mode without losing supported structure.

## 6. Functional Requirements

### 6.1 Component scope

- The solution must be delivered as a reusable editor component, not as a document-type-specific screen.
- The component must be document-agnostic and accept page-based HTML templates as input.
- Invoice and act templates are reference scenarios for validation, but they must not constrain the component API or behavior to only those document types.

### 6.2 Editor foundation

- The primary editor base for v1 must be `CKEditor 5`.
- The component must use `CKEditor 5` as the editing engine and add a custom paged shell around it.
- The custom shell must own page presentation concerns that are not solved sufficiently by the base editor alone:
  - paged workspace presentation
  - ruler rendering
  - page metrics synchronization
  - print-preview alignment

### 6.3 Canonical content format

- Canonical template storage format for v1 must be `HTML`.
- Source mode must edit canonical HTML directly.
- The component may use editor-internal data structures at runtime, but persisted template content must remain HTML.

### 6.4 Workspace and page model

- The component must display the document as pages, not as an infinite text surface.
- The component must support at least these page sizes in v1:
  - `A4`
  - `A5`
- The component must support both page orientations in v1:
  - portrait
  - landscape
- The component must support configurable document margins.
- The component must visually represent page boundaries clearly.

### 6.5 Rulers

- The component must display both horizontal and vertical rulers in visual editing mode.
- Rulers must be synchronized with current page size, orientation, and margins.
- Rulers must update correctly when the user changes page settings.
- Rulers are part of the core editing experience, not an optional enhancement.

### 6.6 Visual editing toolkit

- The component must provide a WYSIWYG toolbar.
- The component must support:
  - font family
  - font size
  - text color
  - alignment
  - bold
  - italic
  - underline
  - lists
- The component must support table insertion and editing.
- The component must support image insertion and basic image manipulation relevant to template editing.

### 6.7 Explicit page breaks

- The component must support explicit manual page breaks in v1.
- A user must be able to insert a page break in visual mode.
- A page break must be visibly represented in the paged workspace.
- The final print/PDF output must honor explicit page breaks created in the editor.
- Source mode and visual mode must preserve supported page break representations consistently.

### 6.8 Source mode

- The component must provide source/HTML mode.
- Source mode must operate on canonical HTML.
- The component must support `restricted round-trip` behavior:
  - visual mode guarantees round-trip only for a supported HTML subset
  - unsupported markup may be normalized
  - unsupported markup may be rejected on save or mode switch with a clear user-facing error
- The component must not promise safe preservation of arbitrary HTML outside the supported subset.

### 6.9 Preview fidelity

- Visual editing mode must be the primary production-oriented preview mode.
- The component must implement `Structural fidelity` as the acceptance contract for preview accuracy.
- `Structural fidelity` means preview and final print/PDF output must match in:
  - page size
  - margins
  - page breaks
  - overall content flow
  - placement of large structural elements such as tables and images
- Small visual differences are acceptable only if they do not change document structure.
- The following are not acceptable:
  - a block appearing on a different page in print/PDF than in the editor preview
  - a different explicit page break position
  - major displacement of a table or image
  - content clipping that is not present in the editor preview

### 6.10 Save and editing behavior

- The component must support a clear save flow for template editing.
- The component must support safe editing behavior that minimizes accidental content loss.
- The component may support draft/edit session behavior, but the final embedding product may decide how save and autosave are exposed.
- Save behavior must preserve canonical HTML and supported page-related metadata.

### 6.11 Browser policy

- Supported browser policy for v1 editing must be:
  - `Chrome` and `Edge`: fully supported
  - `Firefox`: best effort
  - `Safari`: unsupported for editing in v1
- The component must be optimized and validated first against the fully supported browser baseline.
- If a browser cannot maintain `Structural fidelity`, it must not be treated as fully supported.

### 6.12 Company and Client variables

- The variables panel must insert the five Company and five Client placeholders into the document at the cursor.
- Browser print and both draft and saved PDF generation must replace those placeholders with shared sample values.
- The editor, Source, drafts, and saved HTML must preserve the placeholders for reuse.
- Substitution must operate on visible text, preserve inline formatting, and treat values as plain text.
- Legal entity and unknown placeholders must remain unchanged. Production Company/Client data selection is outside this demo's scope.
- Output pagination uses resolved values, so their length may change wrapping and automatic page boundaries. Explicit page breaks must be preserved.

### 6.13 Table body and footer variables

- The variables panel must provide Table body and Table footer groups.
- Table body must provide Description, Qty, Rate, and Amount item placeholders. A body row containing item placeholders must repeat for each shared sample item during browser print and draft/saved PDF generation.
- Table footer must provide Subtotal, Tax rate, Tax amount, and Total placeholders, using sample values consistent with the line items.
- Canonical HTML must retain one template body row and footer placeholders. Rendering must preserve headers, column widths, cell formatting, and footer rows.
- Connected rows with vertically merged cells must repeat together. Empty item lists must remove template rows while retaining static rows.
- Output pagination must occur after row expansion and must honor manual page breaks.
- Tables must use the current page's remaining space and continue across as many pages as needed, including 100+ items. Rows that fit on a page must remain intact, column headers must repeat, and footer totals must appear once after the final item.

### 6.14 Invoice variables

- The variables panel must provide an Invoice group with Invoice Number, Issue Date, and Due Date placeholders.
- Browser print and draft/saved PDF generation must resolve these fields using shared sample values while canonical HTML retains placeholders.
- The fresh Invoice example must use these placeholders in the header and the invoice number in its payment reference.

## 7. Non-Functional Requirements

- The component must be accurate enough to satisfy the defined `Structural fidelity` contract.
- The component must remain viable within the selected cost profile and avoid document-editor suite licensing dependence.
- The component must integrate into a React-based environment.
- The component must not require RO App to build a full custom layout engine in v1.
- The component must remain understandable for users expecting a standard WYSIWYG editing experience.
- The component must be extensible for future document-template capabilities without forcing a full rewrite of the base model.
- The component must have acceptable responsiveness for normal template editing scenarios, including multi-page templates with tables and images.

## 8. UX Principles

- The user must perceive the document as pages, not as abstract text content.
- The editing experience must optimize for confidence in final printable structure.
- Rulers must be functional layout tools, not decorative UI.
- Visual mode must be the default working mode.
- Source mode must remain an advanced capability, not the primary authoring path.
- The component must remain focused on template editing rather than growing into a general publishing environment.

## 9. Edge Cases

- Changing page size causes content to flow across more or fewer pages.
- Switching between portrait and landscape changes page flow significantly.
- A large table or image pushes content unexpectedly near a page boundary.
- An explicit page break is inserted near content that already naturally overflows.
- Source-mode edits introduce unsupported markup.
- Source-mode edits preserve valid HTML but normalize formatting when returning to visual mode.
- Firefox renders page flow slightly differently from Chrome/Edge.
- A smaller screen makes rulers and the page workspace harder to use, even though the component still loads.
- A long multi-page template causes editing performance degradation.

## 10. Success Metrics

- Share of template-editing sessions completed inside the component rather than outside the product.
- Rate of successful save/edit sessions.
- Rate of support issues caused by preview-versus-print/PDF structural mismatch.
- Rate of source-mode related errors or rejected unsupported markup.
- Time required to complete a standard template edit.
- Rate of layout regressions involving page breaks, margins, rulers, tables, or images.

## 11. Rollout Considerations

- v1 rollout must treat this as a reusable component release, not a full document management workflow.
- Rollout readiness requires validation of:
  - `CKEditor 5` integration behavior
  - page metrics synchronization
  - ruler behavior
  - explicit page breaks
  - HTML subset restrictions
  - `Structural fidelity` against final print/PDF output
  - browser behavior across supported and best-effort environments
- If `Firefox` cannot hold sufficient fidelity for some document scenarios, that limitation must be documented explicitly.
- `Safari` editing support is deferred from v1.

## 12. Open Questions

- Which fallback path should be documented if `CKEditor 5` proves insufficient in a critical part of the paged shell behavior?
- What exact supported HTML subset will be declared for source-mode round-trip in v1?
- How should page-related metadata be represented alongside canonical HTML if not all page settings can live cleanly inside HTML alone?
- Should autosave be part of the component contract or remain entirely the responsibility of embedding contexts?
