import { useState } from "react";
import RichTemplateEditor from "./RichTemplateEditor";
import { openPdfPrintWindow } from "./lib/pdfDocument";
import { DEFAULT_PAGE_SETTINGS } from "./lib/pageGeometry";

const templatePresets = [
  {
    id: "invoice",
    label: "Invoice",
    description: "Table-heavy billing layout with explicit page break.",
    pageSettings: DEFAULT_PAGE_SETTINGS,
    html: `
      <h1>Invoice template</h1>
      <p><strong>Bill to:</strong> Northern Workshop Ltd.</p>
      <p>18 River Street<br />Kyiv, Ukraine</p>
      <p><strong>Invoice date:</strong> 2026-03-24</p>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Design system audit</td>
            <td>1</td>
            <td>1200</td>
          </tr>
          <tr>
            <td>Template migration support</td>
            <td>2</td>
            <td>800</td>
          </tr>
        </tbody>
      </table>
      <p>
        This sample exists to verify page settings, rulers, tables, and
        explicit page breaks in one realistic document.
      </p>
      <p><span class="page-break-marker" data-page-break="true"></span></p>
      <h2>Terms and summary</h2>
      <p>
        Payment is due within 14 calendar days. Deliverables are supplied in
        HTML and PDF form.
      </p>
      <ul>
        <li>Editable source template</li>
        <li>Print-ready PDF export</li>
        <li>Page settings preserved with the template</li>
      </ul>
    `,
  },
  {
    id: "proposal",
    label: "Proposal",
    description: "Narrative document with section headers and long copy.",
    pageSettings: {
      pageSize: "A4",
      orientation: "portrait",
      margins: { top: 24, right: 20, bottom: 24, left: 20 },
    },
    html: `
      <h1>Project proposal</h1>
      <p>
        This draft demonstrates a long-form layout for a service proposal with
        headings, paragraphs, and a manual break between sections.
      </p>
      <h2>Scope</h2>
      <p>
        The team will modernize the document template stack, align page metrics
        across editor and print output, and simplify authoring for operations
        staff.
      </p>
      <h2>Deliverables</h2>
      <ul>
        <li>Paged editor integration</li>
        <li>Template persistence API</li>
        <li>Server-side PDF rendering</li>
      </ul>
      <p><span class="page-break-marker" data-page-break="true"></span></p>
      <h2>Timeline</h2>
      <p>
        Iteration 1 establishes persistence. Iteration 2 delivers page-aware
        authoring. Iteration 3 closes the loop with PDF export and source mode.
      </p>
    `,
  },
  {
    id: "act",
    label: "Act",
    description: "Compact A5 layout with landscape orientation.",
    pageSettings: {
      pageSize: "A5",
      orientation: "landscape",
      margins: { top: 14, right: 14, bottom: 14, left: 14 },
    },
    html: `
      <h1>Acceptance act</h1>
      <p>
        This compact sample stresses the smaller page preset and landscape
        orientation.
      </p>
      <table>
        <tbody>
          <tr>
            <th>Service</th>
            <td>Template implementation</td>
          </tr>
          <tr>
            <th>Period</th>
            <td>March 2026</td>
          </tr>
          <tr>
            <th>Status</th>
            <td>Accepted</td>
          </tr>
        </tbody>
      </table>
      <p>
        The layout should stay readable when the page shrinks and rotates.
      </p>
    `,
  },
];

function clonePreset(preset) {
  return {
    html: preset.html,
    pageSettings: {
      pageSize: preset.pageSettings.pageSize,
      orientation: preset.pageSettings.orientation,
      margins: { ...preset.pageSettings.margins },
    },
  };
}

export default function EditorDemoPage() {
  const [activePresetId, setActivePresetId] = useState(templatePresets[0].id);
  const [html, setHtml] = useState(templatePresets[0].html);
  const [pageSettings, setPageSettings] = useState(
    clonePreset(templatePresets[0]).pageSettings,
  );

  function handlePrint() {
    openPdfPrintWindow({
      html,
      pageSettings,
      title: `${activePreset.label} template`,
    });
  }

  function handlePresetSelect(preset) {
    const nextPreset = clonePreset(preset);
    setActivePresetId(preset.id);
    setHtml(nextPreset.html);
    setPageSettings(nextPreset.pageSettings);
  }

  const activePreset =
    templatePresets.find((preset) => preset.id === activePresetId) ??
    templatePresets[0];

  return (
    <main className="editor-demo-shell">
      <section className="editor-demo-panel editor-demo-panel--page">
        <div className="editor-demo-copy">
          <p className="editor-demo-kicker">Rich editor demo</p>
          <h1 className="editor-demo-title">Paged template playground</h1>
          <p className="editor-demo-description">
            A single page to exercise the current editor build with document
            presets, live page settings, rulers, and page-break handling.
          </p>
          <p className="editor-demo-note">
            This page is focused on editor demonstration only. Source mode,
            backend save/load, and PDF output remain separate next-iteration
            work.
          </p>
          <div className="editor-demo-actions">
            <button
              type="button"
              className="demo-print-button"
              onClick={handlePrint}
            >
              Print
            </button>
          </div>
        </div>

        <section className="demo-overview">
          <div className="demo-overview__card">
            <span className="demo-overview__label">Active preset</span>
            <strong className="demo-overview__value">{activePreset.label}</strong>
            <p className="demo-overview__text">{activePreset.description}</p>
          </div>
          <div className="demo-overview__card">
            <span className="demo-overview__label">Page settings</span>
            <strong className="demo-overview__value">
              {pageSettings.pageSize} · {pageSettings.orientation}
            </strong>
            <p className="demo-overview__text">
              Margins {pageSettings.margins.top}/{pageSettings.margins.right}/
              {pageSettings.margins.bottom}/{pageSettings.margins.left} mm
            </p>
          </div>
          <div className="demo-overview__card">
            <span className="demo-overview__label">HTML size</span>
            <strong className="demo-overview__value">{html.length} chars</strong>
            <p className="demo-overview__text">
              Live output stays controlled by the demo page.
            </p>
          </div>
        </section>

        <section className="demo-layout">
          <aside className="demo-sidebar">
            <div className="demo-sidebar__section">
              <h2 className="demo-sidebar__title">Templates</h2>
              <div className="demo-preset-list">
                {templatePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`demo-preset ${
                      preset.id === activePresetId ? "demo-preset--active" : ""
                    }`}
                    onClick={() => {
                      handlePresetSelect(preset);
                    }}
                  >
                    <span className="demo-preset__label">{preset.label}</span>
                    <span className="demo-preset__description">
                      {preset.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="demo-sidebar__section">
              <h2 className="demo-sidebar__title">Live output</h2>
              <pre className="demo-code-block">{html}</pre>
            </div>
          </aside>

          <div className="demo-editor-column print-target">
            <RichTemplateEditor
              value={html}
              pageSettings={pageSettings}
              onChange={setHtml}
              onPageSettingsChange={setPageSettings}
            />
          </div>
        </section>
      </section>
    </main>
  );
}
