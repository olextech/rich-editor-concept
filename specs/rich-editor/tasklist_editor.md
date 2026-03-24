# Detailed Plan — Iteration 2: Paged Editing Experience

## References

- Task: ./prd.md
- Design: ./design.md
- Main Plan: ./tasklist.md

---

# 📊 Progress Report

| Step | Title | Status | Result | Notes |
|------|-------|--------|--------|-------|
| 1 | Editor Dependencies and Bootstrapping | 🟢 Done | CKEditor bootstrap compiles in app | Uses classic build for now |
| 2 | RichTemplateEditor Shell | 🟢 Done | Controlled editor wrapper is active | Default page settings wired |
| 3 | Toolbar and Page Settings | 🟢 Done | Controls are wired into shell state | Depends on current classic build limits |
| 4 | Paged Workspace Rendering | 🟢 Done | Editor renders inside page-shaped canvas | Geometry comes from page settings |
| 5 | Rulers | 🟢 Done | Horizontal and vertical rulers are visible | Synced to margins and page size |
| 6 | Manual Page Breaks | 🟢 Done | Page-break action and marker are wired | Custom markup still depends on classic build behavior |
| 7 | Integration and Verification | 🟢 Done | Demo flow is integrated and verifiable | Next gaps noted in app copy |

Status Legend:
⬜ Not Started
🟡 In Progress
🟢 Done
🔴 Blocked

---

# 🚀 Execution Plan

## Step 1 — Editor Dependencies and Bootstrapping

Goal:
Get CKEditor running inside the frontend so the app can render a real editing surface.

Tasks:
- [✅] Add CKEditor 5 packages required for the v1 toolbar and React integration
- [✅] Create `src/features/rich-editor/` module structure and base stylesheet
- [✅] Add `ckeditorConfig.js` with the initial plugin list and toolbar config
- [✅] Render a minimal CKEditor instance in isolation from the placeholder app

Validation:
Run the frontend locally and confirm the editor loads without crashing and accepts typed content.

Expected Result:
A working CKEditor instance is visible in the app.

---

## Step 2 — RichTemplateEditor Shell

Goal:
Introduce the reusable editor wrapper that owns editor value and page settings state.

Tasks:
- [✅] Create `RichTemplateEditor.jsx` with props for `value`, `pageSettings`, `onChange`, and `onPageSettingsChange`
- [✅] Move current template editing state in `App.jsx` behind the new wrapper
- [✅] Add `pageGeometry.js` with page size presets for `A4` and `A5`
- [✅] Normalize default page settings for new templates

Validation:
Open an existing saved template and confirm the wrapper receives content and emits HTML changes back to the app.

Expected Result:
The app uses a reusable editor component instead of a one-off editing block.

---

## Step 3 — Toolbar and Page Settings

Goal:
Expose the main editing actions and page controls required for visual editing.

Tasks:
- [✅] Create `EditorToolbar.jsx` with formatting controls for bold, italic, underline, alignment, lists, tables, and images
- [✅] Create `PageSettingsBar.jsx` with controls for page size, orientation, and margins
- [✅] Wire toolbar actions to the CKEditor instance
- [✅] Wire page settings controls to wrapper state and persist changes through the existing save flow

Validation:
Change text formatting, insert a list or table, update page size/orientation/margins, save, reload, and confirm settings persist.

Expected Result:
Users can edit content and adjust page settings through the visual controls.

---

## Step 4 — Paged Workspace Rendering

Goal:
Make the document look and behave like pages instead of an infinite editor surface.

Tasks:
- [✅] Create `PagedWorkspace.jsx` that wraps the editor in a page-shaped container
- [✅] Add CSS variables for page width, page height, and content margins
- [✅] Style visible paper boundaries, printable content area, and page spacing
- [✅] Add responsive overflow behavior so the page metaphor remains usable on smaller screens

Validation:
Switch between `A4` and `A5`, portrait and landscape, and confirm the workspace updates page geometry visibly.

Expected Result:
The editor renders inside a clear paged workspace with visible page boundaries and margin-aware layout.

---

## Step 5 — Rulers

Goal:
Add rulers that stay aligned with page geometry and update when settings change.

Tasks:
- [✅] Create `Ruler.jsx` for horizontal and vertical ruler rendering
- [✅] Add tick generation based on current page dimensions and margins
- [✅] Position rulers relative to the paged workspace and printable area
- [✅] Recompute ruler values when page size, orientation, or margins change

Validation:
Adjust page settings and confirm ruler ticks and margin markers update in sync with the workspace.

Expected Result:
Horizontal and vertical rulers are visible and aligned with the current page settings.

---

## Step 6 — Manual Page Breaks

Goal:
Support explicit page breaks in visual mode and preserve them in canonical HTML.

Tasks:
- [✅] Create `pageBreaks.js` helpers for insert, detect, and serialize page-break markers
- [✅] Add a toolbar action to insert a manual page break at the current cursor position
- [✅] Render a visible page-break marker inside the workspace
- [✅] Preserve the canonical `data-page-break` marker through save and reload

Validation:
Insert a manual page break, save the template, reload it, and confirm the break remains visible in the same structural position.

Expected Result:
Users can add and keep explicit page breaks from the visual editor.

---

## Step 7 — Integration and Verification

Goal:
Finish the editor slice so it is stable enough to hand off to the next iteration.

Tasks:
- [✅] Replace any remaining plain textarea editing path with `RichTemplateEditor`
- [✅] Add loading and basic inline error states around editor initialization
- [✅] Manually verify formatting, tables, images, rulers, page settings, and page breaks on a multi-page sample
- [✅] Record any known gaps that belong to Iteration 3, especially source mode and PDF fidelity

Validation:
Run the full create, save, reload, and edit flow from the app screen using a realistic sample template.

Expected Result:
Iteration 2 delivers the full visual paged editing experience and is ready for PDF export and source-mode work next.
