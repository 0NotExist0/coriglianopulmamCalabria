/**
 * ITALIARUN - IMPOSTAZIONI ASPETTO
 *  - Dimensione (scala): ingrandisce/rimpicciolisce testi E layout (CSS zoom).
 *  - Layout (densità): Comodo / Compatto (spaziatura).
 *  - Schermata iniziale al primo avvio per scegliere il layout più comodo.
 *  - Controlli riaccessibili dal pannello Personalizza.
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var LS_SCALE = "italiarun_ui_scale";
  var LS_DENSITY = "italiarun_layout_density";
  var LS_ONBOARDED = "italiarun_ui_onboarded";

  var SCALES = [0.8, 0.9, 1.0, 1.1, 1.25, 1.4];

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function getScale() { var v = parseFloat(lsGet(LS_SCALE, "1")); return isNaN(v) ? 1 : v; }
  function getDensity() { return lsGet(LS_DENSITY, "comfortable") === "compact" ? "compact" : "comfortable"; }

  function applyScale(v) { root.style.zoom = (v && v !== 1) ? String(v) : ""; }
  function applyDensity(d) { root.setAttribute("data-density", d === "compact" ? "compact" : "comfortable"); }
  function applyAll() { applyScale(getScale()); applyDensity(getDensity()); }

  function nearestScaleIndex(v) {
    var best = 0;
    for (var i = 1; i < SCALES.length; i++) {
      if (Math.abs(SCALES[i] - v) < Math.abs(SCALES[best] - v)) best = i;
    }
    return best;
  }

  function setScale(v) { lsSet(LS_SCALE, String(v)); applyScale(v); renderControls(); }
  function setDensity(d) { lsSet(LS_DENSITY, d); applyDensity(d); renderControls(); }
  function stepScale(dir) {
    var i = nearestScaleIndex(getScale());
    i = Math.max(0, Math.min(SCALES.length - 1, i + dir));
    setScale(SCALES[i]);
  }

  function scalePct() { return Math.round(getScale() * 100) + "%"; }

  // ---- Controlli nel pannello Personalizza ----
  function injectCustomizerControls() {
    var body = document.querySelector(".customizer-body");
    if (!body || document.getElementById("uisGroup")) return;
    var g = document.createElement("div");
    g.className = "cz-group";
    g.id = "uisGroup";
    g.innerHTML =
      '<div class="cz-group-title"><i class="fa-solid fa-text-height"></i> Dimensione & Layout</div>' +
      '<div class="uis-row"><span class="uis-label">Dimensione testi/layout</span>' +
      '  <div class="uis-stepper">' +
      '    <button class="uis-step" type="button" data-uis="dec">A&minus;</button>' +
      '    <span class="uis-scale-val" data-uis="val">100%</span>' +
      '    <button class="uis-step" type="button" data-uis="inc">A+</button>' +
      '  </div></div>' +
      '<div class="uis-row"><span class="uis-label">Layout</span>' +
      '  <div class="uis-seg">' +
      '    <button class="uis-seg-btn" type="button" data-uis-density="comfortable">Comodo</button>' +
      '    <button class="uis-seg-btn" type="button" data-uis-density="compact">Compatto</button>' +
      '  </div></div>';
    // inserisci in cima al corpo (subito dopo eventuale primo gruppo)
    body.insertBefore(g, body.firstChild);

    g.querySelector('[data-uis="dec"]').addEventListener("click", function () { stepScale(-1); });
    g.querySelector('[data-uis="inc"]').addEventListener("click", function () { stepScale(1); });
    g.querySelectorAll("[data-uis-density]").forEach(function (b) {
      b.addEventListener("click", function () { setDensity(b.getAttribute("data-uis-density")); });
    });
  }

  // ---- Schermata iniziale ----
  function injectOnboard() {
    if (document.getElementById("uisOnboard")) return;
    var ov = document.createElement("div");
    ov.className = "uis-onboard-overlay";
    ov.id = "uisOnboard";
    ov.innerHTML =
      '<div class="uis-onboard-box" role="dialog" aria-modal="true">' +
      '  <div class="uis-onboard-head"><i class="fa-solid fa-sliders"></i> Come vuoi vedere ItaliaRun?</div>' +
      '  <p class="uis-onboard-sub">Scegli il layout e la dimensione più comodi per te. Le vedi cambiare subito, e potrai modificarle quando vuoi da <b>Personalizza</b>.</p>' +
      '  <div class="uis-onboard-section">' +
      '    <div class="uis-onboard-label">Layout</div>' +
      '    <div class="uis-cards">' +
      '      <button class="uis-card" type="button" data-uis-density="comfortable"><i class="fa-solid fa-up-right-and-down-left-from-center"></i><b>Comodo</b><span>Più spazio, tocchi facili</span></button>' +
      '      <button class="uis-card" type="button" data-uis-density="compact"><i class="fa-solid fa-down-left-and-up-right-to-center"></i><b>Compatto</b><span>Più contenuto a schermo</span></button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="uis-onboard-section">' +
      '    <div class="uis-onboard-label">Dimensione testi e layout</div>' +
      '    <div class="uis-stepper big">' +
      '      <button class="uis-step" type="button" data-uis="dec">A&minus;</button>' +
      '      <span class="uis-scale-val" data-uis="val">100%</span>' +
      '      <button class="uis-step" type="button" data-uis="inc">A+</button>' +
      '    </div>' +
      '  </div>' +
      '  <button class="uis-onboard-done" type="button" id="uisOnboardDone">Inizia <i class="fa-solid fa-arrow-right"></i></button>' +
      '</div>';
    document.body.appendChild(ov);

    ov.querySelector('[data-uis="dec"]').addEventListener("click", function () { stepScale(-1); });
    ov.querySelector('[data-uis="inc"]').addEventListener("click", function () { stepScale(1); });
    ov.querySelectorAll("[data-uis-density]").forEach(function (b) {
      b.addEventListener("click", function () { setDensity(b.getAttribute("data-uis-density")); });
    });
    document.getElementById("uisOnboardDone").addEventListener("click", function () {
      lsSet(LS_ONBOARDED, "1");
      ov.classList.remove("open");
    });
  }

  function openOnboard() {
    injectOnboard();
    renderControls();
    var ov = document.getElementById("uisOnboard");
    if (ov) ov.classList.add("open");
  }

  // ---- Aggiorna gli stati visivi ovunque ----
  function renderControls() {
    document.querySelectorAll('[data-uis="val"]').forEach(function (el) { el.textContent = scalePct(); });
    var d = getDensity();
    document.querySelectorAll("[data-uis-density]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-uis-density") === d);
    });
  }

  function init() {
    applyAll(); // rinforza l'applicazione (lo script inline in <head> l'ha già fatto senza flash)
    injectCustomizerControls();
    renderControls();
    if (lsGet(LS_ONBOARDED, "") !== "1") {
      // primo avvio: lascia caricare l'app, poi proponi la scelta
      setTimeout(openOnboard, 700);
    }
  }

  window.uiSettings = {
    open: openOnboard,
    apply: applyAll,
    setScale: setScale,
    setDensity: setDensity,
    stepScale: stepScale
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
