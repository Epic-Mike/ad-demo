export const StorageKeys = Object.freeze({
  bannerCreatives: "adDiag.banner.creatives",
  bannerSpots: "adDiag.banner.spots",
  nativeCreatives: "adDiag.native.creatives",
  // Back-compat: old single settings key
  nativeWidgetSettings: "adDiag.native.widgetSettings",
  // New: multiple native widget placements (instances)
  nativeWidgets: "adDiag.native.widgets",
  runtime: "adDiag.runtime",
});

export function nowIso() {
  return new Date().toISOString();
}

export function uuid() {
  // good-enough id for local demo; not cryptographically strong
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * BannerCreative
 * - id: string
 * - type: "simple" | "selfcode" | "html5"
 * - size: "300x250" (use 'x', not '×')
 * - assets:
 *   - simple: { imageDataUrl: string | null }
 *   - selfcode: { html: string }
 *   - html5: { fileName: string | null, fileSize: number | null }
 */
export function normalizeBannerSize(size) {
  if (!size) return "";
  return String(size).trim().replace("×", "x").toLowerCase();
}

/**
 * NativeCreative
 * - id: string
 * - title: string
 * - description: string
 * - ctaText: string
 * - brandName: string
 * - assets: { mainImageDataUrl: string | null, logoDataUrl: string | null }
 */

/**
 * BannerSpot
 * - id: number
 * - name: string
 * - size: "300x250" (основний підпис / fallback для слотів без flex)
 * - status: boolean
 * - mode: string
 * - creativeId?: string — опційна привʼязка; у flex-режимі матчиться лише якщо розмір креатива збігається з одним із пріоритетних для поточного tier
 * - flexSizes?: { desktop: string[], mobile: string[], breakpoint?: number }
 *   Пріоритетні розміри за tier; ширина viewport ≤ breakpoint (або runtime.device === "mobile") → mobile tier
 *
 * Рендер (ad-sdk): якщо точного збігу за розміром немає, за замовчуванням підбираються менші креативи,
 * що вміщуються в габарити плейсмента; при достатній ширині показуються до 3 однакових плиток у ряд.
 * Якщо креатив уже підібраний, але габарит слота більший і в ряд вміщаються ≥2 копії — також тилювання (без одного «плаваючого» банера).
 * Вимкнути fallback: opts.bannerSizeFallback === false; лише це тилювання: opts.bannerTileWhenSmallerThanSlot === false
 * Широкий слот + є 300×250 з контентом: opts.bannerPreferMrecTilesInWideSlots === true підставляє 2–3× MREC замість одного мега-креатива (для демо).
 */

/**
 * NativeWidgetSettings
 * matches structure saved in native_web.html saveSettings():
 * { layout, appearance, text, brand, cta, label }
 */

/**
 * NativeWidgetPlacement
 * - id: number|string
 * - name: string
 * - status: boolean
 * - settings: NativeWidgetSettings
 */

