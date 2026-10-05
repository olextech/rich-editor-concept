# Development Plan — Rich Editor

> Historical planning document. The implemented component and IDs-only backend PDF flow are defined in [design.md](design.md) and [the embedding guide](../../docs/embedding.md). Earlier draft PDF requirements and component names are superseded.

## References

- Task: ./prd.md
- Design: ./design.md

---

# 📊 Progress Report

| Iteration | Title | Status | Result | Notes |
|-----------|--------|--------|--------|-------|
| 1 | Basic Save and Load Slice | ⬜ Not Started | - | - |
| 2 | Paged Editing Experience | 🟢 Done | Visual paged editor slice is integrated | Source mode and PDF remain next |
| 3 | PDF Export and Source Validation | ⬜ Not Started | - | - |
| 4 | Hardening and Acceptance Checks | ⬜ Not Started | - | - |

Status Legend:
⬜ Not Started
🟡 In Progress
🟢 Done
🔴 Blocked

---

# 🚀 Iterative Plan

## Iteration 1 — Basic Save and Load Slice

Goal:
Get a minimal end-to-end flow working: create a template, save it to SQLite, load it back, and edit it through a simple frontend screen.

Tasks:
- [ ] Create FastAPI app bootstrap, SQLite connection, and `templates` table model
- [ ] Add `POST /templates`, `GET /templates`, and `GET /templates/{id}` endpoints with Pydantic schemas
- [ ] Add a minimal frontend API client for create/list/load template requests
- [ ] Replace the placeholder app screen with a simple template list and editor screen shell
- [ ] Add a plain HTML editor textarea and page settings form wired to save/load flows

Validation:
Run backend and frontend locally. Create a template, refresh the page, reopen it from the list, and confirm HTML plus page settings are preserved.

Expected Result:
Users can create, save, list, and reopen templates end to end with SQLite persistence.

---

## Iteration 2 — Paged Editing Experience

Goal:
Replace the plain textarea editing flow with the real paged editor experience in visual mode.

Tasks:
- [ ] Add CKEditor 5 integration with the supported toolbar basics: formatting, alignment, lists, tables, images
- [ ] Build the `RichTemplateEditor` wrapper with page size, orientation, and margin state
- [ ] Add paged workspace rendering with visible page boundaries and page geometry CSS variables
- [ ] Add horizontal and vertical rulers synced to current page settings
- [ ] Support manual page break insertion and preserve the canonical page-break marker in editor HTML

Validation:
Open a saved template, edit content in visual mode, change page size/orientation/margins, insert a page break, save, reload, and confirm the layout state is retained.

Expected Result:
Users edit templates in a page-based visual workspace with rulers and manual page breaks.

---

## Iteration 3 — PDF Export and Source Validation

Goal:
Add backend PDF generation and the advanced source-mode flow with validation.

Tasks:
- [ ] Add backend HTML subset validation and sanitization used on save and render
- [ ] Add `PUT /templates/{id}` and `POST /templates/{id}/pdf` endpoints
- [ ] Add `POST /pdf/render` endpoint for unsaved draft export
- [ ] Implement WeasyPrint-based PDF rendering with shared page CSS for size, margins, orientation, tables, images, and page breaks
- [ ] Add source/HTML mode in the frontend and block invalid source round-trips with clear errors
- [ ] Add save and export PDF actions to the editor toolbar/screen

Validation:
Edit a template in visual mode, save it, export a PDF, and confirm page size, margins, orientation, and page breaks match the editor structure. Edit HTML in source mode, verify valid HTML saves, and invalid HTML is rejected.

Expected Result:
Users can save templates safely, switch between visual and source modes, and export structurally correct PDFs from saved or unsaved content.

---

## Iteration 4 — Hardening and Acceptance Checks

Goal:
Close the main edge cases and add enough tests and guardrails for confident manual use.

Tasks:
- [ ] Add backend tests for template CRUD, validation failures, and PDF render responses
- [ ] Add frontend tests or focused manual test script for page settings, page breaks, and source-mode errors
- [ ] Improve error states for fetch, save, validation, and PDF generation failures
- [ ] Add browser support messaging for Firefox best effort and Safari unsupported editing
- [ ] Manually verify structural fidelity on sample multi-page templates with tables and images

Validation:
Run the backend test suite and the frontend checks used in the repo. Manually verify sample templates across create, edit, reload, source mode, and PDF export flows.

Expected Result:
The feature works end to end with the core edge cases covered and is ready for implementation review against the PRD.
