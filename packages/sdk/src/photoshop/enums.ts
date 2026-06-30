/**
 * Photoshop DOM enum constants. Each value is the ExtendScript global enum name
 * string, embeddable directly into a JSX fragment.
 *
 * @example
 * await this.photoshop.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
 * // emits JSX: app.activeDocument.close(SaveOptions.DONOTSAVECHANGES)
 */

export const SaveOptions = {
  /** Do not save changes. */
  DONOTSAVECHANGES: "SaveOptions.DONOTSAVECHANGES",
  /** Prompt the user. */
  PROMPTTOSAVECHANGES: "SaveOptions.PROMPTTOSAVECHANGES",
  /** Save changes. */
  SAVECHANGES: "SaveOptions.SAVECHANGES",
} as const;
export type SaveOptionsValue = (typeof SaveOptions)[keyof typeof SaveOptions];

export const LayerKind = {
  NORMAL: "LayerKind.NORMAL",
  TEXT: "LayerKind.TEXT",
  SMARTOBJECT: "LayerKind.SMARTOBJECT",
  SOLIDFILL: "LayerKind.SOLIDFILL",
  /**
   * @remarks In `enums.d.ts`, GRADIENTFILL=4 and PATTERNFILL=4 share a value
   * (an Adobe enum conflict); a kind of 4 always maps back to GRADIENTFILL and
   * the two cannot be told apart at runtime (disambiguate by layer name etc.).
   */
  GRADIENTFILL: "LayerKind.GRADIENTFILL",
  PATTERNFILL: "LayerKind.PATTERNFILL",
  LEVELS: "LayerKind.LEVELS",
  CURVES: "LayerKind.CURVES",
  BRIGHTNESSCONTRAST: "LayerKind.BRIGHTNESSCONTRAST",
  HUESATURATION: "LayerKind.HUESATURATION",
  COLORBALANCE: "LayerKind.COLORBALANCE",
  INVERSION: "LayerKind.INVERSION",
  POSTERIZE: "LayerKind.POSTERIZE",
  THRESHOLD: "LayerKind.THRESHOLD",
  EXPOSURE: "LayerKind.EXPOSURE",
  VIBRANCE: "LayerKind.VIBRANCE",
  VIDEO: "LayerKind.VIDEO",
  LAYER3D: "LayerKind.LAYER3D",
  BLACKANDWHITE: "LayerKind.BLACKANDWHITE",
  CHANNELMIXER: "LayerKind.CHANNELMIXER",
  GRADIENTMAP: "LayerKind.GRADIENTMAP",
  SELECTIVECOLOR: "LayerKind.SELECTIVECOLOR",
  PHOTOFILTER: "LayerKind.PHOTOFILTER",
  COLORLOOKUP: "LayerKind.COLORLOOKUP",
} as const;
export type LayerKindValue = (typeof LayerKind)[keyof typeof LayerKind];

export const BlendMode = {
  NORMAL: "BlendMode.NORMAL",
  DISSOLVE: "BlendMode.DISSOLVE",
  DARKEN: "BlendMode.DARKEN",
  MULTIPLY: "BlendMode.MULTIPLY",
  COLORBURN: "BlendMode.COLORBURN",
  LINEARBURN: "BlendMode.LINEARBURN",
  DARKERCOLOR: "BlendMode.DARKERCOLOR",
  LIGHTEN: "BlendMode.LIGHTEN",
  SCREEN: "BlendMode.SCREEN",
  COLORDODGE: "BlendMode.COLORDODGE",
  LINEARDODGE: "BlendMode.LINEARDODGE",
  LIGHTERCOLOR: "BlendMode.LIGHTERCOLOR",
  OVERLAY: "BlendMode.OVERLAY",
  SOFTLIGHT: "BlendMode.SOFTLIGHT",
  HARDLIGHT: "BlendMode.HARDLIGHT",
  VIVIDLIGHT: "BlendMode.VIVIDLIGHT",
  LINEARLIGHT: "BlendMode.LINEARLIGHT",
  PINLIGHT: "BlendMode.PINLIGHT",
  HARDMIX: "BlendMode.HARDMIX",
  DIFFERENCE: "BlendMode.DIFFERENCE",
  EXCLUSION: "BlendMode.EXCLUSION",
  SUBTRACT: "BlendMode.SUBTRACT",
  DIVIDE: "BlendMode.DIVIDE",
  HUE: "BlendMode.HUE",
  SATURATION: "BlendMode.SATURATION",
  COLORBLEND: "BlendMode.COLORBLEND",
  LUMINOSITY: "BlendMode.LUMINOSITY",
  PASSTHROUGH: "BlendMode.PASSTHROUGH",
} as const;
export type BlendModeValue = (typeof BlendMode)[keyof typeof BlendMode];

export const ElementPlacement = {
  PLACEATBEGINNING: "ElementPlacement.PLACEATBEGINNING",
  PLACEINSIDE: "ElementPlacement.PLACEINSIDE",
  PLACEBEFORE: "ElementPlacement.PLACEBEFORE",
  PLACEAFTER: "ElementPlacement.PLACEAFTER",
  PLACEATEND: "ElementPlacement.PLACEATEND",
} as const;
export type ElementPlacementValue = (typeof ElementPlacement)[keyof typeof ElementPlacement];

export const AnchorPosition = {
  TOPLEFT: "AnchorPosition.TOPLEFT",
  TOPCENTER: "AnchorPosition.TOPCENTER",
  TOPRIGHT: "AnchorPosition.TOPRIGHT",
  MIDDLELEFT: "AnchorPosition.MIDDLELEFT",
  MIDDLECENTER: "AnchorPosition.MIDDLECENTER",
  MIDDLERIGHT: "AnchorPosition.MIDDLERIGHT",
  BOTTOMLEFT: "AnchorPosition.BOTTOMLEFT",
  BOTTOMCENTER: "AnchorPosition.BOTTOMCENTER",
  BOTTOMRIGHT: "AnchorPosition.BOTTOMRIGHT",
} as const;
export type AnchorPositionValue = (typeof AnchorPosition)[keyof typeof AnchorPosition];

export const DocumentMode = {
  BITMAP: "DocumentMode.BITMAP",
  GRAYSCALE: "DocumentMode.GRAYSCALE",
  RGB: "DocumentMode.RGB",
  CMYK: "DocumentMode.CMYK",
  LAB: "DocumentMode.LAB",
  INDEXEDCOLOR: "DocumentMode.INDEXEDCOLOR",
  MULTICHANNEL: "DocumentMode.MULTICHANNEL",
  DUOTONE: "DocumentMode.DUOTONE",
} as const;
export type DocumentModeValue = (typeof DocumentMode)[keyof typeof DocumentMode];

export const SelectionType = {
  REPLACE: "SelectionType.REPLACE",
  EXTEND: "SelectionType.EXTEND",
  DIMINISH: "SelectionType.DIMINISH",
  INTERSECT: "SelectionType.INTERSECT",
} as const;
export type SelectionTypeValue = (typeof SelectionType)[keyof typeof SelectionType];
