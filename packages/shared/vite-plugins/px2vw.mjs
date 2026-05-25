export function px2vwPlugin({ viewportWidth = 1920, unitPrecision = 5 } = {}) {
  const pxRe = /(-?\d*\.?\d+)px\b/g;
  const toVw = (code) => code.replace(pxRe, (match, rawValue) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value === 0) return match;
    return `${Number(((value / viewportWidth) * 100).toFixed(unitPrecision))}vw`;
  });

  return {
    name: 'local-px2vw',
    enforce: 'post',
    transform(code, id) {
      if (!id.endsWith('.css')) return null;
      return { code: toVw(code), map: null };
    },
    generateBundle(_, bundle) {
      Object.values(bundle).forEach((asset) => {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css') || typeof asset.source !== 'string') return;
        asset.source = toVw(asset.source);
      });
    }
  };
}
