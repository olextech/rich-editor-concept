import {
  FileText,
  Printer,
  Settings2,
  Plus,
  Trash2,
  Save,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MARGIN_FIELDS = [
  { key: "top", label: "Top" },
  { key: "right", label: "Right" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
];

function clampMargin(value) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

export function TopBar({
  templates,
  activeTemplateId,
  onTemplateChange,
  pageSettings,
  onPageSettingsChange,
  onPrint,
  onSave,
  onExport,
  onCreate,
  onDelete,
  name,
  onNameChange,
  disabled,
  busy,
  isDirty,
}) {
  function updateMargin(side, value) {
    onPageSettingsChange({
      ...pageSettings,
      margins: {
        ...pageSettings.margins,
        [side]: clampMargin(value),
      },
    });
  }

  return (
    <header className="app-header sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-2">
        {/* Brand */}
        <div className="flex items-center gap-2 pr-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Papercraft
          </span>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Template selector */}
        <div className="flex items-center gap-2">
          <Label htmlFor="template-select" className="hidden sm:flex">
            Template
          </Label>
          <Select value={activeTemplateId} onValueChange={onTemplateChange}>
            <SelectTrigger
              id="template-select"
              className="min-w-44"
              aria-label="Template"
            >
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator orientation="vertical" className="h-6 hidden md:flex" />

        {/* Page size */}
        <div className="flex items-center gap-2">
          <Label htmlFor="page-size">Size</Label>
          <Select
            value={pageSettings.pageSize}
            onValueChange={(value) =>
              onPageSettingsChange({ ...pageSettings, pageSize: value })
            }
          >
            <SelectTrigger id="page-size" size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="A5">A5</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Orientation */}
        <div className="flex items-center gap-2">
          <Label htmlFor="orientation">Orientation</Label>
          <Select
            value={pageSettings.orientation}
            onValueChange={(value) =>
              onPageSettingsChange({ ...pageSettings, orientation: value })
            }
          >
            <SelectTrigger id="orientation" size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="landscape">Landscape</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Margins */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 />
              <span className="hidden sm:inline">Margins</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">Page margins</h4>
                <p className="text-xs text-muted-foreground">
                  Margins in millimetres. Updates apply immediately.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {MARGIN_FIELDS.map(({ key, label }) => (
                  <div key={key} className="grid gap-1.5">
                    <Label htmlFor={`margin-${key}`}>{label}</Label>
                    <div className="relative">
                      <Input
                        id={`margin-${key}`}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={pageSettings.margins[key]}
                        onChange={(e) => updateMargin(key, e.target.value)}
                        className="pr-9"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                        mm
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[10, 20, 30].map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onPageSettingsChange({
                        ...pageSettings,
                        margins: {
                          top: preset,
                          right: preset,
                          bottom: preset,
                          left: preset,
                        },
                      })
                    }
                  >
                    {preset}mm
                  </Button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCreate}
            disabled={busy}
            aria-label="New template"
          >
            <Plus />
            <span className="hidden lg:inline">New</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={disabled}
            aria-label="Delete template"
          >
            <Trash2 />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={disabled}
            aria-label="Save template"
          >
            <Save />
            <span>Save</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onExport}
            disabled={disabled}
            aria-label="Export PDF"
          >
            <Download />
            <span>PDF</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onPrint}
                disabled={disabled}
                aria-label="Print document"
              >
                <Printer />
                <span className="hidden sm:inline">Print</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open browser print dialog</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t px-4 py-2">
        <Label htmlFor="template-name">Name</Label>
        <Input
          id="template-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={200}
          className="h-8 max-w-72"
        />
        <span role="status" className="text-xs text-muted-foreground">
          {busy
            ? "Working…"
            : isDirty
              ? "Unsaved changes · draft kept in this browser"
              : "Saved"}
        </span>
      </div>
    </header>
  );
}
