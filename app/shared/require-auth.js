/**
 * Client-side gate for the diagnostic sandbox. Not a substitute for server auth.
 * Expects HTTP server document root = app/ (paths like /index.html, /advertiser/banner.html).
 */
(function () {
  "use strict";
  var path = (location.pathname || "").replace(/\\/g, "/").replace(/^\/+/, "");
  path = path.replace(/^app\//i, "");
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
  location.replace(prefix + "login.html?next=" + encodeURIComponent(path));
})();
