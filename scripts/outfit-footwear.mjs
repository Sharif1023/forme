const luminance = (data, offset) =>
  data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;

const neutralFabric = (data, offset) =>
  data[offset + 3] > 60 &&
  !(data[offset] - data[offset + 2] > 19 && data[offset] > data[offset + 1] * 1.055);

const median = (values, fallback) => {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Locate footwear on the complete, untouched source photograph. Coordinates are
 * source-cell pixels; differing left/right shoe heights remain independent.
 *
 * @param {Uint8Array} data RGBA source pixels.
 * @param {number} width Source-cell width.
 * @param {number} height Source-cell height.
 * @param {{left: number, top: number, width: number, height: number}} bounds Person alpha bounds.
 * @param {{gender: "men" | "women", row: number, column: number}} pose Matrix pose.
 * @returns {{left: number, right: number, center: number}}
 */
export function findShoeBoundaries(data, width, height, bounds, { gender, row, column }) {
  const bodyCenter = bounds.left + bounds.width / 2;
  const bodyBottom = Math.min(height - 1, bounds.top + bounds.height - 1);
  const split = Math.round(bodyCenter);
  const footSums = [0, 0];
  const footCounts = [0, 0];

  // Soles provide stable foot centres even when a cropped trouser exposes skin
  // above the shoe. Warm skin and transparent pixels never enter the estimate.
  for (let y = Math.floor(bounds.top + bounds.height * 0.97); y <= bodyBottom; y++) {
    for (let x = Math.max(0, bounds.left); x < Math.min(width, bounds.left + bounds.width); x++) {
      if (!neutralFabric(data, (y * width + x) * 4)) continue;
      const side = x < split ? 0 : 1;
      footSums[side] += x;
      footCounts[side]++;
    }
  }
  const footCenters = footSums.map((sum, side) =>
    footCounts[side]
      ? sum / footCounts[side]
      : bounds.left + bounds.width * (side === 0 ? 0.33 : 0.67),
  );
  const center = Math.round((footCenters[0] + footCenters[1]) / 2);

  if (column !== 0) {
    const fraction =
      gender === "men"
        ? column === 2
          ? 0.91
          : 0.93
        : column === 2 && row === 2
          ? 0.88
          : [0.93, 0.925, 0.9][row];
    const boundary = Math.round(bounds.top + bounds.height * fraction);
    return { left: boundary, right: boundary, center };
  }

  const windowRadius = Math.max(7, Math.min(12, Math.round(bounds.width * 0.065)));
  const scanStart = Math.max(0, Math.floor(bounds.top + bounds.height * 0.86));
  const scanEnd = Math.min(bodyBottom, Math.ceil(bounds.top + bounds.height * 0.97));
  const baselineStart = Math.max(0, Math.floor(bounds.top + bounds.height * 0.82));

  const locate = (footCenter) => {
    const xStart = Math.max(0, Math.round(footCenter) - windowRadius);
    const xEnd = Math.min(width - 1, Math.round(footCenter) + windowRadius);
    const profiles = new Map();
    const trouserSamples = [];
    for (let y = baselineStart; y <= Math.min(bodyBottom, scanEnd + 5); y++) {
      const samples = [];
      for (let x = xStart; x <= xEnd; x++) {
        const offset = (y * width + x) * 4;
        if (neutralFabric(data, offset)) samples.push(luminance(data, offset));
      }
      if (samples.length < 2) continue;
      const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      profiles.set(y, { mean, samples });
      if (y < scanStart) trouserSamples.push(mean);
    }

    const trouserLevel = median(trouserSamples, 150);
    const whiteLevel = Math.min(220, Math.max(185, trouserLevel + 30));
    const isWhite = (y) => {
      const profile = profiles.get(y);
      if (!profile) return false;
      const bright = profile.samples.filter((value) => value >= whiteLevel).length;
      return bright >= Math.max(2, profile.samples.length * 0.2);
    };
    const meanRows = (start, end, fallback) => {
      const values = [];
      for (let y = start; y <= end; y++) {
        const profile = profiles.get(y);
        if (profile) values.push(profile.mean);
      }
      return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : fallback;
    };

    let strongestY = null;
    let strongestRise = 12;
    for (let y = scanStart; y <= scanEnd; y++) {
      if ([0, 1, 2, 3].filter((delta) => isWhite(y + delta)).length < 2) continue;
      const before = meanRows(y - 5, y - 2, trouserLevel);
      const after = meanRows(y, y + 3, trouserLevel);
      const rise = after - before;
      if (rise > strongestRise) {
        strongestRise = rise;
        strongestY = y;
      }
    }

    // Include the first sustained white collar/upper, not merely a brighter lace
    // lower down the shoe. Four-row support rejects isolated trouser highlights.
    const end = strongestY === null ? scanEnd : Math.min(scanEnd, strongestY + 3);
    for (let y = scanStart; y <= end; y++) {
      if ([0, 1, 2, 3].filter((delta) => isWhite(y + delta)).length >= 3) {
        return Math.max(scanStart, y - 2);
      }
    }
    return strongestY === null
      ? Math.round(bounds.top + bounds.height * 0.925)
      : Math.max(scanStart, strongestY - 2);
  };

  return { left: locate(footCenters[0]), right: locate(footCenters[1]), center };
}
