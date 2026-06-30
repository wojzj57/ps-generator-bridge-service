// Value DTOs returned by the Photoshop DOM proxy. Kept beside the proxy so the
// shared module has no outward type dependency.

/**
 * A bounding rectangle `[left, top, right, bottom]`.
 *
 * @remarks Units follow Photoshop's current `rulerUnits` setting; values are not
 * guaranteed to be pixels unless `rulerUnits` is `Units.PIXELS`.
 */
export type PsBounds = [number, number, number, number];

/**
 * A simplified SolidColor representation. The first version only fills `rgb`;
 * in CMYK/Lab documents that RGB is Photoshop's automatic approximation. The
 * `cmyk` field is reserved for a later version and is currently always omitted.
 */
export interface PsColor {
  model: "rgb" | "cmyk" | "hsb" | "lab" | "gray";
  rgb?: { red: number; green: number; blue: number; hexValue?: string };
  cmyk?: { cyan: number; magenta: number; yellow: number; black: number };
}
