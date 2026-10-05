export { printPdf } from "./printPdf.js";

/** Optional adapter for the supplied template backend. No requests run at import. */
export function createTemplateClient({
  baseUrl = "/api",
  fetch: fetchOverride,
  headers,
  credentials = "same-origin",
} = {}) {
  const root = baseUrl.replace(/\/+$/, "");

  async function request(path, { body, ...options } = {}) {
    const requestHeaders = new Headers(
      typeof headers === "function" ? await headers() : headers,
    );
    if (body !== undefined)
      requestHeaders.set("Content-Type", "application/json");
    let response;
    try {
      const fetchRequest = fetchOverride ?? globalThis.fetch;
      response = await fetchRequest(`${root}${path}`, {
        ...options,
        credentials,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new Error("Cannot reach the backend.");
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(
        typeof payload?.detail === "string"
          ? payload.detail
          : "The backend could not complete the request.",
      );
    }
    if (response.status === 204) return null;
    return response.headers.get("Content-Type")?.includes("application/pdf")
      ? response.blob()
      : response.json();
  }

  return {
    list: (signal) => request("/templates", { signal }),
    get: (id, signal) =>
      request(`/templates/${encodeURIComponent(id)}`, { signal }),
    save: (id, body, signal) =>
      request(
        id == null ? "/templates" : `/templates/${encodeURIComponent(id)}`,
        {
          method: id == null ? "POST" : "PUT",
          body,
          signal,
        },
      ),
    delete: (id, signal) =>
      request(`/templates/${encodeURIComponent(id)}`, {
        method: "DELETE",
        signal,
      }),
    render: ({ templateId, documentId }, signal) =>
      request("/pdf/render", {
        method: "POST",
        body: { templateId, documentId },
        signal,
      }),
  };
}

/** Download a generated PDF. Call only in a browser. */
export function downloadPdf(blob, name = "document") {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      String(name)
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .trim() || "document"
    }.pdf`;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
