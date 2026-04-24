/** Defaults for native placements embedded on demo/site.html (single source of truth). */

export function defaultNativeWidgetSettings() {
  return {
    layout: {
      fixedSize: false,
      width: 250,
      height: 200,
      desktop: { cols: "2", rows: "1", hSpace: "10", vSpace: "10", aspect: "3:2", maxLines: "2" },
      mobile: { cols: "2", rows: "2", hSpace: "10", vSpace: "10", aspect: "4:3", maxLines: "2", breakpoint: "450" },
    },
    appearance: { bgColor: "rgba(255,255,255,1)", imgBorderSize: "0", imgBorderColor: "rgba(0,0,0,1)", imgBorderRadius: "6", zoomEffect: false },
    text: {
      font: "Roboto, sans-serif",
      titleSize: "14",
      descSize: "12",
      titleColor: "rgba(0,0,0,1)",
      titleHoverColor: "rgba(0,0,0,1)",
      descColor: "rgba(102,102,102,1)",
      align: "Left",
      titleBold: true,
      titleItalic: false,
    },
    brand: {
      showBrandName: true,
      showBrand: true,
      showLogo: true,
      position: "Below Title",
      logoSize: "16",
      logoRadius: "50",
      color: "rgba(136,136,136,1)",
      size: "11",
    },
    cta: {
      showCta: true,
      style: "Filled",
      bg: "rgba(59,130,246,1)",
      textColor: "rgba(255,255,255,1)",
      hoverBg: "rgba(37,99,235,1)",
      padX: "12",
      padY: "6",
      radius: "6",
      position: "Right",
    },
    label: {
      show: true,
      text: "Ads",
      font: "Roboto, sans-serif",
      size: "10",
      color: "rgba(153,153,153,1)",
      position: "Top Right",
      bold: false,
      italic: false,
    },
  };
}

export function nativeGrid3SettingsFrom(base) {
  return {
    ...base,
    layout: {
      ...base.layout,
      desktop: { ...base.layout.desktop, cols: "3", rows: "1" },
      mobile: { ...base.layout.mobile, cols: "1", rows: "3" },
    },
  };
}

/** IDs must match data-native-widget-id on app/demo/site.html */
export const DEMO_NATIVE_WIDGET_SPECS = [
  { id: 112345678, name: "Native widget 1", grid3: false },
  { id: 112345679, name: "Native widget 2", grid3: false },
  { id: 112345680, name: "Native сітка 3×1 / 1×3", grid3: true },
];
