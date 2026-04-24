import { StorageKeys } from "./models.js";
import {
  DEMO_NATIVE_WIDGET_SPECS,
  defaultNativeWidgetSettings,
  nativeGrid3SettingsFrom,
} from "./native-demo-defaults.js";

function parseJsonOr(value, fallback) {
  try {
    if (value == null) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function readJson(key, fallback) {
  return parseJsonOr(localStorage.getItem(key), fallback);
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function upsertById(list, item) {
  const arr = ensureArray(list);
  const idx = arr.findIndex((x) => x && x.id === item.id);
  if (idx === -1) return [...arr, item];
  const copy = [...arr];
  copy[idx] = item;
  return copy;
}

export function resetAll() {
  Object.values(StorageKeys).forEach((k) => localStorage.removeItem(k));
}

export function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function ensureDemoNativeWidgetsPersisted() {
  let widgets = ensureArray(readJson(StorageKeys.nativeWidgets, []));
  const legacySettings = readJson(StorageKeys.nativeWidgetSettings, null);
  const baseFromWidget = widgets.find((w) => w && w.settings != null)?.settings;
  const baseSettings = legacySettings || baseFromWidget || defaultNativeWidgetSettings();
  const grid3Settings = nativeGrid3SettingsFrom(baseSettings);

  let changed = false;
  for (const spec of DEMO_NATIVE_WIDGET_SPECS) {
    if (widgets.some((w) => w && Number(w.id) === spec.id)) continue;
    widgets.push({
      id: spec.id,
      name: spec.name,
      status: true,
      settings: cloneJson(spec.grid3 ? grid3Settings : baseSettings),
    });
    changed = true;
  }

  if (changed) writeJson(StorageKeys.nativeWidgets, widgets);

  if (readJson(StorageKeys.nativeWidgetSettings, null) == null) {
    writeJson(StorageKeys.nativeWidgetSettings, cloneJson(baseSettings));
  }
}

export function migrateIfNeeded() {
  // Migrate legacy single native settings → два демо-плейсменти; далі ensure додає третій (сітка) і зберігає ключі.
  const legacySettings = readJson(StorageKeys.nativeWidgetSettings, null);
  let widgets = ensureArray(readJson(StorageKeys.nativeWidgets, null));

  if (!widgets.length && legacySettings) {
    writeJson(StorageKeys.nativeWidgets, [
      { id: 112345678, name: "Native widget 1", status: true, settings: cloneJson(legacySettings) },
      { id: 112345679, name: "Native widget 2", status: true, settings: cloneJson(legacySettings) },
    ]);
    widgets = ensureArray(readJson(StorageKeys.nativeWidgets, []));
  }

  if (widgets.length) {
    const baseSettings =
      legacySettings || widgets.find((w) => w && w.settings != null)?.settings || null;
    if (baseSettings) {
      let changed = false;

      widgets = widgets.map((w) => {
        if (!w || w.settings != null) return w;
        changed = true;
        return { ...w, settings: cloneJson(baseSettings) };
      });

      const find = (id) => widgets.find((w) => w && String(w.id) === String(id));
      const has678 = Boolean(find(112345678));
      const has679 = Boolean(find(112345679));
      if (has678 && !has679) {
        widgets.push({
          id: 112345679,
          name: "Native widget 2",
          status: true,
          settings: cloneJson(baseSettings),
        });
        changed = true;
      }

      if (changed) writeJson(StorageKeys.nativeWidgets, widgets);
    }
  }

  ensureDemoNativeWidgetsPersisted();
}

