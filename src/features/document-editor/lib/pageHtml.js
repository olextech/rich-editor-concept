import { PAGE_BREAK_HTML } from "./pageBreaks.js";

export const EMPTY_PAGE_HTML = "<p></p>";
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "table",
  "figure",
]);
const STRUCTURAL_CHILDREN = {
  div: BLOCK_TAGS,
  blockquote: BLOCK_TAGS,
  li: BLOCK_TAGS,
  td: BLOCK_TAGS,
  th: BLOCK_TAGS,
  figure: new Set([...BLOCK_TAGS, "img", "figcaption"]),
  table: new Set(["caption", "colgroup", "thead", "tbody", "tfoot", "tr"]),
  colgroup: new Set(["col"]),
  thead: new Set(["tr"]),
  tbody: new Set(["tr"]),
  tfoot: new Set(["tr"]),
  tr: new Set(["td", "th"]),
  ul: new Set(["li"]),
  ol: new Set(["li"]),
};
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
  const children = Array.from(template.content.childNodes);
  // Inline fragments (including spaces between adjacent inline elements) must
  // stay together. Only add whitespace between structural block elements.
  return canIndent(children, BLOCK_TAGS)
    ? formatChildren(children, 0)
    : template.innerHTML;
}

function canIndent(children, allowedTags) {
  return (
    Boolean(allowedTags) &&
    children.some((node) => node.nodeType === 1) &&
    children.every(
      (node) =>
        node.nodeType === 8 ||
        isFormattingWhitespace(node) ||
        (node.nodeType === 1 && allowedTags.has(node.localName)),
    )
  );
}

function formatChildren(children, depth) {
  return children
    .filter((node) => !isFormattingWhitespace(node))
    .map((node) => formatNode(node, depth))
    .join("\n");
}

function isFormattingWhitespace(node) {
  // Non-breaking and other Unicode spaces can be document content.
  return node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent);
}

function formatNode(node, depth) {
  const indent = "  ".repeat(depth);
  if (node.nodeType === 1) {
    const children = Array.from(node.childNodes);
    if (canIndent(children, STRUCTURAL_CHILDREN[node.localName])) {
      const closingTag = `</${node.localName}>`;
      // Serialize an empty clone so '>' inside an attribute can't be mistaken
      // for the end of the opening tag.
      const openingTag = node
        .cloneNode(false)
        .outerHTML.slice(0, -closingTag.length);
      return `${indent}${openingTag}\n${formatChildren(children, depth + 1)}\n${indent}${closingTag}`;
    }
  }
  return indent + serializeNode(node);
}
function serializeNode(node) {
  if (node.nodeType === 1) return node.outerHTML;
  if (node.nodeType === 3) {
    const span = document.createElement("span");
    span.textContent = node.textContent;
    return span.innerHTML;
  }
  if (node.nodeType === 8) return `<!--${node.data}-->`;
  return "";
}
