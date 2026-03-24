import Ruler from "./Ruler";
import { getOrientedPagePreset, getPageMetrics } from "../lib/pageGeometry";

export default function PagedWorkspace({
  pageRoots,
  pageSettings,
  renderPageContent,
  renderPageActions,
}) {
  const pagePreset = getOrientedPagePreset(pageSettings);
  const metrics = getPageMetrics(pageSettings);
  const resolvedPageCount = Math.max(pageRoots.length, 1);
  const rulerSizePx = 28;
  const rulerGapPx = 8;
  const pageGapPx = 28;
  const frameOffsetPx = rulerSizePx + rulerGapPx;
  const frameHeightPx = metrics.pageHeightPx + frameOffsetPx;
  const documentHeightPx =
    resolvedPageCount * frameHeightPx + (resolvedPageCount - 1) * pageGapPx;

  const style = {
    "--page-width-mm": pagePreset.widthMm,
    "--page-height-mm": pagePreset.heightMm,
    "--page-margin-top-mm": pageSettings.margins.top,
    "--page-margin-right-mm": pageSettings.margins.right,
    "--page-margin-bottom-mm": pageSettings.margins.bottom,
    "--page-margin-left-mm": pageSettings.margins.left,
    "--page-width-px": `${metrics.pageWidthPx}px`,
    "--page-height-px": `${metrics.pageHeightPx}px`,
    "--document-height-px": `${documentHeightPx}px`,
    "--ruler-size-px": `${rulerSizePx}px`,
    "--ruler-gap-px": `${rulerGapPx}px`,
    "--frame-offset-px": `${frameOffsetPx}px`,
    "--frame-height-px": `${frameHeightPx}px`,
    "--page-gap-px": `${pageGapPx}px`,
  };

  return (
    <div className="editor-shell__surface">
      <div className="paged-workspace" style={style}>
        <div className="paged-workspace__document">
          {pageRoots.map((rootName, index) => (
            <div
              key={rootName}
              className="paged-workspace__frame"
              style={{ "--page-index": index }}
            >
              <div className="paged-workspace__frame-grid">
                <div className="paged-workspace__corner" />
                <Ruler
                  axis="horizontal"
                  lengthMm={pagePreset.widthMm}
                  startMarginMm={pageSettings.margins.left}
                  endMarginMm={pageSettings.margins.right}
                />
                <Ruler
                  axis="vertical"
                  lengthMm={pagePreset.heightMm}
                  startMarginMm={pageSettings.margins.top}
                  endMarginMm={pageSettings.margins.bottom}
                />
                <div className="paged-workspace__sheet">
                  <div className="paged-workspace__sheet-header">
                    <span className="paged-workspace__sheet-label">
                      Page {index + 1}
                    </span>
                    {renderPageActions(rootName, index)}
                  </div>
                  <div className="paged-workspace__margin-mask paged-workspace__margin-mask--top" />
                  <div className="paged-workspace__margin-mask paged-workspace__margin-mask--right" />
                  <div className="paged-workspace__margin-mask paged-workspace__margin-mask--bottom" />
                  <div className="paged-workspace__margin-mask paged-workspace__margin-mask--left" />
                  <div className="paged-workspace__sheet-printable" />
                  <div className="paged-workspace__page-content">
                    {renderPageContent(rootName, index)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
