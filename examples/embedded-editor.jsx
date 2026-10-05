import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

const hostSelectors = [
  "body",
  "#host-sentinel",
  "#host-sentinel h2",
  "#host-sentinel p",
  "#host-button",
];
const hostProperties = [
  "fontFamily",
  "fontSize",
  "lineHeight",
  "marginTop",
  "marginBottom",
  "paddingTop",
  "borderTopWidth",
  "color",
  "backgroundColor",
];
window.hostStyleSnapshot = () =>
  Object.fromEntries(
    hostSelectors.map((selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return [
        selector,
        Object.fromEntries(
          hostProperties.map((property) => [property, style[property]]),
        ),
      ];
    }),
  );
window.hostBaseline = window.hostStyleSnapshot();

// Exercise the built public artifact. In a host, use the package exports.
await import("../dist/editor/styles.css");
const { DocumentEditor } = await import("../dist/editor/index.js");

const groups = [
  {
    id: "host",
    label: "Host variables",
    variables: ["{{host.customer}}", "{{host.reference}}"],
  },
];
const firstDocument = "<p>First editor content.</p>";
const secondDocument = "<p>Second editor content.</p>";
const replacementDocument = "<p>Replacement first document.</p>";

function Status({ id, value }) {
  return (
    <output data-testid={`${id}-state`}>
      {value.error ||
        (value.isReady ? `Ready: ${value.pageCount} pages` : "Loading")}
    </output>
  );
}

function Example() {
  const [firstState, setFirstState] = useState({ isReady: false });
  const [secondState, setSecondState] = useState({ isReady: false });
  const [firstHtml, setFirstHtml] = useState(firstDocument);
  const [secondHtml, setSecondHtml] = useState(secondDocument);
  const [readOnly, setReadOnly] = useState(false);
  const [documentKey, setDocumentKey] = useState("first-1");
  const [hidden, setHidden] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [transient, setTransient] = useState(false);
  return (
    <>
      <div className="example-controls">
        <button onClick={() => setReadOnly((value) => !value)}>
          Toggle read only
        </button>
        <button
          onClick={() =>
            setDocumentKey((value) =>
              value === "first-1" ? "first-2" : "first-1",
            )
          }
        >
          Switch first document
        </button>
        <button onClick={() => setHidden((value) => !value)}>
          Hide or show first
        </button>
        <button onClick={() => setNarrow((value) => !value)}>
          Resize first
        </button>
        <button onClick={() => setMounted((value) => !value)}>
          Mount or unmount first
        </button>
        <button
          onClick={() => {
            setTransient(true);
            setTimeout(() => setTransient(false), 10);
          }}
        >
          Quick mount and unmount
        </button>
      </div>
      <Status id="first" value={firstState} />
      <section style={{ display: hidden ? "none" : "block" }}>
        {mounted && (
          <DocumentEditor
            licenseKey="GPL"
            ariaLabel="First editor"
            documentKey={documentKey}
            initialHtml={
              documentKey === "first-1" ? firstDocument : replacementDocument
            }
            className="example-editor"
            style={{ width: narrow ? 800 : 1080, height: narrow ? 420 : 600 }}
            readOnly={readOnly}
            variableGroups={groups}
            variableValues={{ "{{host.customer}}": "Sample customer" }}
            onChange={setFirstHtml}
            onStateChange={setFirstState}
          />
        )}
      </section>
      <pre data-testid="first-html">{firstHtml}</pre>
      <Status id="second" value={secondState} />
      <DocumentEditor
        licenseKey="GPL"
        ariaLabel="Second editor"
        documentKey="second"
        initialHtml={secondDocument}
        style={{ width: 660, height: 450 }}
        className="example-editor"
        onChange={setSecondHtml}
        onStateChange={setSecondState}
      />
      <pre data-testid="second-html">{secondHtml}</pre>
      {transient && (
        <DocumentEditor
          licenseKey="GPL"
          ariaLabel="Transient editor"
          style={{ width: 500, height: 300 }}
        />
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Example />
  </StrictMode>,
);
