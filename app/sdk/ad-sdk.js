import { StorageKeys, normalizeBannerSize } from "./models.js";
import { ensureArray, migrateIfNeeded, readJson } from "./storage.js";

/** TEMP: false — знову показувати brand/logo у нативному віджеті (узгодьте з publisher/native.html). */
const TEMP_SUPPRESS_NATIVE_BRAND_ROW = true;

/**
 * Джерело інвентарю банерів: opts.bannerSpots / opts.bannerCreatives, далі
 * window.__AD_DIAG__.bannerSpots / .bannerCreatives (для вбудовування без спільного localStorage з адмінкою),
 * інакше localStorage (той самий origin, де зберігали креативи).
 */
function readBannerSpotsForRender(opts = {}) {
  if (opts.bannerSpots != null) return ensureArray(opts.bannerSpots);
  const g = typeof globalThis !== "undefined" ? globalThis.__AD_DIAG__ : null;
  if (g && g.bannerSpots != null) return ensureArray(g.bannerSpots);
  return ensureArray(readJson(StorageKeys.bannerSpots, []));
}

function readBannerCreativesForRender(opts = {}) {
  if (opts.bannerCreatives != null) return ensureArray(opts.bannerCreatives);
  const g = typeof globalThis !== "undefined" ? globalThis.__AD_DIAG__ : null;
  if (g && g.bannerCreatives != null) return ensureArray(g.bannerCreatives);
  return ensureArray(readJson(StorageKeys.bannerCreatives, []));
}

function readNativeWidgetsForRender(opts = {}) {
  if (opts.nativeWidgets != null) return ensureArray(opts.nativeWidgets);
  const g = typeof globalThis !== "undefined" ? globalThis.__AD_DIAG__ : null;
  if (g && g.nativeWidgets != null) return ensureArray(g.nativeWidgets);
  return ensureArray(readJson(StorageKeys.nativeWidgets, []));
}

function readNativeCreativesForRender(opts = {}) {
  if (opts.nativeCreatives != null) return ensureArray(opts.nativeCreatives);
  const g = typeof globalThis !== "undefined" ? globalThis.__AD_DIAG__ : null;
  if (g && g.nativeCreatives != null) return ensureArray(g.nativeCreatives);
  return ensureArray(readJson(StorageKeys.nativeCreatives, []));
}

function byIdMap(list) {
  const map = new Map();
  ensureArray(list).forEach((x) => {
    if (x && x.id != null) map.set(String(x.id), x);
  });
  return map;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v == null) return;
    if (k === "class") node.className = v;
    else if (k === "style") Object.assign(node.style, v);
    else if (k.startsWith("data-")) node.setAttribute(k, v);
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function getRuntime() {
  return readJson(StorageKeys.runtime, { device: "desktop", debug: true });
}

function debugEnabled(opts) {
  if (opts && typeof opts.debug === "boolean") return opts.debug;
  return Boolean(getRuntime().debug);
}

function showEmptyPlacements(opts) {
  if (opts && typeof opts.showEmptyPlacements === "boolean") return opts.showEmptyPlacements;
  return Boolean(getRuntime().showEmptyPlacements);
}

function showPlacementIdBadgeEnabled(opts) {
  return Boolean(opts && opts.showPlacementIdBadge);
}

function placementBadgeSizeSuffix(sizeRaw) {
  const n = normalizeBannerSize(sizeRaw || "");
  if (!n) return "";
  return ` (${n.replace(/x/gi, "×")})`;
}

/**
 * Мітка id плейсмента у правому верхньому куті (наприклад, демо-сайт).
 * meta.bannerSize — для банерів додає суфікс у дужках, напр. «726436 (300×250)».
 */
function appendPlacementIdBadge(hostEl, placementId, opts, meta = {}) {
  if (!showPlacementIdBadgeEnabled(opts) || placementId == null || String(placementId).trim() === "") return;
  const sizeSuffix = meta.bannerSize != null ? placementBadgeSizeSuffix(meta.bannerSize) : "";
  hostEl.style.position = "relative";
  hostEl.appendChild(
    el("span", {
      class: "adDiag-placementIdBadge",
      "data-ad-placement-id-badge": "1",
      text: `${String(placementId)}${sizeSuffix}`,
    }),
  );
}

function findBannerCreative(creatives, size) {
  const normalized = normalizeBannerSize(size);
  return ensureArray(creatives).find((c) => c && normalizeBannerSize(c.size) === normalized) || null;
}

function findBannerCreativeById(creatives, creativeId) {
  if (!creativeId) return null;
  const idStr = String(creativeId);
  return ensureArray(creatives).find((c) => c && String(c.id) === idStr) || null;
}

function bannerSizeFallbackEnabled(opts) {
  if (opts && typeof opts.bannerSizeFallback === "boolean") return opts.bannerSizeFallback;
  return true;
}

/** Креативи, що повністю вміщуються в габарити плейсмента; за спаданням площі (спочатку «найбільший з менших»). */
function listFittingBannerCreatives(creatives, slotW, slotH) {
  if (!Number.isFinite(slotW) || !Number.isFinite(slotH) || slotW <= 0 || slotH <= 0) return [];
  const out = [];
  for (const c of ensureArray(creatives)) {
    if (!c || !c.size) continue;
    const d = parseBannerDims(c.size);
    if (!d || d.w > slotW || d.h > slotH) continue;
    out.push(c);
  }
  out.sort((a, b) => {
    const da = parseBannerDims(a.size);
    const db = parseBannerDims(b.size);
    if (!da || !db) return 0;
    return db.w * db.h - da.w * da.h;
  });
  return out;
}

/**
 * До maxTiles плиток однакового розміру у ряд, якщо ширина плейсмента дозволяє ≥2 блоки.
 * Кілька креативів з тим самим size чергуються по позиціях (A,B,A,…). Без міксу різних розмірів.
 */
function chooseBannerTilesForSlot(fittingSorted, slotW, maxTiles = 3, gapPx = 8) {
  if (!fittingSorted.length) return [];
  const first = fittingSorted[0];
  const d = parseBannerDims(first.size);
  if (!d) return [first];
  const unit = d.w + gapPx;
  const maxByWidth = Math.floor((slotW + gapPx) / unit);
  const n = Math.min(maxTiles, Math.max(1, maxByWidth));
  const normFirst = normalizeBannerSize(first.size);
  const pool = fittingSorted
    .filter((c) => c && normalizeBannerSize(c.size) === normFirst)
    .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? ""), undefined, { numeric: true }));
  if (!pool.length) return [first];
  const tiles = [];
  for (let i = 0; i < n; i++) tiles.push(pool[i % pool.length]);
  return tiles;
}

/** Креатив «менший за слот» (вміщається, але не заповнює габарит) і в ряд реально вміщаються ≥2 копії. */
function shouldUniformTileSmallerCreative(creative, placementDims, opts) {
  if (!creative || !placementDims || !bannerSizeFallbackEnabled(opts)) return null;
  if (opts && opts.bannerTileWhenSmallerThanSlot === false) return null;
  const cd = parseBannerDims(creative.size);
  if (!cd || cd.w > placementDims.w || cd.h > placementDims.h) return null;
  if (cd.w >= placementDims.w && cd.h >= placementDims.h) return null;
  const tiles = chooseBannerTilesForSlot([creative], placementDims.w, 3, 8);
  return tiles.length >= 2 ? tiles : null;
}

const MREC_SIZE = "300x250";

function mrecCreativeHasRenderableContent(c) {
  if (!c) return false;
  if (c.type === "simple") return Boolean(c.assets?.imageDataUrl);
  if (c.type === "selfcode") return String(c.assets?.html || "").trim().length > 0;
  if (c.type === "html5") return true;
  return false;
}

/** Усі 300×250 з реальним контентом (для тилювання широкого слота з чергуванням креативів). */
function listMrecTileCreatives(creatives) {
  const mrecs = ensureArray(creatives).filter(
    (c) => c && normalizeBannerSize(c.size) === MREC_SIZE && mrecCreativeHasRenderableContent(c),
  );
  mrecs.sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? ""), undefined, { numeric: true }));
  return mrecs;
}

/**
 * Широкий слот: замість одного «мега» креатива (970×250 тощо) показати 2–3× 300×250, якщо такий креатив є
 * і вміщується по висоті. Не чіпає плейсменти з привʼязкою creativeId.
 * Увімкнути: opts.bannerPreferMrecTilesInWideSlots === true (наприклад демо-сайт).
 */
function preferMrecTilesForWideSlot(opts, spot, creative, placementDims, creatives) {
  if (!opts || opts.bannerPreferMrecTilesInWideSlots !== true) return null;
  if (!spot || !creative || !placementDims) return null;
  const bound = spot.creativeId != null && String(spot.creativeId).trim() !== "";
  if (bound) return null;
  if (placementDims.w < 600) return null;
  const mrecs = listMrecTileCreatives(creatives);
  if (!mrecs.length) return null;
  const md = parseBannerDims(mrecs[0].size);
  if (!md || md.h > placementDims.h || md.w > placementDims.w) return null;
  const tiles = chooseBannerTilesForSlot(mrecs, placementDims.w, 3, 8);
  return tiles.length >= 2 ? tiles : null;
}

function spotDimsForFallback(spot, tier, slotEl, opts, viewportWidth) {
  if (spot && hasFlexSizes(spot) && tier) {
    const list = flexSizePriority(spot, tier);
    const first = list[0];
    if (first) {
      const p = parseBannerDims(first);
      if (p) return p;
    }
  }
  if (spot?.size) {
    const p = parseBannerDims(spot.size);
    if (p) return p;
  }
  return resolveEmptySlotDims(slotEl, opts, viewportWidth, spot, tier);
}

function hasFlexSizes(spot) {
  const f = spot?.flexSizes;
  if (!f || typeof f !== "object") return false;
  const d = ensureArray(f.desktop).map(normalizeBannerSize).filter(Boolean);
  const m = ensureArray(f.mobile).map(normalizeBannerSize).filter(Boolean);
  return d.length > 0 || m.length > 0;
}

/** Mobile tier: вузький viewport або явний runtime.device === "mobile" (як у native). */
function pickBannerTier(root, opts, spot, viewportWidth) {
  const runtime = getRuntime();
  const bp = Number(
    spot?.flexSizes?.breakpoint ?? opts.bannerBreakpoint ?? runtime.bannerBreakpoint ?? 600,
  );
  const w = Number.isFinite(viewportWidth) ? viewportWidth : root.getBoundingClientRect?.().width || 0;
  const shouldUseMobile = runtime.device === "mobile" || (w > 0 && w <= bp);
  return shouldUseMobile ? "mobile" : "desktop";
}

function flexSizePriority(spot, tier) {
  const raw = tier === "mobile" ? spot?.flexSizes?.mobile : spot?.flexSizes?.desktop;
  return ensureArray(raw).map(normalizeBannerSize).filter(Boolean);
}

function pickFlexBannerCreative(spot, creatives, tier) {
  const list = flexSizePriority(spot, tier);
  const boundId = spot?.creativeId ? String(spot.creativeId) : "";
  for (const size of list) {
    if (boundId) {
      const byId = findBannerCreativeById(creatives, boundId);
      if (byId && normalizeBannerSize(byId.size) === size) return { creative: byId, size };
      continue;
    }
    const c = findBannerCreative(creatives, size);
    if (c) return { creative: c, size };
  }
  return { creative: null, size: null };
}

function setBannerSlotBlockHidden(slotEl, hidden) {
  const block = slotEl.closest("[data-banner-slot-block]");
  if (block) block.style.display = hidden ? "none" : "";
  else {
    slotEl.style.display = hidden ? "none" : "";
  }
}

function flexEmptyDebugText(slotEl, spot, tier, viewportWidth) {
  const list = flexSizePriority(spot, tier);
  const labels = list.map((s) => s.replace(/x/g, "×")).join(", ") || "—";
  const bp = Number(spot?.flexSizes?.breakpoint ?? 600);
  const w = Number.isFinite(viewportWidth) ? Math.round(viewportWidth) : "?";
  return `Placement ${spot?.id ?? "?"} (flex · ${tier}, breakpoint ${bp}px, viewport ~${w}px; expected: ${labels}): no matching creative`;
}

/** Розмір для підказок debug: з плейсменту або з data-banner-size на слоті (на кшталт 728×90). */
function bannerDimLabel(slotEl, spot) {
  const raw =
    (spot?.size != null && String(spot.size).trim() !== "" ? String(spot.size) : "") ||
    slotEl?.getAttribute?.("data-banner-size") ||
    "";
  const n = normalizeBannerSize(raw);
  if (!n) return "?×?";
  return n.replace(/x/gi, "×");
}

function parseBannerDims(sizeStr) {
  const n = normalizeBannerSize(String(sizeStr || ""));
  if (!n) return null;
  const parts = n.split("x");
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h, str: n };
}

/** Вузький viewport / режим Mobile — узгоджено з pickBannerTier. */
function mobileLikeBannerViewport(opts, spot, viewportWidth) {
  const runtime = getRuntime();
  const bp = Number(
    spot?.flexSizes?.breakpoint ?? opts.bannerBreakpoint ?? runtime.bannerBreakpoint ?? 600,
  );
  const w = Number.isFinite(viewportWidth) ? viewportWidth : 0;
  return runtime.device === "mobile" || (w > 0 && w <= bp);
}

/**
 * Розміри рамки порожнього слота та підпису: для flex — перший пріоритет для поточного tier;
 * інакше spot.size / data-banner-size; на мобільному не підставляємо leaderboard 728×90 як очікуваний розмір.
 */
function resolveEmptySlotDims(slotEl, opts, viewportWidth, spot, tier) {
  const mobileLike = mobileLikeBannerViewport(opts, spot || {}, viewportWidth);
  if (spot && hasFlexSizes(spot) && tier) {
    const list = flexSizePriority(spot, tier);
    const first = list[0];
    if (first) return parseBannerDims(first);
  }
  if (spot?.size) {
    const p = parseBannerDims(spot.size);
    if (p) return p;
  }
  const dataAttr = slotEl.getAttribute("data-banner-size") || "";
  const d = normalizeBannerSize(dataAttr);
  if (mobileLike && (d === "728x90" || d === "970x250" || !d)) {
    return parseBannerDims("320x50");
  }
  if (d) return parseBannerDims(d);
  return mobileLike ? parseBannerDims("320x50") : parseBannerDims("728x90");
}

function formatDimsLabel(dims) {
  if (!dims) return "?×?";
  return dims.str.replace(/x/gi, "×");
}

function applyEmptyBannerSlotLayout(slotEl, dims, viewportWidth) {
  if (!dims) return;
  const parentW = slotEl.parentElement?.clientWidth || slotEl.getBoundingClientRect().width || dims.w;
  const maxW = Math.max(1, parentW);
  const fittedW = Math.min(dims.w, maxW);
  const scale = fittedW / dims.w;
  const fittedH = Math.max(1, Math.round(dims.h * scale));
  slotEl.style.width = `${fittedW}px`;
  slotEl.style.maxWidth = "100%";
  slotEl.style.minHeight = `${fittedH}px`;
  slotEl.style.height = "auto";
  slotEl.style.boxSizing = "border-box";
}

function appendBannerCreativeContent(slotEl, creative, spot, opts, contentOpts = {}) {
  const skipBadge = Boolean(contentOpts.skipBadge);
  if (creative.type === "simple") {
    const img = el("img", {
      class: "adDiag-bannerImg",
      src: creative.assets?.imageDataUrl || "",
      alt: "Banner",
    });
    slotEl.appendChild(img);
    if (!skipBadge) appendPlacementIdBadge(slotEl, spot?.id, opts, { bannerSize: spot?.size });
    return { ok: true };
  }

  if (creative.type === "selfcode") {
    const iframe = el("iframe", {
      class: "adDiag-bannerFrame",
      sandbox: "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox",
      referrerpolicy: "no-referrer",
      title: "Selfcode Banner",
    });
    slotEl.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(String(creative.assets?.html || ""));
      doc.close();
    }
    if (!skipBadge) appendPlacementIdBadge(slotEl, spot?.id, opts, { bannerSize: spot?.size });
    return { ok: true };
  }

  if (creative.type === "html5") {
    slotEl.appendChild(
      el("div", {
        class: "adDiag-html5Stub",
        text: `HTML5 ZIP loaded (${creative.assets?.fileName || "unknown"})`,
      }),
    );
    if (!skipBadge) appendPlacementIdBadge(slotEl, spot?.id, opts);
    return { ok: true, warning: "html5_stub" };
  }

  if (debugEnabled(opts)) {
    slotEl.appendChild(el("div", { class: "adDiag-slotEmpty", text: "Unknown banner type" }));
  }
  return { ok: false, reason: "unknown_banner_type" };
}

function renderBannerIntoSlot(slotEl, creative, spot, opts) {
  clearNode(slotEl);
  slotEl.classList.remove("adDiag-bannerTilesRow");
  slotEl.style.width = "";
  slotEl.style.height = "";
  slotEl.style.maxWidth = "";

  if (!creative) {
    if (!showEmptyPlacements(opts)) {
      slotEl.style.display = "none";
      return { ok: false, reason: "no_matching_creative", hidden: true };
    }
    slotEl.style.display = "";
    if (debugEnabled(opts)) {
      slotEl.appendChild(
        el("div", {
          class: "adDiag-slotEmpty",
          text: `Placement ${spot?.id ?? "?"} (${bannerDimLabel(slotEl, spot)}): no creative matching this size`,
        }),
      );
    }
    return { ok: false, reason: "no_matching_creative" };
  }
  slotEl.style.display = "";

  const size = normalizeBannerSize(spot?.size || creative.size);
  const [wStr, hStr] = size.split("x");
  const w = Number(wStr);
  const h = Number(hStr);
  // Fit creative into available slot width (esp. mobile)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    const paddingAllowance = 0; // slot padding is handled by parent layouts; keep simple
    const parentW = slotEl.parentElement?.clientWidth || slotEl.clientWidth || w;
    const maxW = Math.max(1, parentW - paddingAllowance);
    const fittedW = Math.min(w, maxW);
    const scale = fittedW / w;
    const fittedH = Math.max(1, Math.round(h * scale));
    slotEl.style.width = `${fittedW}px`;
    slotEl.style.height = `${fittedH}px`;
    slotEl.style.maxWidth = "100%";
  }

  return appendBannerCreativeContent(slotEl, creative, spot, opts);
}

/** Кілька менших банерів у межах одного плейсмента (fallback за шириною до 3 плиток). */
function renderBannerTilesIntoSlot(slotEl, tiles, outerSpot, opts) {
  clearNode(slotEl);
  slotEl.classList.add("adDiag-bannerTilesRow");
  slotEl.style.width = "";
  slotEl.style.height = "";
  slotEl.style.maxWidth = "";

  const size = normalizeBannerSize(outerSpot?.size || tiles[0]?.size);
  const parsed = parseBannerDims(size);
  const w = parsed ? parsed.w : 300;
  const h = parsed ? parsed.h : 250;

  slotEl.style.display = "";
  const paddingAllowance = 0;
  const parentW = slotEl.parentElement?.clientWidth || slotEl.clientWidth || w;
  const maxW = Math.max(1, parentW - paddingAllowance);
  const fittedOuterW = Math.min(w, maxW);
  const scaleOuter = fittedOuterW / w;
  const fittedOuterH = Math.max(1, Math.round(h * scaleOuter));
  slotEl.style.width = `${fittedOuterW}px`;
  slotEl.style.height = `${fittedOuterH}px`;
  slotEl.style.minHeight = "";
  slotEl.style.maxWidth = "100%";
  slotEl.style.boxSizing = "border-box";

  let worst = { ok: true };
  tiles.forEach((creative) => {
    const wrap = el("div", { class: "adDiag-bannerTile" });
    slotEl.appendChild(wrap);
    const r = appendBannerCreativeContent(wrap, creative, outerSpot, opts, { skipBadge: true });
    if (!r.ok) worst = r;
    else if (r.warning) worst = { ...worst, warning: r.warning };
  });

  appendPlacementIdBadge(slotEl, outerSpot?.id, opts, { bannerSize: outerSpot?.size });
  if (!worst.ok) return worst;
  return { ok: true, fallback: "smaller_tiles", warning: worst.warning };
}

export function renderBannerSlots(root = document, opts = {}) {
  const spots = readBannerSpotsForRender(opts);
  const creatives = readBannerCreativesForRender(opts);

  const spotById = byIdMap(spots);
  const slotEls = Array.from(root.querySelectorAll("[data-banner-id]"));
  const viewportWidth =
    typeof opts.viewportWidth === "number"
      ? opts.viewportWidth
      : root.getBoundingClientRect?.().width || 0;

  const results = slotEls.map((slotEl) => {
    slotEl.style.width = "";
    slotEl.style.height = "";
    slotEl.style.maxWidth = "";

    const spotId = slotEl.getAttribute("data-banner-id");
    const spot = spotById.get(String(spotId)) || null;
    if (!spot) {
      if (!showEmptyPlacements(opts)) {
        slotEl.style.display = "none";
        setBannerSlotBlockHidden(slotEl, true);
        return { spotId, ok: false, reason: "spot_missing", hidden: true };
      }
      slotEl.style.display = "";
      setBannerSlotBlockHidden(slotEl, false);
      clearNode(slotEl);
      if (debugEnabled(opts)) {
        const dims = resolveEmptySlotDims(slotEl, opts, viewportWidth, null, null);
        slotEl.appendChild(
          el("div", {
            class: "adDiag-slotEmpty",
            text: `Placement ${spotId} (${formatDimsLabel(dims)}): not configured`,
          }),
        );
        applyEmptyBannerSlotLayout(slotEl, dims, viewportWidth);
      }
      return { spotId, ok: false, reason: "spot_missing" };
    }
    if (!spot.status) {
      clearNode(slotEl);
      slotEl.style.display = "none";
      setBannerSlotBlockHidden(slotEl, true);
      return { spotId, ok: false, reason: "spot_disabled", hidden: true };
    }

    let creative = null;
    let effectiveSpot = spot;
    let tier = null;
    let pickedViaSizeFallback = false;
    if (hasFlexSizes(spot)) {
      tier = pickBannerTier(root, opts, spot, viewportWidth);
      const picked = pickFlexBannerCreative(spot, creatives, tier);
      creative = picked.creative;
      const sz = picked.size || spot.size;
      effectiveSpot = { ...spot, size: sz };
    } else {
      creative =
        findBannerCreativeById(creatives, spot.creativeId) || findBannerCreative(creatives, spot.size);
    }

    if (!creative && bannerSizeFallbackEnabled(opts)) {
      const fd = spotDimsForFallback(spot, tier, slotEl, opts, viewportWidth);
      if (fd) {
        const fitting = listFittingBannerCreatives(creatives, fd.w, fd.h);
        const tiles = chooseBannerTilesForSlot(fitting, fd.w, 3, 8);
        if (tiles.length > 1) {
          slotEl.style.display = "";
          setBannerSlotBlockHidden(slotEl, false);
          const outerSpot = { ...spot, size: normalizeBannerSize(`${fd.w}x${fd.h}`) };
          const r = renderBannerTilesIntoSlot(slotEl, tiles, outerSpot, opts);
          return {
            spotId,
            spot,
            tier,
            flex: hasFlexSizes(spot),
            creativeId: tiles.map((t) => t.id).join(","),
            pickedSize: outerSpot.size,
            fallback: r.fallback,
            ok: r.ok,
            warning: r.warning,
          };
        }
        if (tiles.length === 1) {
          creative = tiles[0];
          effectiveSpot = { ...spot, size: normalizeBannerSize(`${fd.w}x${fd.h}`) };
          pickedViaSizeFallback = true;
        }
      }
    }

    if (!creative) {
      if (!showEmptyPlacements(opts)) {
        clearNode(slotEl);
        slotEl.style.display = "none";
        setBannerSlotBlockHidden(slotEl, true);
        return {
          spotId,
          spot,
          tier,
          flex: hasFlexSizes(spot),
          ok: false,
          reason: "no_matching_creative",
          hidden: true,
        };
      }
      clearNode(slotEl);
      slotEl.style.display = "";
      setBannerSlotBlockHidden(slotEl, false);
      if (debugEnabled(opts)) {
        const dims = resolveEmptySlotDims(slotEl, opts, viewportWidth, spot, tier);
        const text = hasFlexSizes(spot)
          ? flexEmptyDebugText(slotEl, spot, tier, viewportWidth)
          : `Placement ${spot.id} (${formatDimsLabel(dims)}): no creative matching this size`;
        slotEl.appendChild(el("div", { class: "adDiag-slotEmpty", text }));
        applyEmptyBannerSlotLayout(slotEl, dims, viewportWidth);
      }
      return {
        spotId,
        spot,
        tier,
        flex: hasFlexSizes(spot),
        ok: false,
        reason: "no_matching_creative",
      };
    }

    const placementDims = parseBannerDims(normalizeBannerSize(effectiveSpot?.size || ""));
    let uniformTiles = shouldUniformTileSmallerCreative(creative, placementDims, opts);
    if (!uniformTiles) {
      uniformTiles = preferMrecTilesForWideSlot(opts, spot, creative, placementDims, creatives);
    }
    if (uniformTiles) {
      slotEl.style.display = "";
      setBannerSlotBlockHidden(slotEl, false);
      const outerSpot = {
        ...spot,
        size: normalizeBannerSize(`${placementDims.w}x${placementDims.h}`),
      };
      const r = renderBannerTilesIntoSlot(slotEl, uniformTiles, outerSpot, opts);
      const tileIds = uniformTiles.map((t) => t.id).filter((id) => id != null);
      return {
        spotId,
        spot,
        tier,
        flex: hasFlexSizes(spot),
        creativeId: tileIds.length ? [...new Set(tileIds.map(String))].join(",") : null,
        pickedSize: outerSpot.size,
        ...r,
      };
    }

    slotEl.style.display = "";
    setBannerSlotBlockHidden(slotEl, false);
    const r = renderBannerIntoSlot(slotEl, creative, effectiveSpot, opts);
    return {
      spotId,
      spot,
      tier,
      flex: hasFlexSizes(spot),
      creativeId: creative?.id || null,
      pickedSize: effectiveSpot?.size || null,
      ...r,
      ...(pickedViaSizeFallback && r.ok ? { fallback: "smaller_single" } : {}),
    };
  });

  return { slotsFound: slotEls.length, results };
}

function pickNativeLayout(settings, device, viewportWidth) {
  const desktop = settings?.layout?.desktop || {};
  const mobile = settings?.layout?.mobile || {};
  const breakpoint = Number(mobile?.breakpoint ?? 450);
  const shouldUseMobile = device === "mobile" || (Number.isFinite(viewportWidth) && viewportWidth <= breakpoint);
  return shouldUseMobile ? { mode: "mobile", cfg: mobile, breakpoint } : { mode: "desktop", cfg: desktop, breakpoint };
}

/** Desktop/mobile cols×rows для підпису порожнього слота */
function nativeDesktopMobileGridDims(settings) {
  const d = settings?.layout?.desktop || {};
  const m = settings?.layout?.mobile || {};
  const dc = Math.max(1, Number(d.cols ?? 1));
  const dr = Math.max(1, Number(d.rows ?? 1));
  const mc = Math.max(1, Number(m.cols ?? 1));
  const mr = Math.max(1, Number(m.rows ?? 1));
  return { dc, dr, mc, mr };
}

/** «Колоночний» — є більше однієї колонки на desktop або mobile */
function isNativeColumnarPlacement(settings) {
  const { dc, mc } = nativeDesktopMobileGridDims(settings);
  return dc > 1 || mc > 1;
}

function nativeNoCreativesEmptyText(placementId, settings) {
  let text = `Native placement ${placementId}: no native creatives`;
  if (settings && isNativeColumnarPlacement(settings)) {
    const { dc, dr, mc, mr } = nativeDesktopMobileGridDims(settings);
    text += ` (${dc}×${dr}/${mc}×${mr})`;
  }
  return text;
}

function applyNativeSettings(widgetEl, settings, layoutMode) {
  const grid = widgetEl.querySelector("[data-native-grid]");
  const label = widgetEl.querySelector("[data-native-label]");
  if (!grid || !label) return;

  // Layout
  const cols = Number(layoutMode.cfg?.cols ?? 1);
  const rows = Number(layoutMode.cfg?.rows ?? 1);
  const hSpace = Number(layoutMode.cfg?.hSpace ?? 10);
  const vSpace = Number(layoutMode.cfg?.vSpace ?? 10);
  const aspect = String(layoutMode.cfg?.aspect ?? "3:2");
  const maxLines = String(layoutMode.cfg?.maxLines ?? "2");

  grid.style.gridTemplateColumns = `repeat(${Math.max(cols, 1)}, 1fr)`;
  grid.style.columnGap = `${hSpace}px`;
  grid.style.rowGap = `${vSpace}px`;
  grid.style.padding = `${vSpace}px ${hSpace}px`;

  // Appearance
  widgetEl.style.background = String(settings?.appearance?.bgColor ?? "rgba(255,255,255,1)");
  const fixedSize = Boolean(settings?.layout?.fixedSize);
  if (fixedSize) {
    widgetEl.style.width = `${Number(settings?.layout?.width ?? 250)}px`;
    widgetEl.style.height = `${Number(settings?.layout?.height ?? 200)}px`;
    widgetEl.style.overflow = "auto";
  } else {
    widgetEl.style.width = "";
    widgetEl.style.height = "";
    widgetEl.style.overflow = "";
  }

  const imgBorderRadius = Number(settings?.appearance?.imgBorderRadius ?? 4);
  const imgBorderSize = Number(settings?.appearance?.imgBorderSize ?? 0);
  const imgBorderColor = String(settings?.appearance?.imgBorderColor ?? "rgba(0,0,0,1)");
  const zoomEffect = Boolean(settings?.appearance?.zoomEffect);

  widgetEl.style.fontFamily = String(settings?.text?.font ?? "Roboto, sans-serif");
  widgetEl.style.setProperty("--adDiagTitleHoverColor", String(settings?.text?.titleHoverColor ?? "rgba(0,0,0,1)"));
  widgetEl.style.setProperty("--adDiagCtaHoverBg", String(settings?.cta?.hoverBg ?? "rgba(37,99,235,1)"));

  // Label
  const showLabel = Boolean(settings?.label?.show ?? true);
  label.style.display = showLabel ? "block" : "none";
  label.textContent = String(settings?.label?.text ?? "Ads");
  label.style.color = String(settings?.label?.color ?? "rgba(153,153,153,1)");
  label.style.fontSize = `${Number(settings?.label?.size ?? 10)}px`;
  label.style.fontFamily = String(settings?.label?.font ?? "Roboto, sans-serif");
  label.style.fontWeight = settings?.label?.bold ? "700" : "400";
  label.style.fontStyle = settings?.label?.italic ? "italic" : "normal";
  const labelPosition = String(settings?.label?.position ?? "Top Right");
  label.style.textAlign = labelPosition.includes("Left") ? "left" : "right";
  label.style.order = labelPosition.includes("Bottom") ? "2" : "0";
  grid.style.order = labelPosition.includes("Bottom") ? "1" : "2";

  // Item styling
  const titleSize = Number(settings?.text?.titleSize ?? 14);
  const descSize = Number(settings?.text?.descSize ?? 12);
  const titleColor = String(settings?.text?.titleColor ?? "rgba(0,0,0,1)");
  const descColor = String(settings?.text?.descColor ?? "rgba(102,102,102,1)");
  const textAlign = String(settings?.text?.align ?? "Left").toLowerCase();
  const titleBold = Boolean(settings?.text?.titleBold ?? true);
  const titleItalic = Boolean(settings?.text?.titleItalic ?? false);

  widgetEl.querySelectorAll(".adDiag-nativeItem").forEach((item) => {
    item.classList.toggle("adDiag-zoomEnabled", zoomEffect);
  });

  widgetEl.querySelectorAll(".adDiag-thumb").forEach((thumb) => {
    thumb.style.borderRadius = `${imgBorderRadius}px`;
    thumb.style.border = `${imgBorderSize}px solid ${imgBorderColor}`;
    thumb.style.aspectRatio = aspect.replace(":", " / ");
  });

  widgetEl.querySelectorAll(".adDiag-title").forEach((t) => {
    t.style.fontSize = `${titleSize}px`;
    t.style.color = titleColor;
    t.style.textAlign = textAlign;
    t.style.fontWeight = titleBold ? "600" : "400";
    t.style.fontStyle = titleItalic ? "italic" : "normal";
    t.style.display = "-webkit-box";
    t.style.webkitLineClamp = maxLines;
    t.style.webkitBoxOrient = "vertical";
    t.style.overflow = "hidden";
  });
  widgetEl.querySelectorAll(".adDiag-desc").forEach((d) => {
    d.style.fontSize = `${descSize}px`;
    d.style.color = descColor;
    d.style.textAlign = textAlign;
    d.style.display = "-webkit-box";
    d.style.webkitLineClamp = maxLines;
    d.style.webkitBoxOrient = "vertical";
    d.style.overflow = "hidden";
  });

  // Brand: name, logo, CTA are independent. Legacy `showBrand: false` hid the whole row — keep that if `showBrandName` was never saved.
  const legacyShowBrand = settings?.brand?.showBrand;
  const hasExplicitBrandName = settings?.brand != null && Object.prototype.hasOwnProperty.call(settings.brand, "showBrandName");
  let showBrandName = hasExplicitBrandName
    ? Boolean(settings.brand.showBrandName)
    : legacyShowBrand === false
      ? false
      : Boolean(legacyShowBrand ?? true);
  let showLogo = Boolean(settings?.brand?.showLogo ?? true);
  if (!hasExplicitBrandName && legacyShowBrand === false) {
    showLogo = false;
  }
  if (TEMP_SUPPRESS_NATIVE_BRAND_ROW) {
    showBrandName = false;
    showLogo = false;
  }
  const brandRowVisible = showBrandName || showLogo;
  const brandColor = String(settings?.brand?.color ?? "rgba(136,136,136,1)");
  const brandSize = Number(settings?.brand?.size ?? 11);
  const logoSize = Number(settings?.brand?.logoSize ?? 16);
  const logoRadius = Number(settings?.brand?.logoRadius ?? 50);
  widgetEl.querySelectorAll(".adDiag-brandLogo").forEach((l) => {
    const hasImg = Boolean(l.querySelector("img"));
    l.style.display = showLogo && hasImg ? "flex" : "none";
    l.style.width = `${logoSize}px`;
    l.style.height = `${logoSize}px`;
    l.style.borderRadius = `${logoRadius}%`;
  });
  widgetEl.querySelectorAll(".adDiag-brandName").forEach((n) => {
    const hasName = Boolean(n.textContent.trim());
    n.style.display = showBrandName && hasName ? "inline" : "none";
    n.style.color = brandColor;
    n.style.fontSize = `${brandSize}px`;
  });
  widgetEl.querySelectorAll(".adDiag-brand").forEach((b) => {
    const hasName = Boolean(b.querySelector(".adDiag-brandName")?.textContent?.trim());
    const hasImg = Boolean(b.querySelector(".adDiag-brandLogo img"));
    const hasAnyCreativeBrand = hasName || hasImg;
    b.style.display = brandRowVisible && hasAnyCreativeBrand ? "flex" : "none";
  });

  // CTA
  const showCta = Boolean(settings?.cta?.showCta ?? true);
  const ctaBg = String(settings?.cta?.bg ?? "rgba(59,130,246,1)");
  const ctaTextColor = String(settings?.cta?.textColor ?? "rgba(255,255,255,1)");
  const ctaStyle = String(settings?.cta?.style ?? "Filled");
  const ctaRadius = Number(settings?.cta?.radius ?? 6);
  const ctaPadX = Number(settings?.cta?.padX ?? 12);
  const ctaPadY = Number(settings?.cta?.padY ?? 6);
  const ctaPosition = String(settings?.cta?.position ?? "Right");

  widgetEl.querySelectorAll(".adDiag-cta").forEach((c) => {
    const hasText = c.textContent.trim().length > 0;
    c.style.display = showCta && hasText ? "block" : "none";
    c.style.background = ctaStyle === "Filled" ? ctaBg : "transparent";
    c.style.color = ctaStyle === "Filled" ? ctaTextColor : ctaBg;
    c.style.border = ctaStyle === "Outlined" ? `1px solid ${ctaBg}` : "none";
    c.style.borderRadius = `${ctaRadius}px`;
    c.style.padding = `${ctaPadY}px ${ctaPadX}px`;
    c.style.width = ctaPosition === "Full Width" ? "100%" : "";
  });
  widgetEl.querySelectorAll(".adDiag-footer").forEach((f) => {
    const col = ctaPosition === "Below Text" || ctaPosition === "Full Width";
    f.style.flexDirection = col ? "column" : "row";
    f.style.alignItems = ctaPosition === "Right" || ctaPosition === "Left" ? "center" : "stretch";
    f.style.justifyContent = col ? "" : ctaPosition === "Left" ? "flex-start" : "flex-end";
  });

  widgetEl.querySelectorAll(".adDiag-nativeItem").forEach((item) => {
    const footer = item.querySelector(".adDiag-footer");
    const brand = item.querySelector(".adDiag-brand");
    const cta = item.querySelector(".adDiag-cta");
    if (!footer) return;
    const brandInFooter = Boolean(brand && footer.contains(brand));
    const brandShown = brand && brand.style.display !== "none";
    const ctaShown = cta && cta.style.display !== "none";
    footer.style.display = ctaShown || (brandInFooter && brandShown) ? "" : "none";
  });
}

function applyBrandPosition(widgetEl, position) {
  widgetEl.querySelectorAll(".adDiag-nativeItem").forEach((item) => {
    const content = item.querySelector(".adDiag-content");
    const title = item.querySelector(".adDiag-title");
    const desc = item.querySelector(".adDiag-desc");
    const footer = item.querySelector(".adDiag-footer");
    const brand = item.querySelector(".adDiag-brand");
    if (!content || !title || !desc || !footer || !brand) return;
    if (position === "Above Title") content.insertBefore(brand, title);
    else if (position === "Below Title") content.insertBefore(brand, desc);
    else footer.insertBefore(brand, footer.firstChild);
  });
}

function nativeItemMarkup(creative) {
  const thumb = el("div", { class: "adDiag-thumb" });
  if (creative?.assets?.mainImageDataUrl) {
    thumb.appendChild(el("img", { class: "adDiag-thumbImg", src: creative.assets.mainImageDataUrl, alt: "Image" }));
  } else {
    thumb.textContent = "Image";
  }

  const nameStr = String(creative?.brandName || "").trim();
  const hasLogoUrl = Boolean(creative?.assets?.logoDataUrl);

  const brandLogo = el("div", { class: "adDiag-brandLogo" });
  if (hasLogoUrl) {
    brandLogo.appendChild(el("img", { src: creative.assets.logoDataUrl, alt: "Logo" }));
  }

  const brand = el("div", { class: "adDiag-brand" }, [brandLogo, el("span", { class: "adDiag-brandName", text: nameStr })]);
  if (!nameStr && !hasLogoUrl) {
    brand.style.display = "none";
  }

  const ctaText = String(creative?.ctaText ?? "").trim();
  const cta = el("button", { class: "adDiag-cta", type: "button", text: ctaText });
  if (!ctaText) {
    cta.style.display = "none";
  }

  const footer = el("div", { class: "adDiag-footer" }, [cta]);

  const content = el("div", { class: "adDiag-content" }, [
    el("div", { class: "adDiag-title", text: creative?.title || "Your headline here" }),
    brand,
    el("div", { class: "adDiag-desc", text: creative?.description || "Description text goes here..." }),
    footer,
  ]);

  return el("div", { class: "adDiag-nativeItem" }, [thumb, content]);
}

export function renderNativeWidgets(root = document, opts = {}) {
  migrateIfNeeded();
  const widgets = readNativeWidgetsForRender(opts);
  const creatives = readNativeCreativesForRender(opts);
  const runtime = getRuntime();

  const containers = Array.from(root.querySelectorAll("[data-native-widget]"));
  const results = containers.map((container) => {
    const slotBlock = container.closest("[data-native-slot-block]");
    if (slotBlock) slotBlock.style.removeProperty("display");

    const widgetId = container.getAttribute("data-native-widget-id");
    const placement =
      (widgetId ? widgets.find((w) => w && String(w.id) === String(widgetId)) : widgets[0]) || null;
    const settings = placement?.settings || null;

    if (!placement || !settings) {
      if (!showEmptyPlacements(opts)) {
        container.style.display = "none";
        return { ok: false, reason: "native_placement_missing", widgetId, hidden: true };
      }
      clearNode(container);
      container.style.display = "";
      container.classList.add("adDiag-slotEmpty");
      return { ok: false, reason: "native_placement_missing", widgetId };
    }
    if (placement.status === false) {
      clearNode(container);
      container.classList.remove("adDiag-slotEmpty");
      container.style.display = "none";
      if (slotBlock) slotBlock.style.display = "none";
      return {
        ok: false,
        reason: "native_placement_disabled",
        widgetId,
        placementId: placement.id,
        hidden: true,
      };
    }

    if (!creatives.length) {
      if (!showEmptyPlacements(opts)) {
        container.style.display = "none";
        return { ok: false, reason: "no_native_creatives", widgetId, placementId: placement.id, hidden: true };
      }
      clearNode(container);
      container.style.display = "";
      container.classList.add("adDiag-slotEmpty");
      container.textContent = nativeNoCreativesEmptyText(placement.id, settings);
      return { ok: false, reason: "no_native_creatives", widgetId, placementId: placement.id };
    }

    const viewportWidth =
      typeof opts.viewportWidth === "number"
        ? opts.viewportWidth
        : container.getBoundingClientRect().width || window.innerWidth;

    const layoutMode = pickNativeLayout(settings, runtime.device, viewportWidth);
    const cols = Number(layoutMode.cfg?.cols ?? 1);
    const rows = Number(layoutMode.cfg?.rows ?? 1);
    const count = Math.max(cols * rows, 1);

    clearNode(container);
    container.classList.remove("adDiag-slotEmpty");
    container.style.display = "";

    const widget = el("div", { class: `adDiag-nativeWidget ${layoutMode.mode === "mobile" ? "adDiag-mobile" : ""}` }, [
      el("div", { class: "adDiag-label", "data-native-label": "1", text: "Ads" }),
      el("div", { class: "adDiag-grid", "data-native-grid": "1" }),
    ]);

    const grid = widget.querySelector("[data-native-grid]");
    const picked = creatives.slice(0, count);
    const padded = picked.length < count ? [...picked, ...Array.from({ length: count - picked.length }, () => null)] : picked;
    padded.forEach((c) => grid.appendChild(nativeItemMarkup(c)));

    container.appendChild(widget);

    applyBrandPosition(widget, String(settings?.brand?.position ?? "Below Title"));
    applyNativeSettings(widget, settings, layoutMode);
    appendPlacementIdBadge(container, placement.id, opts);

    return {
      ok: true,
      mode: layoutMode.mode,
      breakpoint: layoutMode.breakpoint,
      items: count,
      placementId: placement.id,
      widgetId,
    };
  });

  return { widgetsFound: containers.length, results };
}

export function renderAll(root = document, opts = {}) {
  return {
    banner: renderBannerSlots(root, opts),
    native: renderNativeWidgets(root, opts),
  };
}

