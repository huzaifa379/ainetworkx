/* Vid Download — site behaviour.
   Everything here is progressive enhancement: the page is complete and
   navigable with JavaScript switched off, and this only adds the drawer,
   the gallery arrows, the scroll reveal, and the build numbers from
   config.js so the version never has to be edited in six places. */
(function () {
  "use strict";

  var cfg = window.VD || {};

  /* ---- build facts ---------------------------------------------------- */

  // data-vd="version|sizeMb|minAndroid|updated" → text; [data-vd-href] → the APK.
  document.querySelectorAll("[data-vd]").forEach(function (el) {
    var value = cfg[el.getAttribute("data-vd")];
    if (value) el.textContent = value;
  });
  if (cfg.apkUrl) {
    document.querySelectorAll("[data-vd-href]").forEach(function (a) {
      a.setAttribute("href", cfg.apkUrl);
    });
  }

  /* ---- mobile drawer -------------------------------------------------- */

  var toggle = document.querySelector(".nav-toggle");
  var drawer = document.getElementById("mobile-nav");
  if (toggle && drawer) {
    toggle.addEventListener("click", function () {
      var open = drawer.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // A tap on any link inside means the user is leaving: close behind them.
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        drawer.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }
  /* ---- screenshot gallery arrows -------------------------------------- */

  var strip = document.querySelector(".shots");
  if (strip) {
    var step = function () {
      var first = strip.querySelector(".shot");
      return first ? first.getBoundingClientRect().width + 18 : 250;
    };
    var prev = document.querySelector("[data-shots=prev]");
    var next = document.querySelector("[data-shots=next]");
    if (prev) prev.addEventListener("click", function () { strip.scrollBy({ left: -step(), behavior: "smooth" }); });
    if (next) next.addEventListener("click", function () { strip.scrollBy({ left: step(), behavior: "smooth" }); });
  }

  /* ---- reveal on scroll ----------------------------------------------- */

  var targets = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    // No observer (very old WebView): show everything rather than nothing.
    targets.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---- theme ----------------------------------------------------------- */

  // The page already picked a palette in the inline <head> script; this only
  // wires the switch. No stored choice means "follow the system", so the first
  // press has to write the opposite of whatever the system is showing.
  var root = document.documentElement;
  var themeBtn = document.querySelector("[data-theme-toggle]");
  var meta = document.querySelector('meta[name="theme-color"]');

  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set === "light" || set === "dark") return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function paintMeta(theme) {
    // The address bar follows the page, not the brand: an orange bar over a
    // white page reads as a different site's chrome on Android.
    if (meta) meta.setAttribute("content", theme === "light" ? "#FFFFFF" : "#0E0E11");
  }

  paintMeta(currentTheme());

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = currentTheme() === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      paintMeta(next);
      try { localStorage.setItem("vd-theme", next); } catch (e) { /* private mode */ }
    });
  }

  // Follow the system while the visitor has not chosen for themselves.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onSystemChange = function () {
      var stored = null;
      try { stored = localStorage.getItem("vd-theme"); } catch (e) { /* ignore */ }
      if (!stored) paintMeta(mq.matches ? "light" : "dark");
    };
    if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }

  /* ---- footer year ---------------------------------------------------- */

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

})();
