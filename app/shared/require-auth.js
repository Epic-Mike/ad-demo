/**
 * Client-side gate for the diagnostic sandbox. Not a substitute for server auth.
 * Document root = app/ (paths like index.html, advertiser/banner.html).
 * GitHub Pages project sites use a URL prefix (/repo/…); login must stay under that prefix.
 */
(function () {
  "use strict";

  /** e.g. "" for localhost root, "/ad-demo" for https://user.github.io/ad-demo/ */
  function appBasePathFromScript() {
    var el = document.currentScript;
    if (!el || !el.src) return "";
    try {
      var p = new URL(el.src).pathname.replace(/\\/g, "/");
      var stripped = p.replace(/\/shared\/require-auth\.js$/i, "");
      if (!stripped || stripped === p) return "";
      return stripped.replace(/\/$/, "");
    } catch (e) {
      return "";
    }
  }

  var basePath = appBasePathFromScript();
  var rawPath = (location.pathname || "").replace(/\\/g, "/");
  var path = rawPath.replace(/^\/+/, "");
  path = path.replace(/^app\//i, "");

  if (basePath) {
    var bp = basePath.replace(/^\/+/, "");
    var low = path.toLowerCase();
    var pref = bp.toLowerCase() + "/";
    if (low.indexOf(pref) === 0) {
      path = path.slice(bp.length + 1);
    } else if (low === bp || low === bp + "/") {
      path = "";
    }
  }

  if (!path || path === "/") path = "index.html";
  if (path.endsWith("/")) path = path + "index.html";
  if (path === "login.html" || /(^|\/)login\.html$/i.test(path)) return;
  /* Публічне демо віртуального сайту: на Render гості мають бачити креативи без логіну. */
  if (/(^|\/)demo\/site\.html$/i.test(path)) return;
  try {
    if (sessionStorage.getItem("adDiagAuth") === "1") return;
  } catch (e) {}

  var depth = Math.max(0, path.split("/").length - 1);
  var prefix = depth ? new Array(depth + 1).join("../") : "";
  var loginHref =
    basePath !== ""
      ? basePath.replace(/\/$/, "") + "/login.html?next=" + encodeURIComponent(path)
      : prefix + "login.html?next=" + encodeURIComponent(path);

  location.replace(loginHref);
})();
