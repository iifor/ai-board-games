export function px2vwPlugin({
  viewportWidth = 1920,
  unitPrecision = 5,
  minimumReadableFontPx = 12,
  minimumReadableScale = 0.75,
} = {}) {
  const pxRe = /(-?\d*\.?\d+)px\b/g;
  const conditionalAtRuleRe = /@(media|container)\b[^{}]*\{/gi;
  const declarationRe = /(^|[;{])(\s*)([-\w]+)(\s*:\s*)([^;{}]+)/g;
  const stablePixelPropertyRe = /^(?:border(?:-.+)?|outline(?:-.+)?|stroke-width|text-decoration-thickness)$/;
  const format = (value) => Number(value.toFixed(unitPrecision));
  const toViewportUnit = (value) => `${format((value / viewportWidth) * 100)}vw`;
  const toRem = (value) => `${format(value / 16)}rem`;
  const toReadableLength = (value, minimumPx) => {
    if (!Number.isFinite(value) || value <= 0) return `${value}px`;
    const floor = Math.min(value, Math.max(value * minimumReadableScale, minimumPx));
    if (floor === value) return toRem(value);
    return `clamp(${toRem(floor)}, ${toViewportUnit(value)}, ${toRem(value)})`;
  };
  const isStablePixelProperty = (property) => (
    stablePixelPropertyRe.test(property)
    || property.startsWith('--ui-radius-')
    || property === '--ui-shadow-focus'
  );
  const convertDeclarationValue = (property, value) => {
    if (isStablePixelProperty(property)) return value;
    if (property === 'font-size') {
      return value.replace(pxRe, (_, rawValue) => toReadableLength(Number(rawValue), minimumReadableFontPx));
    }
    if (property === 'line-height') {
      return value.replace(pxRe, (_, rawValue) => toReadableLength(Number(rawValue), minimumReadableFontPx * 1.2));
    }
    return value.replace(pxRe, (match, rawValue) => {
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue) || numericValue === 0) return match;
      return toViewportUnit(numericValue);
    });
  };
  const convertCss = (code) => {
    const conditions = [];
    const protectedCode = code.replace(conditionalAtRuleRe, (condition) => {
      const index = conditions.push(condition) - 1;
      return `__PX2VW_CONDITION_${index}__`;
    });
    const converted = protectedCode.replace(
      declarationRe,
      (_, prefix, spacing, property, separator, value) => (
        `${prefix}${spacing}${property}${separator}${convertDeclarationValue(property, value)}`
      ),
    );
    return converted.replace(/__PX2VW_CONDITION_(\d+)__/g, (_, rawIndex) => conditions[Number(rawIndex)]);
  };

  return {
    name: 'local-px2vw',
    enforce: 'post',
    transform(code, id) {
      if (!id.endsWith('.css')) return null;
      return { code: convertCss(code), map: null };
    },
    generateBundle(_, bundle) {
      Object.values(bundle).forEach((asset) => {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css') || typeof asset.source !== 'string') return;
        asset.source = convertCss(asset.source);
      });
    }
  };
}
