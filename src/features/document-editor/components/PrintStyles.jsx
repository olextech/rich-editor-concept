/**
 * Renders a <style> tag with an `@page` rule matching the active page
 * settings. Browser print uses canonical HTML, without editing-only page gaps.
 */
export function PrintStyles({ pageSettings }) {
  const metrics = getPageMetrics(pageSettings);
  const printableWidthMm =
    metrics.pageWidthMm -
    pageSettings.margins.left -
    pageSettings.margins.right;
  const css = `
    @page {
      size: ${pageSettings.pageSize} ${pageSettings.orientation};
      margin: ${pageSettings.margins.top}mm ${pageSettings.margins.right}mm ${pageSettings.margins.bottom}mm ${pageSettings.margins.left}mm;
    }
    @media print {
      html, body, #root, .browser-print-document {
        width: ${printableWidthMm}mm !important;
      }
    }
  `;

  return <style data-print-styles="true">{css}</style>;
}
import { getPageMetrics } from "../lib/pageGeometry";
