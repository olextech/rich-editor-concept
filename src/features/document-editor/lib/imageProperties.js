export const IMAGE_LAYOUTS = [
  ["inline", "Inline with text"],
  ["block", "On its own line"],
  ["side", "Wrap text"],
];

export function selectedImage(editor) {
  return editor.plugins
    .get("ImageUtils")
    .getClosestSelectedImageElement(editor.model.document.selection);
}

export function readImageProperties(editor, image) {
  const view = editor.editing.mapper.toViewElement(image);
  const dom = view && editor.editing.view.domConverter.mapViewToDom(view);
  const img = dom?.matches("img") ? dom : dom?.querySelector("img");
  return {
    pixelWidth: img
      ? Math.round(img.getBoundingClientRect().width * 100) / 100
      : undefined,
    values: {
      alt: image.getAttribute("alt") ?? "",
      width: image.getAttribute("resizedWidth") ?? "",
      layout:
        image.getAttribute("imageStyle") ??
        (image.name === "imageInline" ? "inline" : "block"),
    },
  };
}

export function validateImageWidth(number, unit) {
  if (!number.trim()) return "";
  if (
    !/^\d*\.?\d+$/.test(number.trim()) ||
    !Number.isFinite(Number(number)) ||
    Number(number) <= 0
  ) {
    return "Enter a width greater than zero.";
  }
  return unit === "%" && Number(number) > 100
    ? "Percentage width must be 100% or less."
    : "";
}
