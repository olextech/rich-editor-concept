import contract from "../../../../shared/html-contract.json";

export function validateHtml(html) {
  if (typeof html !== "string" || html.length > contract.maxHtmlLength)
    throw new Error("HTML must be text smaller than 8 MB.");
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const element of template.content.querySelectorAll("*")) {
    const tag = element.localName;
    if (!contract.tags.includes(tag))
      throw new Error(`Unsupported HTML element: <${tag}>.`);
    for (const { name, value } of element.attributes) {
      validateAttribute(tag, name, value);
    }
    validatePageBreak(element);
  }
  return html;
}

// Remove markup outside the same contract used by Apply. Work in an inert
// fragment so legacy scripts, resource URLs, and event handlers cannot run.
export function cleanHtml(html) {
  if (typeof html !== "string" || html.length > contract.maxHtmlLength)
    throw new Error("HTML must be text smaller than 8 MB.");
  const template = document.createElement("template");
  template.innerHTML = html;
  const borderlessTables = new Set();
  const discardContents = new Set([
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "template",
    "noscript",
    "head",
    "title",
    "meta",
    "link",
    "base",
  ]);
  for (const element of template.content.querySelectorAll("*")) {
    // Descendants of discarded elements must not be moved back into the result.
    if (!template.content.contains(element)) continue;
    const tag = element.localName;
    if (
      element.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
      discardContents.has(tag)
    ) {
      element.remove();
      continue;
    }
    if (!contract.tags.includes(tag)) {
      while (element.firstChild) {
        element.before(element.firstChild);
      }
      element.remove();
      continue;
    }
    const borderlessTable =
      tag === "table" &&
      (element.getAttribute("border")?.trim() === "0" ||
        element.style.borderStyle === "none");
    // CKEditor stores table dimensions on its figure wrapper. Row heights
    // also constrain cells, so clean the complete table structure.
    const tableStructure =
      ["table", "thead", "tbody", "tfoot", "tr", "th", "td"].includes(tag) ||
      (tag === "figure" &&
        (element.classList.contains("table") ||
          element.querySelector(":scope > table")));
    for (const { name, value } of Array.from(element.attributes)) {
      let cleaned = value;
      if (name === "class") {
        cleaned = value
          .split(/\s+/)
          .filter((c) => contract.classes.includes(c))
          .join(" ");
      }
      if (name === "style") {
        cleaned = value
          .split(";")
          .filter((declaration) => {
            if (!declaration.trim()) return false;
            const property = declaration.split(":", 1)[0].trim().toLowerCase();
            if (
              tableStructure &&
              (property === "height" ||
                /^border(?:-(?:top|right|bottom|left))?-style$/.test(property))
            )
              return false;
            try {
              validateStyle(declaration);
              return true;
            } catch {
              return false;
            }
          })
          .join(";");
      }
      try {
        validateAttribute(tag, name, cleaned);
        if (!cleaned && (name === "class" || name === "style")) {
          element.removeAttribute(name);
        } else if (cleaned !== value) {
          element.setAttribute(name, cleaned);
        }
      } catch {
        element.removeAttribute(name);
      }
    }
    if (borderlessTable) {
      borderlessTables.add(element);
    }
  }
  // Apply after sanitizing every cell so no later border declaration overrides
  // the legacy table's borderless setting. Nested tables keep their own borders.
  for (const table of borderlessTables) {
    removeBorders(table);
    for (const cell of table.querySelectorAll("th, td")) {
      if (cell.closest("table") === table) removeBorders(cell);
    }
  }
  // Check placement after unsupported wrappers have been unwrapped.
  for (const element of template.content.querySelectorAll(
    "[data-page-break]",
  )) {
    try {
      validatePageBreak(element);
    } catch {
      element.removeAttribute("data-page-break");
    }
  }
  const comments = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_COMMENT,
  );
  const toRemove = [];
  while (comments.nextNode()) toRemove.push(comments.currentNode);
  for (const comment of toRemove) comment.remove();
  return validateHtml(template.innerHTML);
}

function removeBorders(element) {
  const styles = (element.getAttribute("style") ?? "")
    .split(";")
    .filter(
      (declaration) =>
        declaration.trim() &&
        declaration.split(":", 1)[0].trim().toLowerCase() !== "border-style",
    );
  styles.push("border-style:none");
  element.setAttribute("style", styles.join(";"));
}

function validateAttribute(tag, name, value) {
  const allowed = [
    ...contract.attributes["*"],
    ...(contract.attributes[tag] ?? []),
  ];
  if (!allowed.includes(name))
    throw new Error(`Unsupported attribute ${name} on <${tag}>.`);
  if (
    name === "class" &&
    value.split(/\s+/).some((c) => c && !contract.classes.includes(c))
  )
    throw new Error(`Unsupported class on <${tag}>.`);
  if (name === "style") validateStyle(value);
  if (name === "href" && !/^(https?:\/\/|mailto:|tel:|#)/i.test(value))
    throw new Error("Links must use https, http, mailto, tel, or a fragment.");
  if (
    name === "src" &&
    !/^data:image\/(png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(value)
  )
    throw new Error("Images must be uploaded PNG, JPEG, GIF, or WebP files.");
  if (name === "data-page-break" && value !== "true")
    throw new Error('Page break markers must have data-page-break="true".');
  if (
    ["width", "height", "colspan", "rowspan", "span"].includes(name) &&
    (!/^\d+$/.test(value) || Number(value) > 10000)
  )
    throw new Error(`Invalid ${name}.`);
  if (["start", "value"].includes(name) && !/^-?\d{1,6}$/.test(value))
    throw new Error(`Invalid ${name}.`);
  if (name === "target" && !["_blank", "_self"].includes(value))
    throw new Error("Unsupported link target.");
  if (name === "rel" && !/^(noopener|noreferrer|nofollow|\s)*$/.test(value))
    throw new Error("Unsupported link relationship.");
  if (
    name === "scope" &&
    !["row", "col", "rowgroup", "colgroup"].includes(value)
  )
    throw new Error("Unsupported table scope.");
  if (name === "type" && !["1", "a", "A", "i", "I"].includes(value))
    throw new Error("Unsupported list type.");
}

function validatePageBreak(element) {
  const tag = element.localName;
  if (element.hasAttribute("data-page-break")) {
    if (element.children.length || element.textContent.trim())
      throw new Error("A page break marker must be empty.");
    const parent = element.parentElement;
    if (
      parent &&
      !(
        tag === "span" &&
        parent.localName === "p" &&
        parent.childElementCount === 1 &&
        !parent.textContent.trim() &&
        !parent.parentElement
      )
    )
      throw new Error("Page breaks must be top-level blocks.");
  }
}

function validateStyle(style) {
  if (/[\\{}@<>]|\/\*|url\s*\(|expression\s*\(|var\s*\(/i.test(style))
    throw new Error("Unsupported CSS in source HTML.");
  for (const declaration of style.split(";").filter((v) => v.trim())) {
    const colon = declaration.indexOf(":");
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    const supportedValue =
      property === "aspect-ratio"
        ? isAspectRatio(value)
        : /^[\w\s#.,%()'"+-]+$/.test(value) && !/(?:^|\s)-\d/.test(value);
    if (
      colon < 0 ||
      !contract.styles.includes(property) ||
      !value ||
      !supportedValue
    )
      throw new Error(`Unsupported CSS property or value: ${property}.`);
    if (/[()]/.test(value) && !/^(rgba?|hsla?)\([\d\s.,%]+\)$/i.test(value))
      throw new Error("Only color functions are supported in CSS.");
  }
}

function isAspectRatio(value) {
  if (value.toLowerCase() === "auto") return true;
  const ratio = /^(?:auto\s+)?(\d*\.?\d+)(?:\s*\/\s*(\d*\.?\d+))?$/i.exec(
    value,
  );
  return (
    Boolean(ratio) &&
    [ratio[1], ratio[2] ?? "1"]
      .map(Number)
      .every((number) => Number.isFinite(number) && number > 0)
  );
}
