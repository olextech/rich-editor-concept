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
    const allowed = [
      ...contract.attributes["*"],
      ...(contract.attributes[tag] ?? []),
    ];
    for (const { name, value } of element.attributes) {
      if (!allowed.includes(name))
        throw new Error(`Unsupported attribute ${name} on <${tag}>.`);
      if (
        name === "class" &&
        value.split(/\s+/).some((c) => c && !contract.classes.includes(c))
      )
        throw new Error(`Unsupported class on <${tag}>.`);
      if (name === "style") validateStyle(value);
      if (name === "href" && !/^(https?:\/\/|mailto:|tel:|#)/i.test(value))
        throw new Error(
          "Links must use https, http, mailto, tel, or a fragment.",
        );
      if (
        name === "src" &&
        !/^data:image\/(png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(value)
      )
        throw new Error(
          "Images must be uploaded PNG, JPEG, GIF, or WebP files.",
        );
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
  return html;
}
function validateStyle(style) {
  if (/[\\{}@<>]|\/\*|url\s*\(|expression\s*\(|var\s*\(/i.test(style))
    throw new Error("Unsupported CSS in source HTML.");
  for (const declaration of style.split(";").filter((v) => v.trim())) {
    const colon = declaration.indexOf(":");
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (
      colon < 0 ||
      !contract.styles.includes(property) ||
      !value ||
      !/^[\w\s#.,%()'"+-]+$/.test(value) ||
      /(?:^|\s)-\d/.test(value)
    )
      throw new Error(`Unsupported CSS property or value: ${property}.`);
    if (/[()]/.test(value) && !/^(rgba?|hsla?)\([\d\s.,%]+\)$/i.test(value))
      throw new Error("Only color functions are supported in CSS.");
  }
}
