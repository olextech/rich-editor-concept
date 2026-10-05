import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createTemplateClient } from "../src/editor/client.js";

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("client imports and constructs without browser APIs or fetch", () => {
  const moduleUrl = new URL("../src/editor/client.js", import.meta.url).href;
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `delete globalThis.document;
       delete globalThis.window;
       delete globalThis.navigator;
       delete globalThis.fetch;
       delete globalThis.Headers;
       delete globalThis.URL;
       const client = await import(${JSON.stringify(moduleUrl)});
       client.createTemplateClient();`,
    ],
    { stdio: "pipe" },
  );
});

test("configured requests use current auth headers, credentials, and signals", async () => {
  const requests = [];
  let token = "first";
  const client = createTemplateClient({
    baseUrl: "https://backend.example.com/api/",
    headers: async () => ({ Authorization: `Bearer ${token}` }),
    credentials: "include",
    fetch: async (url, options) => {
      requests.push({ url, options });
      return json([]);
    },
  });
  const signal = new AbortController().signal;
  await client.list(signal);
  token = "second";
  await client.get(12, signal);

  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      "https://backend.example.com/api/templates",
      "https://backend.example.com/api/templates/12",
    ],
  );
  for (const { options } of requests) {
    assert.equal(options.signal, signal);
    assert.equal(options.credentials, "include");
  }
  assert.equal(
    requests[0].options.headers.get("Authorization"),
    "Bearer first",
  );
  assert.equal(
    requests[1].options.headers.get("Authorization"),
    "Bearer second",
  );
  assert.equal(requests[0].options.headers.has("Content-Type"), false);
});

test("default fetch is resolved lazily and default credentials are same-origin", async () => {
  const originalFetch = globalThis.fetch;
  const client = createTemplateClient();
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return json([]);
  };
  try {
    assert.deepEqual(await client.list(), []);
    assert.equal(requests[0].url, "/api/templates");
    assert.equal(requests[0].options.credentials, "same-origin");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("save distinguishes create and update and preserves caller headers", async () => {
  const requests = [];
  const headers = new Headers({ Authorization: "Bearer fixed" });
  const client = createTemplateClient({
    headers,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return json({ id: 4 });
    },
  });
  const body = { name: "Template", html: "<p>Text</p>", pageSettings: {} };
  const signal = new AbortController().signal;
  assert.deepEqual(await client.save(null, body, signal), { id: 4 });
  await client.save(4, body, signal);
  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method]),
    [
      ["/api/templates", "POST"],
      ["/api/templates/4", "PUT"],
    ],
  );
  for (const { options } of requests) {
    assert.deepEqual(JSON.parse(options.body), body);
    assert.equal(options.headers.get("Content-Type"), "application/json");
    assert.equal(options.headers.get("Authorization"), "Bearer fixed");
    assert.equal(options.signal, signal);
  }
  assert.equal(headers.has("Content-Type"), false);
});

test("render sends only saved IDs and returns the PDF blob", async () => {
  let request;
  const client = createTemplateClient({
    fetch: async (url, options) => {
      request = { url, options };
      return new Response("%PDF-example", {
        headers: { "Content-Type": "application/pdf" },
      });
    },
  });
  const signal = new AbortController().signal;
  const result = await client.render(
    {
      templateId: 7,
      documentId: "order-42",
      html: "<p>Unsaved draft</p>",
      values: { "{Client Name}": "Injected" },
    },
    signal,
  );
  assert.equal(request.url, "/api/pdf/render");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.signal, signal);
  assert.deepEqual(JSON.parse(request.options.body), {
    templateId: 7,
    documentId: "order-42",
  });
  assert.ok(result instanceof Blob);
  assert.equal(await result.text(), "%PDF-example");
});

test("delete passes its signal and handles empty 204 responses", async () => {
  const signal = new AbortController().signal;
  const client = createTemplateClient({
    fetch: async (url, options) => {
      assert.equal(url, "/api/templates/5");
      assert.equal(options.method, "DELETE");
      assert.equal(options.signal, signal);
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(await client.delete(5, signal), null);
});

test("request cancellation preserves the abort error", async () => {
  const controller = new AbortController();
  controller.abort();
  const aborted = new DOMException("Aborted", "AbortError");
  const client = createTemplateClient({
    fetch: async (_, options) => {
      assert.equal(options.signal, controller.signal);
      throw aborted;
    },
  });
  await assert.rejects(
    client.list(controller.signal),
    (error) => error === aborted,
  );
});

test("network errors do not expose transport details", async () => {
  const client = createTemplateClient({
    fetch: async () => {
      throw new Error("Private transport details");
    },
  });
  await assert.rejects(client.list(), { message: "Cannot reach the backend." });
});

test("HTTP errors use backend messages or a safe fallback", async () => {
  for (const [response, message] of [
    [json({ detail: "Template not found." }, 404), "Template not found."],
    [
      json({ detail: [{ internal: "detail" }] }, 422),
      "The backend could not complete the request.",
    ],
    [json(null, 500), "The backend could not complete the request."],
    [
      new Response("<html>Private proxy error</html>", { status: 502 }),
      "The backend could not complete the request.",
    ],
  ]) {
    const client = createTemplateClient({ fetch: async () => response });
    await assert.rejects(client.list(), { message });
  }
});
