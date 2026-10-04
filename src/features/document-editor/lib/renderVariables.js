import tableVariables from "../../../../shared/table-variables.json";

const INLINE_TAGS = new Set([
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "a",
]);

function forEachTextRun(
  root,
  callback,
  values = {},
  contexts = new Map(),
  skipTables = false,
) {
  let nodes = [];
  let currentValues = values;

  function flush() {
    if (nodes.length) callback(nodes, currentValues);
    nodes = [];
  }

  function visit(node, context) {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push(node);
      currentValues = context;
      return;
    }
    const boundary = !INLINE_TAGS.has(node.localName);
    if (boundary) flush();
    if (skipTables && node !== root && node.localName === "table") return;
    const next = contexts.get(node) ?? context;
    for (const child of node.childNodes) visit(child, next);
    if (boundary) flush();
  }
  visit(root, values);
}

function hasItemVariables(row) {
  let found = false;
  forEachTextRun(
    row,
    (nodes) => {
      const text = nodes.map((node) => node.data).join("");
      if (tableVariables.bodyVariables.some((token) => text.includes(token)))
        found = true;
    },
    {},
    new Map(),
    true,
  );
  return found;
}

function rowGroups(section) {
  const rows = Array.from(section.children).filter(
    (node) => node.localName === "tr",
  );
  const groups = [];
  for (let start = 0; start < rows.length;) {
    let end = start;
    for (let i = start; i <= end; i++) {
      for (const cell of rows[i].children) {
        const span = cell.rowSpan === 0 ? rows.length - i : cell.rowSpan || 1;
        end = Math.min(rows.length - 1, Math.max(end, i + span - 1));
      }
    }
    groups.push(rows.slice(start, end + 1));
    start = end + 1;
  }
  return groups;
}

/** Expand item rows and resolve visible text. Values never become HTML or attributes. */
export function renderVariables(html, values = {}, rows) {
  const hasFooter = /<tfoot[\s>]/i.test(html);
  if (
    !hasFooter &&
    ((!Object.keys(values).length && rows === undefined) || !html.includes("{"))
  )
    return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  const contexts = new Map();

  function expand(node) {
    if (node.localName === "table") {
      for (const child of Array.from(node.children)) {
        if (child.localName === "tfoot") node.appendChild(child);
      }
    }
    if (rows !== undefined && ["table", "tbody"].includes(node.localName)) {
      for (const group of rowGroups(node)) {
        if (!group.some(hasItemVariables)) continue;
        for (const item of rows) {
          for (const row of group) {
            const clone = row.cloneNode(true);
            node.insertBefore(clone, group[0]);
            contexts.set(clone, { ...values, ...item });
          }
        }
        for (const row of group) row.remove();
      }
    }
    for (const child of node.children) expand(child);
  }
  expand(template.content);

  forEachTextRun(
    template.content,
    (nodes, context) => {
      const slots = [];
      let text = "";
      for (const node of nodes) {
        const start = text.length;
        text += node.data;
        slots.push({ node, start, end: text.length });
      }
      // Work backwards so earlier offsets survive length changes. A token split
      // across inline formatting inherits the formatting of its first character.
      const matches = Array.from(text.matchAll(/\{[^{}\r\n]+\}/g));
      for (const match of matches.reverse()) {
        if (
          !Object.hasOwn(context, match[0]) ||
          typeof context[match[0]] !== "string"
        )
          continue;
        const start = match.index;
        const end = start + match[0].length;
        let inserted = false;
        for (const slot of slots) {
          if (slot.end <= start || slot.start >= end) continue;
          const from = Math.max(0, start - slot.start);
          const to = Math.min(slot.end, end) - slot.start;
          slot.node.data =
            slot.node.data.slice(0, from) +
            (inserted ? "" : context[match[0]]) +
            slot.node.data.slice(to);
          inserted = true;
        }
      }
    },
    values,
    contexts,
  );
  return template.innerHTML;
}
