import { PAGE_BREAK_HTML } from "./pageBreaks.js";

export const EMPTY_PAGE_HTML = "<p></p>";
function normalizePageHtml(html) {
  return String(html ?? "").trim() || EMPTY_PAGE_HTML;
}

// Manual breaks live in the model; automatic boundaries remain presentation.
export function splitManualPages(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  const pages = [""];
  for (const node of template.content.childNodes) {
    const marker =
      node.nodeType === 1 &&
      (node.matches('[data-page-break="true"]') ||
        (node.matches("p") &&
          node.childElementCount === 1 &&
          node.firstElementChild.matches('span[data-page-break="true"]') &&
          !node.textContent.trim()));
    pages[pages.length - 1] += marker ? PAGE_BREAK_HTML : serializeNode(node);
    if (marker) pages.push("");
  }
  return pages.map(normalizePageHtml);
}

// Formatting must not change spacing inside text or inline elements.
export function formatHtmlSource(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  return Array.from(template.content.childNodes)
    .map(serializeNode)
    .filter((value) => value.trim())
    .join("\n");
}
function serializeNode(node) {
  if (node.nodeType === 1) return node.outerHTML;
  if (node.nodeType === 3) {
    const span = document.createElement("span");
    span.textContent = node.textContent;
    return span.innerHTML;
  }
  return "";
}
