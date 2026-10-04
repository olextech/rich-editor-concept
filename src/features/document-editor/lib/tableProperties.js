export const TABLE_PROPERTY_DEFAULTS = {
  borderStyle: "double",
  borderColor: "hsl(0, 0%, 70%)",
  borderWidth: "1px",
  backgroundColor: "",
  width: "100%",
  height: "",
  alignment: "center",
};

export const CELL_PROPERTY_DEFAULTS = {
  borderStyle: "solid",
  borderColor: "hsl(0, 0%, 75%)",
  borderWidth: "1px",
  backgroundColor: "",
  width: "",
  height: "",
  padding: "",
  horizontalAlignment: "left",
  verticalAlignment: "middle",
};

export function tablePropertyCommand(kind, property) {
  return `${kind === "cell" ? "tableCell" : "table"}${property[0].toUpperCase()}${property.slice(1)}`;
}

// A selection can contain different cells or different values on each edge.
// Keep these fields untouched unless the user explicitly changes them.
function singleValue(value) {
  if (!value || typeof value !== "object") return value;
  const values = Object.values(value);
  return values.every((item) => item === values[0]) ? values[0] : null;
}

export function readTableProperties(editor, kind) {
  const selection = editor.model.document.selection;
  const cells = editor.plugins
    .get("TableUtils")
    .getSelectionAffectedTableCells(selection);
  const selectedElement = selection.getSelectedElement();
  const table = selectedElement?.is("element", "table")
    ? selectedElement
    : selection.getFirstPosition()?.findAncestor("table");
  const targets = kind === "cell" ? cells : [table];
  const defaults =
    kind === "cell" ? CELL_PROPERTY_DEFAULTS : TABLE_PROPERTY_DEFAULTS;
  const values = {};
  const mixed = {};
  for (const [property, defaultValue] of Object.entries(defaults)) {
    const attribute = tablePropertyCommand(kind, property);
    const targetValues = targets.map((target) =>
      singleValue(target?.getAttribute(attribute) ?? defaultValue),
    );
    mixed[property] =
      targetValues.some((value) => value === null) ||
      targetValues.some((value) => value !== targetValues[0]);
    values[property] = mixed[property] ? "" : (targetValues[0] ?? defaultValue);
  }
  const borderStates = targets.flatMap((target) => {
    const style =
      target?.getAttribute(tablePropertyCommand(kind, "borderStyle")) ??
      defaults.borderStyle;
    return (typeof style === "object" ? Object.values(style) : [style]).map(
      (value) => value !== "none" && value !== "hidden",
    );
  });
  const borderEnabled = borderStates.every((value) => value === borderStates[0])
    ? borderStates[0]
    : null;
  const viewElement =
    targets[0] && editor.editing.mapper.toViewElement(targets[0]);
  const domElement =
    viewElement && editor.editing.view.domConverter.mapViewToDom(viewElement);
  const bounds = domElement?.getBoundingClientRect();
  // Display imported dimensions in pixels when their unit is outside the picker.
  // The original model value remains untouched until the user edits the field.
  const pixelDimensions = bounds
    ? {
        width: Math.round(bounds.width * 100) / 100,
        height: Math.round(bounds.height * 100) / 100,
      }
    : {};
  return {
    values,
    mixed,
    borderEnabled,
    selectedCellCount: cells.length,
    pixelDimensions,
  };
}

export function validateTableProperty(property, value) {
  value = value.trim();
  if (!value) return "";
  if (property.endsWith("Color")) {
    const isColor =
      /^(#[\da-f]{3,8}|[a-z]+|(?:rgba?|hsla?)\([\d\s.,%]+\))$/i.test(value) &&
      !/^(inherit|initial|unset|revert|revert-layer|currentcolor)$/i.test(
        value,
      ) &&
      CSS.supports("color", value);
    return isColor
      ? ""
      : "Enter a valid color, such as #dbeafe or rgb(219, 234, 254).";
  }
  if (["width", "height", "padding", "borderWidth"].includes(property)) {
    if (property === "borderWidth" && /^(thin|medium|thick)$/.test(value))
      return "";
    const cssProperty = property === "borderWidth" ? "border-width" : property;
    const length =
      /^\d*\.?\d+(px|%|em|rem|cm|mm|in|pt|pc|vh|vw|vmin|vmax|ch|ex)?$/i;
    return length.test(value) &&
      CSS.supports(
        cssProperty,
        /^\d*\.?\d+$/.test(value) ? `${value}px` : value,
      )
      ? ""
      : ["width", "height"].includes(property)
        ? "Enter a non-negative size."
        : "Enter a non-negative size, such as 1px or 2cm.";
  }
  return "";
}
