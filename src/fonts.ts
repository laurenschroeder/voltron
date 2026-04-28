import { spaceMono } from "@pmndrs/msdfonts";

/**
 * UIKit font families — pass as `fontFamilies` to any PanelDocument root.
 *
 * Usage in a PanelUI qualify callback:
 *   doc.rootElement.setProperties({ fontFamilies: UI_FONT_FAMILIES });
 *
 * Note: DOM elements use Space Mono loaded via Google Fonts in index.html.
 * This object covers @pmndrs/uikit panels that render in WebXR / 3D space.
 */
export const UI_FONT_FAMILIES = {
  spaceMono,
} as const;
