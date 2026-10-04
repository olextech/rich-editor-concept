const baseUrl = import.meta.env.VITE_API_URL ?? "/api";

async function request(path, { body, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Cannot reach the backend. Your draft is kept in this browser.",
    );
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : "The backend could not complete the request.",
    );
  }
  if (response.status === 204) return null;
  return response.headers.get("Content-Type")?.includes("application/pdf")
    ? response.blob()
    : response.json();
}
export const templateApi = {
  list: (signal) => request("/templates", { signal }),
  get: (id, signal) => request(`/templates/${id}`, { signal }),
  save: (id, body) =>
    request(id ? `/templates/${id}` : "/templates", {
      method: id ? "PUT" : "POST",
      body,
    }),
  delete: (id) => request(`/templates/${id}`, { method: "DELETE" }),
  render: (body) => request("/pdf/render", { method: "POST", body }),
};
export function downloadPdf(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "document"}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
