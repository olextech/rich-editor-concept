import { PAGE_BREAK_HTML } from "./pageBreaks";

const EMPTY_PAGE_HTML = "<p></p>";

export function createPageRootName(index) {
  return `page-${index + 1}`;
}

export function normalizePageHtml(html) {
  return isPageHtmlEmpty(html) ? EMPTY_PAGE_HTML : String(html);
}

export function buildRootDataFromHtml(html) {
  return splitHtmlIntoPages(html).map((pageHtml, index) => ({
    name: createPageRootName(index),
    html: pageHtml,
  }));
}

export function splitHtmlIntoPages(html) {
  if (typeof window === "undefined") {
    return [normalizePageHtml(html)];
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(`<body>${html}</body>`, "text/html");
  const pages = [[]];

  Array.from(document.body.childNodes).forEach((node) => {
    if (isPageBreakNode(node)) {
      pages.push([]);
      return;
    }

    pages.at(-1).push(serializeNode(node));
  });

  return trimTrailingEmptyPages(
    pages.map((page) => normalizePageHtml(page.join(""))),
  );
}

export function serializePagesToHtml(pageHtmlList) {
  return trimTrailingEmptyPages(
    pageHtmlList.map((pageHtml) => normalizePageHtml(pageHtml)),
  ).join(PAGE_BREAK_HTML);
}

export function splitTopLevelHtml(html) {
  if (typeof window === "undefined") {
    return [normalizePageHtml(html)];
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(`<body>${html}</body>`, "text/html");
  const blocks = Array.from(document.body.childNodes)
    .map((node) => serializeNode(node))
    .filter(Boolean);

  return blocks.length > 0 ? blocks : [EMPTY_PAGE_HTML];
}

export function joinTopLevelHtml(blocks) {
  return normalizePageHtml(blocks.join(""));
}

export function trimTrailingEmptyPages(pageHtmlList) {
  const nextPages = [...pageHtmlList];

  while (nextPages.length > 1 && isPageHtmlEmpty(nextPages.at(-1))) {
    nextPages.pop();
  }

  return nextPages.length > 0 ? nextPages : [EMPTY_PAGE_HTML];
}

export function isPageHtmlEmpty(html) {
  const normalized = String(html ?? "")
    .replace(/<span[^>]*data-page-break="true"[^>]*><\/span>/gi, "")
    .replace(/&nbsp;/gi, "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();

  return normalized.length === 0;
}

function isPageBreakNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const element = node;

  return (
    element.matches("[data-page-break='true']") ||
    element.querySelector?.("[data-page-break='true']")
  );
}

function serializeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  return node.outerHTML;
}
