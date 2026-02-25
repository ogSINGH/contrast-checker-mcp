import { RGB, RGBA, HSL, parseColor, rgbToHsl, hslToRgb, rgbToHex, alphaComposite } from "./colors.js";

/**
 * Linearize an sRGB channel value (0-255) per WCAG 2.1 spec.
 */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Compute relative luminance per WCAG 2.1.
 */
export function relativeLuminance(rgb: RGB): number {
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Compute contrast ratio between two colors.
 * Returns a value between 1 and 21.
 */
export function contrastRatio(color1: RGB, color2: RGB): number {
  const l1 = relativeLuminance(color1);
  const l2 = relativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Compute contrast ratio with alpha compositing.
 * Composites the foreground (with alpha) onto the background, then computes ratio.
 * Matches WebAIM's approach: RGBAtoRGB then getL-based contrast.
 */
export function contrastRatioWithAlpha(fg: RGBA, bg: RGB): { ratio: number; effectiveFg: RGB } {
  const effectiveFg = alphaComposite(fg, bg);
  const ratio = contrastRatio(effectiveFg, bg);
  return { ratio, effectiveFg };
}

export interface WCAGResult {
  ratio: number;
  AA_normal: boolean;   // >= 4.5
  AA_large: boolean;    // >= 3.0
  AAA_normal: boolean;  // >= 7.0
  AAA_large: boolean;   // >= 4.5
}

/**
 * Truncate a number to 2 decimal places without rounding.
 * Matches WebAIM's Dec2() behavior.
 */
function truncate2(num: number): number {
  return Math.floor(num * 100) / 100;
}

/**
 * Check WCAG 2.1 compliance for a contrast ratio.
 */
export function checkWCAG(ratio: number): WCAGResult {
  return {
    ratio: truncate2(ratio),
    AA_normal: ratio >= 4.5,
    AA_large: ratio >= 3.0,
    AAA_normal: ratio >= 7.0,
    AAA_large: ratio >= 4.5,
  };
}

/**
 * Suggest an accessible color by binary-searching HSL lightness.
 * Keeps the hue and saturation of the original color, adjusting only lightness.
 */
export function suggestAccessibleColor(
  foreground: RGB,
  background: RGB,
  targetLevel: "AA" | "AAA",
  fix: "foreground" | "background"
): RGB {
  const threshold = targetLevel === "AAA" ? 7.0 : 4.5;
  const colorToFix = fix === "foreground" ? foreground : background;
  const anchor = fix === "foreground" ? background : foreground;
  const hsl = rgbToHsl(colorToFix);

  // Check if already meets the target
  if (contrastRatio(foreground, background) >= threshold) {
    return colorToFix;
  }

  const anchorLuminance = relativeLuminance(anchor);

  // Try both directions: darker and lighter
  const tryDirection = (goLighter: boolean): RGB | null => {
    let low: number, high: number;
    if (goLighter) {
      low = hsl.l;
      high = 100;
    } else {
      low = 0;
      high = hsl.l;
    }

    // First check if the extreme end meets the threshold
    const extremeHsl: HSL = { h: hsl.h, s: hsl.s, l: goLighter ? 100 : 0 };
    const extremeRgb = hslToRgb(extremeHsl);
    const extremeRatio = fix === "foreground"
      ? contrastRatio(extremeRgb, anchor)
      : contrastRatio(anchor, extremeRgb);

    if (extremeRatio < threshold) {
      return null; // Can't meet threshold in this direction
    }

    // Binary search for the closest lightness that meets the threshold
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      const testHsl: HSL = { h: hsl.h, s: hsl.s, l: Math.round(mid) };
      const testRgb = hslToRgb(testHsl);
      const ratio = fix === "foreground"
        ? contrastRatio(testRgb, anchor)
        : contrastRatio(anchor, testRgb);

      if (ratio >= threshold) {
        if (goLighter) {
          high = mid;
        } else {
          low = mid;
        }
      } else {
        if (goLighter) {
          low = mid;
        } else {
          high = mid;
        }
      }
    }

    const resultL = goLighter ? Math.ceil(high) : Math.floor(low);
    const resultHsl: HSL = { h: hsl.h, s: hsl.s, l: clampL(resultL) };
    const resultRgb = hslToRgb(resultHsl);
    const finalRatio = fix === "foreground"
      ? contrastRatio(resultRgb, anchor)
      : contrastRatio(anchor, resultRgb);

    // Verify the result actually meets the threshold
    if (finalRatio >= threshold) {
      return resultRgb;
    }
    return null;
  };

  // Determine which direction moves away from the anchor's luminance
  const shouldGoDarker = anchorLuminance < 0.5;
  const primaryDir = shouldGoDarker ? true : false; // go lighter if anchor is dark
  const secondaryDir = !primaryDir;

  const primaryResult = tryDirection(primaryDir);
  if (primaryResult) {
    // Check if secondary direction gives a closer result
    const secondaryResult = tryDirection(secondaryDir);
    if (secondaryResult) {
      const primaryHsl = rgbToHsl(primaryResult);
      const secondaryHsl = rgbToHsl(secondaryResult);
      const primaryDist = Math.abs(primaryHsl.l - hsl.l);
      const secondaryDist = Math.abs(secondaryHsl.l - hsl.l);
      return secondaryDist < primaryDist ? secondaryResult : primaryResult;
    }
    return primaryResult;
  }

  const secondaryResult = tryDirection(secondaryDir);
  if (secondaryResult) {
    return secondaryResult;
  }

  // Fallback: return black or white (whichever has better contrast)
  const blackRatio = contrastRatio(anchor, { r: 0, g: 0, b: 0 });
  const whiteRatio = contrastRatio(anchor, { r: 255, g: 255, b: 255 });
  return blackRatio > whiteRatio ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
}

function clampL(l: number): number {
  return Math.max(0, Math.min(100, l));
}
