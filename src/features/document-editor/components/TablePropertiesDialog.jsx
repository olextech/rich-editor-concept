import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { validateTableProperty } from "../lib/tableProperties";

const BORDER_STYLES = [
  ["solid", "Solid"],
  ["dashed", "Dashed"],
  ["dotted", "Dotted"],
  ["double", "Double"],
];
const HORIZONTAL_ALIGNMENTS = [
  ["left", "Left"],
  ["center", "Center"],
  ["right", "Right"],
];
const VERTICAL_ALIGNMENTS = [
  ["top", "Top"],
  ["middle", "Middle"],
  ["bottom", "Bottom"],
];
const COLORS = [
  ["#ffffff", "White"],
  ["#f1f5f9", "Light gray"],
  ["#dbeafe", "Light blue"],
  ["#dcfce7", "Light green"],
  ["#fef3c7", "Light yellow"],
  ["#fee2e2", "Light red"],
  ["#bfbfbf", "Silver"],
  ["#b3b3b3", "Gray"],
  ["#64748b", "Slate"],
  ["#000000", "Black"],
];
const FIELD_ROW =
  "grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[100px_minmax(0,1fr)]";

function dimension(value, pixels) {
  if (!value) return { number: "", unit: "px" };
  const match = value.match(/^(\d*\.?\d+)(px|%)?$/i);
  return match
    ? { number: match[1], unit: match[2]?.toLowerCase() || "px" }
    : { number: pixels === undefined ? "" : String(pixels), unit: "px" };
}

function colorKey(value) {
  if (!value || !CSS.supports("color", value)) return "";
  const context = document.createElement("canvas").getContext("2d");
  context.fillStyle = value;
  return context.fillStyle.toLowerCase();
}

export function TablePropertiesDialog({ properties, onClose, onSave }) {
  const id = useId();
  const [dialog, setDialog] = useState(null);
  const [values, setValues] = useState(properties.values);
  const [borderEnabled, setBorderEnabled] = useState(properties.borderEnabled);
  const borderStyle = useRef(
    properties.values.borderStyle &&
      !["none", "hidden"].includes(properties.values.borderStyle)
      ? properties.values.borderStyle
      : "solid",
  );
  const [dimensions, setDimensions] = useState(() =>
    Object.fromEntries(
      ["width", "height"].map((property) => [
        property,
        dimension(
          properties.values[property],
          properties.pixelDimensions?.[property],
        ),
      ]),
    ),
  );
  const [errors, setErrors] = useState({});
  const [edited, setEdited] = useState(new Set());
  const isCell = properties.kind === "cell";
  const title = isCell ? "Cell properties" : "Table properties";

  useEffect(() => {
    if (!dialog) return;
    const previousActiveElement = document.activeElement;
    dialog.showModal();
    dialog.querySelector("input")?.focus();
    return () => {
      dialog.close();
      if (previousActiveElement?.isConnected) previousActiveElement.focus();
    };
  }, [dialog]);

  function update(property, value) {
    if (property === "borderStyle" && value !== "none") {
      borderStyle.current = value;
      setBorderEnabled(true);
    }
    setValues((current) => ({ ...current, [property]: value }));
    setErrors((current) => ({ ...current, [property]: "" }));
    setEdited((current) => new Set(current).add(property));
  }

  function fieldState(property) {
    return {
      fieldId: `${id}-${property}`,
      errorId: `${id}-${property}-error`,
      isMixed: properties.mixed[property] && !edited.has(property),
    };
  }

  function errorMessage(property) {
    return errors[property] ? (
      <p
        id={`${id}-${property}-error`}
        role="alert"
        className="col-start-2 text-xs text-destructive"
      >
        {errors[property]}
      </p>
    ) : null;
  }

  function textField(property, label, { disabled = false } = {}) {
    const { fieldId, errorId, isMixed } = fieldState(property);
    return (
      <div className={FIELD_ROW}>
        <Label htmlFor={fieldId}>{label}</Label>
        <Input
          id={fieldId}
          value={values[property]}
          placeholder={isMixed ? "Mixed" : "Auto"}
          disabled={disabled}
          aria-invalid={Boolean(errors[property])}
          aria-describedby={errors[property] ? errorId : undefined}
          className="h-8"
          onChange={(event) => update(property, event.target.value)}
        />
        {errorMessage(property)}
      </div>
    );
  }

  function dimensionField(property, label) {
    const { fieldId, errorId, isMixed } = fieldState(property);
    const current = dimensions[property];
    function change(number, unit, unitOnly = false) {
      setDimensions((previous) => ({
        ...previous,
        [property]: { number, unit },
      }));
      // Choosing a unit for an empty or mixed field doesn't change its size.
      if (!unitOnly || number.trim()) {
        update(property, number.trim() ? `${number.trim()}${unit}` : "");
      }
    }
    return (
      <div className={FIELD_ROW}>
        <Label htmlFor={fieldId}>{label}</Label>
        <div className="flex min-w-0">
          <Input
            id={fieldId}
            value={current.number}
            inputMode="decimal"
            placeholder={isMixed ? "Mixed" : "Auto"}
            aria-invalid={Boolean(errors[property])}
            aria-describedby={errors[property] ? errorId : undefined}
            className="relative z-0 h-8 min-w-0 rounded-r-none focus-visible:z-10"
            onChange={(event) => change(event.target.value, current.unit)}
          />
          <Select
            value={current.unit}
            onValueChange={(unit) => change(current.number, unit, true)}
          >
            <SelectTrigger
              size="sm"
              aria-label={`${label} unit`}
              className="relative -ml-px w-16 shrink-0 rounded-l-none px-2 focus-visible:z-10"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={dialog} className="min-w-16">
              <SelectItem value="%">%</SelectItem>
              <SelectItem value="px">px</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {errorMessage(property)}
      </div>
    );
  }

  function selectField(
    property,
    label,
    options,
    { disabled = false, inline = false } = {},
  ) {
    const { fieldId, isMixed } = fieldState(property);
    const value =
      property === "borderStyle" && borderEnabled === false
        ? borderStyle.current
        : values[property];
    const custom = value && !options.some(([option]) => option === value);
    return (
      <div className={inline ? "min-w-0 flex-1" : FIELD_ROW}>
        <Label htmlFor={fieldId} className={inline ? "sr-only" : undefined}>
          {property === "alignment" ? "Alignment" : label}
        </Label>
        <Select
          value={value}
          disabled={disabled}
          onValueChange={(value) => update(property, value)}
        >
          <SelectTrigger
            id={fieldId}
            aria-label={label}
            size="sm"
            className={`w-full min-w-0 [&>span]:truncate ${inline ? "gap-1 px-2" : ""}`}
          >
            <SelectValue placeholder={isMixed ? "Mixed" : "Default"}>
              {custom ? "Custom" : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent container={dialog}>
            {options.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  function colorField(
    property,
    label,
    { disabled = false, clearable = false } = {},
  ) {
    const { isMixed } = fieldState(property);
    const currentColor = colorKey(values[property]);
    const custom =
      currentColor &&
      !COLORS.some(([color]) => colorKey(color) === currentColor);
    return (
      <div className={FIELD_ROW}>
        <div className="space-y-1">
          <Label id={`${id}-${property}-label`}>
            {property === "backgroundColor" ? "Background" : label}
          </Label>
          {isMixed || custom ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {custom ? (
                <span
                  aria-hidden="true"
                  className="size-3 rounded-sm border border-border"
                  style={{ backgroundColor: values[property] }}
                />
              ) : null}
              {isMixed ? "Mixed" : "Custom"}
            </span>
          ) : null}
        </div>
        <div
          role="group"
          aria-label={`${label} presets`}
          aria-disabled={disabled}
          className="flex min-w-0 flex-wrap items-center gap-1"
        >
          {COLORS.map(([color, name]) => (
            <Button
              key={color}
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={disabled}
              className="size-6 rounded-full p-0.5 aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-1"
              aria-label={name}
              title={name}
              aria-pressed={!isMixed && currentColor === colorKey(color)}
              onClick={() => update(property, color)}
            >
              <span
                aria-hidden="true"
                className="size-full rounded-full border border-black/10"
                style={{ backgroundColor: color }}
              />
            </Button>
          ))}
          {clearable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Clear"
              title="Clear background color"
              className="size-6 rounded-full"
              onClick={() => update(property, "")}
            >
              <RotateCcw className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  function submit(event) {
    event.preventDefault();
    const changes = Object.fromEntries(
      Object.entries(values).filter(
        ([property, value]) =>
          value !== properties.values[property] ||
          (properties.mixed[property] && edited.has(property)),
      ),
    );
    // Applying preferences uses a single border thickness, including imported
    // borders and mixed selections. Opening or cancelling changes nothing.
    if (properties.values.borderWidth !== "1px" || changes.borderStyle) {
      changes.borderWidth = "1px";
    }
    const nextErrors = Object.fromEntries(
      Object.entries(changes)
        .map(([property, value]) => [
          property,
          validateTableProperty(property, value),
        ])
        .filter(([, error]) => error),
    );
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(`${id}-${firstInvalid}`)?.focus();
      return;
    }
    onSave(properties.kind, changes);
  }

  return (
    <dialog
      ref={setDialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={
        isCell && properties.selectedCellCount > 1
          ? `${id}-description`
          : undefined
      }
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto w-[min(460px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-visible rounded-lg border border-border bg-background text-foreground shadow-2xl backdrop:bg-black/45"
    >
      <form
        onSubmit={submit}
        className="flex max-h-[calc(100dvh-32px)] flex-col"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="space-y-0.5">
            <h2 id={`${id}-title`} className="text-sm font-semibold">
              {title}
            </h2>
            {isCell && properties.selectedCellCount > 1 ? (
              <p
                id={`${id}-description`}
                className="text-xs text-muted-foreground"
              >
                {properties.selectedCellCount} selected cells
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4">
          <section aria-label="Size and alignment" className="space-y-2.5">
            {dimensionField("width", "Width")}
            {dimensionField("height", "Height")}
            {isCell ? (
              <>
                <div className={FIELD_ROW}>
                  <Label id={`${id}-alignment-label`}>Alignment</Label>
                  <div
                    role="group"
                    aria-labelledby={`${id}-alignment-label`}
                    className="flex min-w-0 gap-2"
                  >
                    {selectField(
                      "horizontalAlignment",
                      "Horizontal alignment",
                      [...HORIZONTAL_ALIGNMENTS, ["justify", "Justify"]],
                      { inline: true },
                    )}
                    {selectField(
                      "verticalAlignment",
                      "Vertical alignment",
                      VERTICAL_ALIGNMENTS,
                      { inline: true },
                    )}
                  </div>
                </div>
                {textField("padding", "Cell padding")}
              </>
            ) : (
              selectField("alignment", "Table alignment", HORIZONTAL_ALIGNMENTS)
            )}
          </section>

          <section
            aria-label="Border"
            className="space-y-3 border-t border-border pt-4"
          >
            <div className={FIELD_ROW}>
              <Label htmlFor={`${id}-border-enabled`}>Border</Label>
              <div className="flex min-w-0 items-center gap-3">
                {borderEnabled === null ? (
                  <span className="text-xs text-muted-foreground">Mixed</span>
                ) : null}
                <Button
                  id={`${id}-border-enabled`}
                  type="button"
                  role="switch"
                  aria-label="Border"
                  aria-checked={borderEnabled === true}
                  variant="ghost"
                  className="relative h-5 w-9 rounded-full bg-input p-0 hover:bg-input aria-checked:bg-primary aria-checked:hover:bg-primary"
                  onClick={() => {
                    const enabled = borderEnabled !== true;
                    setBorderEnabled(enabled);
                    update(
                      "borderStyle",
                      enabled ? borderStyle.current : "none",
                    );
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0.5 size-4 rounded-full bg-background shadow-xs transition-transform ${borderEnabled === true ? "translate-x-4" : "translate-x-0"}`}
                  />
                </Button>
                {selectField("borderStyle", "Border style", BORDER_STYLES, {
                  disabled: borderEnabled === false,
                  inline: true,
                })}
              </div>
            </div>
            {colorField("borderColor", "Border color", {
              disabled: borderEnabled === false,
            })}
          </section>

          <section
            aria-label="Background"
            className="border-t border-border pt-4"
          >
            {colorField("backgroundColor", "Background color", {
              clearable: true,
            })}
          </section>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Apply
          </Button>
        </div>
      </form>
    </dialog>
  );
}
