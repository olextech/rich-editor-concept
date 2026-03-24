export const MM_TO_PX = 3.6;

export const PAGE_PRESETS = {
  A4: {
    widthMm: 210,
    heightMm: 297,
  },
  A5: {
    widthMm: 148,
    heightMm: 210,
  },
};

export const DEFAULT_PAGE_SETTINGS = {
  pageSize: "A4",
  orientation: "portrait",
  margins: {
    top: 18,
    right: 16,
    bottom: 18,
    left: 16,
  },
};

export function getPagePreset(pageSize) {
  return PAGE_PRESETS[pageSize] ?? PAGE_PRESETS.A4;
}

export function getOrientedPagePreset(pageSettings) {
  const preset = getPagePreset(pageSettings.pageSize);

  if (pageSettings.orientation === "landscape") {
    return {
      widthMm: preset.heightMm,
      heightMm: preset.widthMm,
    };
  }

  return preset;
}

export function getPageMetrics(pageSettings) {
  const pagePreset = getOrientedPagePreset(pageSettings);
  const pageWidthPx = pagePreset.widthMm * MM_TO_PX;
  const pageHeightPx = pagePreset.heightMm * MM_TO_PX;
  const printableWidthPx =
    (pagePreset.widthMm -
      pageSettings.margins.left -
      pageSettings.margins.right) *
    MM_TO_PX;
  const printableHeightPx =
    (pagePreset.heightMm -
      pageSettings.margins.top -
      pageSettings.margins.bottom) *
    MM_TO_PX;

  return {
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
