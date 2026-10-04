import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MM_TO_PX,
  PAGE_GAP_PX,
  PAGE_RULER_OFFSET_PX,
  getOrientedPagePreset,
  getPageMetrics,
} from "../lib/pageGeometry";
import { Page } from "./Page";

/**
 * Scrollable canvas around the page stack. Renders pages vertically with
 * spacing, plus an Add Page button below the last page.
 */
export function Workspace({
  pageNames,
  pageSettings,
  toolbarHostRef,
  registerEditableHost,
  onAddPage,
  onDeletePage,
  disabled,
}) {
  const pagePresetMm = getOrientedPagePreset(pageSettings);
  const metrics = getPageMetrics(pageSettings);

  const style = {
    "--mm-to-px": `${MM_TO_PX}px`,
    "--page-gap-px": `${PAGE_GAP_PX}px`,
    "--ruler-offset-px": `${PAGE_RULER_OFFSET_PX}px`,
    "--page-width-px": `${metrics.pageWidthPx}px`,
    "--page-height-px": `${metrics.pageHeightPx}px`,
    "--page-content-height-px": `${metrics.printableHeightPx}px`,
    "--page-pitch-px": `${metrics.pageHeightPx + PAGE_RULER_OFFSET_PX + PAGE_GAP_PX}px`,
    "--printable-height-px": `${metrics.printableHeightPx - 32}px`,
    "--page-margin-top-mm": pageSettings.margins.top,
    "--page-margin-right-mm": pageSettings.margins.right,
    "--page-margin-bottom-mm": pageSettings.margins.bottom,
    "--page-margin-left-mm": pageSettings.margins.left,
  };

  return (
    <div className="workspace-scroll min-h-0 min-w-0 flex-1">
      <div ref={toolbarHostRef} className="ck-toolbar-host" />
      <div className="page-stack" style={style}>
        <div className="document-canvas">
          {pageNames.map((name, index) => (
            <Page
              key={name}
              index={index}
              totalPages={pageNames.length}
              pagePresetMm={pagePresetMm}
              pageSettings={pageSettings}
              onDelete={() => onDeletePage(name)}
              disabled={disabled}
            />
          ))}
          <div className="document-editable-host" ref={registerEditableHost} />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onAddPage}
          disabled={disabled}
          className="add-page-button gap-2 mt-2"
        >
          <Plus />
          Add page
        </Button>
      </div>
    </div>
  );
}
