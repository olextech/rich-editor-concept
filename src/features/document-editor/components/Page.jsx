import { Ruler } from "./Ruler";
import { PageActionsMenu } from "./PageActionsMenu";

/**
 * Paper and rulers behind the shared editable document.
 */
export function Page({
  index,
  totalPages,
  pagePresetMm,
  pageSettings,
  onDelete,
  disabled,
}) {
  return (
    <div className="page-frame" data-page-index={index}>
      <div className="page-frame__corner" />
      <div className="page-frame__ruler--horizontal">
        <Ruler
          axis="horizontal"
          lengthMm={pagePresetMm.widthMm}
          startMarginMm={pageSettings.margins.left}
          endMarginMm={pageSettings.margins.right}
        />
      </div>
      <div className="page-frame__ruler--vertical">
        <Ruler
          axis="vertical"
          lengthMm={pagePresetMm.heightMm}
          startMarginMm={pageSettings.margins.top}
          endMarginMm={pageSettings.margins.bottom}
        />
      </div>
      <div className="page-sheet">
        <div className="page-sheet__chrome">
          <span className="page-sheet__label">
            Page {index + 1} of {totalPages}
          </span>
          <PageActionsMenu
            canDelete={!disabled && totalPages > 1}
            onDelete={onDelete}
          />
        </div>
        <div className="page-sheet__margin-guide" />
      </div>
    </div>
  );
}
