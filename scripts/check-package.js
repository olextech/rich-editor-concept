import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const repository = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "papercraft-package-"));
const packageName = "rich-editor-concept";

try {
  const packed = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
      {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_cache: path.join(temporary, "npm-cache"),
        },
      },
    ),
  );
  assert.equal(packed.length, 1, "Expected one local package tarball.");
  const packageInfo = packed[0];
  assert.equal(packageInfo.name, packageName);
  const files = new Set(packageInfo.files.map(({ path: name }) => name));
  for (const entry of [
    "index.js",
    "index.d.ts",
    "client.js",
    "client.d.ts",
    "styles.d.ts",
    "styles.css",
  ]) {
    assert.ok(
      files.has(`dist/editor/${entry}`),
      `Missing built package file: ${entry}. Run npm run build first.`,
    );
  }
  for (const file of files) {
    assert.ok(
      !/^(backend|src|examples|dist\/demo)(\/|$)/.test(file),
      `Application file unexpectedly packed: ${file}`,
    );
  }

  const host = path.join(temporary, "host");
  const modules = path.join(host, "node_modules");
  const installed = path.join(modules, packageName);
  await mkdir(installed, { recursive: true });
  execFileSync(
    "tar",
    [
      "-xzf",
      path.join(temporary, packageInfo.filename),
      "-C",
      installed,
      "--strip-components=1",
    ],
    { encoding: "utf8" },
  );
  const manifest = JSON.parse(
    await readFile(path.join(installed, "package.json"), "utf8"),
  );
  assert.equal(manifest.private, true);
  assert.deepEqual(Object.keys(manifest.exports).sort(), [
    ".",
    "./client",
    "./styles.css",
  ]);
  assert.equal(manifest.peerDependencies.ckeditor5, "47.6.1");
  assert.ok(manifest.peerDependencies.react);
  assert.ok(manifest.peerDependencies["react-dom"]);
  assert.ok(
    (await stat(path.join(installed, "dist/editor/styles.css"))).size > 0,
  );

  // Reuse installed dependencies without a registry request or source alias.
  // Scoped directories are linked as a unit so package resolution stays normal.
  const dependencies = path.join(repository, "node_modules");
  for (const entry of await readdir(dependencies, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === packageName) continue;
    await symlink(
      path.join(dependencies, entry.name),
      path.join(modules, entry.name),
      "dir",
    );
  }
  await writeFile(
    path.join(host, "package.json"),
    JSON.stringify({
      name: "editor-package-consumer",
      private: true,
      type: "module",
    }),
  );
  await writeFile(
    path.join(host, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: ["react", "react-dom"],
      },
      include: ["consumer.tsx"],
    }),
  );
  await writeFile(
    path.join(host, "consumer.tsx"),
    `import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DocumentEditor, DEFAULT_PAGE_SETTINGS, validatePageSettings,
  type DocumentEditorProps, type EditorState, type PageSettings,
  type PageSize, type PageOrientation, type PageMargins, type VariableGroup,
} from "${packageName}";
import "${packageName}/styles.css";
import {
  createTemplateClient, downloadPdf, printPdf,
  type TemplateClientOptions, type TemplateClient, type TemplateDraft,
  type TemplateSummary, type SavedTemplate, type PdfRequest,
} from "${packageName}/client";

const pageSize: PageSize = "A4";
const orientation: PageOrientation = "portrait";
const margins: PageMargins = { top: 20, right: 20, bottom: 20, left: 20 };
const settings: PageSettings = validatePageSettings({ pageSize, orientation, margins });
const defaults: PageSettings = DEFAULT_PAGE_SETTINGS;
const variables: readonly VariableGroup[] = [
  { id: "customer", label: "Customer", description: "Customer fields", variables: ["{Customer Name}"] },
];
const props: DocumentEditorProps = {
  licenseKey: "GPL", documentKey: 42, initialHtml: "<p>Template</p>",
  pageSettings: defaults, variableGroups: variables,
  variableValues: { "{Customer Name}": "Example customer" },
  className: "host-editor", style: { height: 480 }, ariaLabel: "Host template",
};
function HostEditor() {
  const [html, setHtml] = useState(props.initialHtml ?? "");
  const [state, setState] = useState<EditorState>({ isReady: false, error: "", pageCount: 1 });
  const [readOnly] = useState(false);
  return <DocumentEditor
    {...props} initialHtml={html} pageSettings={settings} onChange={setHtml}
    onStateChange={setState} readOnly={readOnly}
    renderHeader={({ isReady, error, pageCount }) => <button disabled={!isReady || Boolean(error)}>Save {pageCount} pages</button>}
    message={state.error ? <span role="alert">{state.error}</span> : null}
  />;
}
const root = createRoot(document.createElement("div"));
root.render(<HostEditor />);

const options: TemplateClientOptions = {
  baseUrl: "/documents", fetch: globalThis.fetch,
  headers: async () => ({ Authorization: "Bearer host-token" }), credentials: "include",
};
const api: TemplateClient = createTemplateClient(options);
const draft: TemplateDraft = { name: "Template", html: "<p>Template</p>", pageSettings: settings };
const summary: TemplateSummary = { id: 42, name: draft.name, pageSettings: settings, updatedAt: "2026-10-05T00:00:00Z" };
const saved: SavedTemplate = { ...summary, html: draft.html, createdAt: summary.updatedAt };
const request: PdfRequest = { templateId: saved.id, documentId: "host-record" };
const signal = new AbortController().signal;
const list: Promise<TemplateSummary[]> = api.list(signal);
const get: Promise<SavedTemplate> = api.get(saved.id, signal);
const save: Promise<SavedTemplate> = api.save(null, draft, signal);
const remove: Promise<null> = api.delete(saved.id, signal);
const pdf: Promise<Blob> = api.render(request, signal);
async function output() {
  const blob = await pdf;
  downloadPdf(blob, saved.name);
  await printPdf(blob);
}

// @ts-expect-error The host must supply a CKEditor license key.
const missingLicense = <DocumentEditor />;
// @ts-expect-error Only the supported paper sizes belong to this contract.
const invalidPaper: PageSettings = { ...settings, pageSize: "Letter" };
// @ts-expect-error PDF requests must contain IDs, not draft HTML.
api.render({ ...request, html: draft.html });
`,
  );
  execFileSync(
    process.execPath,
    [
      path.join(dependencies, "typescript/bin/tsc"),
      "--project",
      "tsconfig.json",
    ],
    { cwd: host, stdio: "inherit" },
  );
  console.log("Public declarations and strict TypeScript host checks passed.");
  await writeFile(
    path.join(host, "index.html"),
    '<!doctype html><html><head><title>Package consumer</title></head><body><div id="host"></div><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(
    path.join(host, "main.js"),
    `import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { DocumentEditor, DEFAULT_PAGE_SETTINGS, validatePageSettings } from "${packageName}";
import "${packageName}/styles.css";
import { createTemplateClient, downloadPdf, printPdf } from "${packageName}/client";

globalThis.hostOutput = { createTemplateClient, downloadPdf, printPdf };
createRoot(document.getElementById("host")).render(createElement(DocumentEditor, {
  licenseKey: "GPL",
  documentKey: "consumer-template",
  initialHtml: "<p>Host document</p>",
  pageSettings: validatePageSettings(DEFAULT_PAGE_SETTINGS),
  style: { height: 480 },
}));
`,
  );
  await build({
    configFile: false,
    root: host,
    logLevel: "error",
    build: {
      outDir: path.join(host, "dist"),
      emptyOutDir: true,
      minify: false,
    },
  });
  console.log("Packed package and plain Vite host build passed.");

  const serverRender = `
import assert from "node:assert/strict";
delete globalThis.window;
delete globalThis.document;
delete globalThis.navigator;
const { createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const { DocumentEditor, DEFAULT_PAGE_SETTINGS, validatePageSettings } = await import("${packageName}");
const client = await import("${packageName}/client");
assert.equal(typeof client.createTemplateClient, "function");
assert.equal(typeof client.downloadPdf, "function");
assert.equal(typeof client.printPdf, "function");
assert.ok(Object.isFrozen(DEFAULT_PAGE_SETTINGS));
assert.ok(Object.isFrozen(DEFAULT_PAGE_SETTINGS.margins));
assert.equal(validatePageSettings(DEFAULT_PAGE_SETTINGS), DEFAULT_PAGE_SETTINGS);
const html = renderToString(createElement(DocumentEditor, {
  licenseKey: "GPL",
  initialHtml: "<p>Server document</p>",
  ariaLabel: "Server rendered editor",
}));
assert.match(html, /papercraft-editor/);
assert.match(html, /Loading editor/);
assert.match(html, /Server rendered editor/);
assert.doesNotMatch(html, /contenteditable="true"/);
console.log("Built package imports and server rendering passed without browser globals.");
`;
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", serverRender],
    { cwd: host, encoding: "utf8" },
  );
  process.stdout.write(output);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
