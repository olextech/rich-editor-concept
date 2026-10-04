export const MM_TO_PX = 96 / 25.4;
export const PAGE_GAP_PX = 32;
export const PAGE_RULER_OFFSET_PX = 30;

/** @type {Record<import("./types.js").PageSize, { widthMm: number; heightMm: number }>} */
export const PAGE_PRESETS = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
};

/** @type {import("./types.js").PageSettings} */
export const DEFAULT_PAGE_SETTINGS = {
  pageSize: "A4",
  orientation: "portrait",
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
};

export function getPagePreset(pageSize) {
  return PAGE_PRESETS[pageSize] ?? PAGE_PRESETS.A4;
}

/**
 * @param {import("./types.js").PageSettings} pageSettings
 */
export function getOrientedPagePreset(pageSettings) {
  const preset = getPagePreset(pageSettings.pageSize);

  if (pageSettings.orientation === "landscape") {
    return { widthMm: preset.heightMm, heightMm: preset.widthMm };
  }

  return preset;
}

/**
 * @param {import("./types.js").PageSettings} pageSettings
 */
export function getPageMetrics(pageSettings) {
  validatePageSettings(pageSettings);
  const preset = getOrientedPagePreset(pageSettings);
  const pageWidthPx = preset.widthMm * MM_TO_PX;
  const pageHeightPx = preset.heightMm * MM_TO_PX;
  const printableWidthPx =
    (preset.widthMm - pageSettings.margins.left - pageSettings.margins.right) *
    MM_TO_PX;
  const printableHeightPx =
    (preset.heightMm - pageSettings.margins.top - pageSettings.margins.bottom) *
    MM_TO_PX;

  return {
    pageWidthMm: preset.widthMm,
    pageHeightMm: preset.heightMm,
    pageWidthPx,
    pageHeightPx,
    printableWidthPx,
    printableHeightPx,
  };
}

export function buildRulerTicks(lengthMm, stepMm = 10) {
  const ticks = [];

  for (let value = 0; value <= lengthMm; value += stepMm) {
    ticks.push({
      value,
      major: value % 50 === 0,
    });
  }

  return ticks;
}

export function validatePageSettings(settings) {
  if (!settings || !PAGE_PRESETS[settings.pageSize])
    throw new Error("Choose A4 or A5 paper.");
  if (!["portrait", "landscape"].includes(settings.orientation))
    throw new Error("Choose portrait or landscape orientation.");
  for (const side of ["top", "right", "bottom", "left"]) {
    if (
      !Number.isInteger(settings.margins?.[side]) ||
      settings.margins[side] < 0
    )
      throw new Error("Margins must be whole, non-negative millimetres.");
  }
  const { widthMm, heightMm } = getOrientedPagePreset(settings);
  if (
    settings.margins.left + settings.margins.right >= widthMm ||
    settings.margins.top + settings.margins.bottom >= heightMm
  )
    throw new Error("Margins must leave room for content on the page.");
  return settings;
}
