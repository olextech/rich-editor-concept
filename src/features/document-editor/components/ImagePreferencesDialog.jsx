import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
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
import { IMAGE_LAYOUTS, validateImageWidth } from "../lib/imageProperties";

export function ImagePreferencesDialog({ properties, onClose, onSave }) {
  const id = useId();
  const [dialog, setDialog] = useState(null);
  const [values, setValues] = useState(properties.values);
  const [width, setWidth] = useState(() => {
    const value = properties.values.width;
    if (!value) return { number: "", unit: "px" };
    const match = value.match(/^(\d*\.?\d+)(px|%)?$/i);
    return match
      ? { number: match[1], unit: match[2]?.toLowerCase() || "px" }
      : { number: String(properties.pixelWidth ?? ""), unit: "px" };
  });
  const [widthEdited, setWidthEdited] = useState(false);
  const [widthError, setWidthError] = useState("");
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
    setValues((previous) => ({ ...previous, [property]: value }));
  }

  function changeWidth(number, unit, unitOnly = false) {
    setWidth({ number, unit });
    setWidthError("");
    if (!unitOnly || number.trim()) setWidthEdited(true);
  }

  function submit(event) {
    event.preventDefault();
    const error = widthEdited
      ? validateImageWidth(width.number, width.unit)
      : "";
    setWidthError(error);
    if (error) {
      document.getElementById(`${id}-width`)?.focus();
      return;
    }
    const changes = Object.fromEntries(
      Object.entries(values).filter(
        ([property, value]) =>
          property !== "width" && value !== properties.values[property],
      ),
    );
    const nextWidth = width.number.trim()
      ? `${width.number.trim()}${width.unit}`
      : "";
    if (widthEdited && nextWidth !== properties.values.width)
      changes.width = nextWidth;
    onSave(changes);
  }

  const customLayout = !IMAGE_LAYOUTS.some(
    ([layout]) => layout === values.layout,
  );
  return (
    <dialog
      ref={setDialog}
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto w-[min(440px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-visible rounded-lg border border-border bg-background text-foreground shadow-2xl backdrop:bg-black/45"
    >
      <form
        onSubmit={submit}
        className="flex max-h-[calc(100dvh-32px)] flex-col"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={`${id}-title`} className="text-sm font-semibold">
            Image preferences
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close image preferences"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid content-start gap-1">
              <Label htmlFor={`${id}-layout`}>Layout</Label>
              <Select
                value={values.layout}
                onValueChange={(layout) => update("layout", layout)}
              >
                <SelectTrigger
                  id={`${id}-layout`}
                  size="sm"
                  className="w-full min-w-0 [&>span]:truncate"
                >
                  <SelectValue>
                    {customLayout ? "Current layout" : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent container={dialog}>
                  {IMAGE_LAYOUTS.map(([layout, label]) => (
                    <SelectItem key={layout} value={layout}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid content-start gap-1">
              <Label htmlFor={`${id}-width`}>Width</Label>
              <div className="flex gap-1.5">
                <Input
                  id={`${id}-width`}
                  inputMode="decimal"
                  value={width.number}
                  placeholder="Original"
                  aria-invalid={Boolean(widthError)}
                  aria-describedby={
                    widthError ? `${id}-width-error` : `${id}-width-help`
                  }
                  className="h-8"
                  onChange={(event) =>
                    changeWidth(event.target.value, width.unit)
                  }
                />
                <Select
                  value={width.unit}
                  onValueChange={(unit) =>
                    changeWidth(width.number, unit, true)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="Width unit"
                    className="w-16 shrink-0 px-2"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent container={dialog} className="min-w-16">
                    <SelectItem value="%">%</SelectItem>
                    <SelectItem value="px">px</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {widthError ? (
                <p
                  id={`${id}-width-error`}
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {widthError}
                </p>
              ) : null}
            </div>
            <p
              id={`${id}-width-help`}
              className="col-span-2 -mt-1 text-xs text-muted-foreground"
            >
              Leave width empty to use the original size.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-alt`}>Alternative text</Label>
            <Input
              id={`${id}-alt`}
              value={values.alt}
              placeholder="Describe the image"
              aria-describedby={`${id}-alt-help`}
              className="h-8"
              onChange={(event) => update("alt", event.target.value)}
            />
            <p id={`${id}-alt-help`} className="text-xs text-muted-foreground">
              For screen readers. Leave blank for decorative images.
            </p>
          </div>
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
