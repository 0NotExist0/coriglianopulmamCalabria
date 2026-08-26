/**
 * ITALIARUN - TRAILER AUTO-ANIMATO (demo guidato per pubblicità)
 * L'app si anima da sola e si TRASFORMA temporaneamente: sfondo scuro/azzurro
 * dietro i testi (leggibili), spotlight sulle singole parti (il resto sparisce),
 * spiegazioni in contesto. Messaggio: entra → scrivi la destinazione → percorso
 * completo con bus/treni/tram e i cambi; + modalità auto.
 * Avvio: window.trailer.play(). Pulsante visibile solo all'owner (account.js).
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";

  var stage = null, els = {};
  var spotPrev = null, spotEl = null;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function app() { return window.app; }
  function tmap() { return (window.transitMap && window.transitMap.map) ? window.transitMap : null; }
  function alive() { return T.playing; }

  function build() {
    if (stage) return;
    stage = document.createElement("div");
    stage.className = "trailer-stage";
    stage.innerHTML =
      '<div class="trailer-scrim"></div>' +
      '<div class="trailer-hole"></div>' +
      '<div class="trailer-bar trailer-bar-top"></div>' +
      '<div class="trailer-bar trailer-bar-bottom"></div>' +
      '<div class="trailer-progress"><span></span></div>' +
      '<div class="trailer-focus"></div>' +
      '<div class="trailer-caption"><div class="tc-kicker"></div><div class="tc-title"></div><div class="tc-sub"></div></div>' +
      '<div class="trailer-card">' +
      '  <div class="trailer-logo"><span class="tl-badge"><i class="fa-solid fa-route"></i></span>' +
      '    <span class="tl-name">Italia<b>Run</b></span></div>' +
      '  <div class="trailer-card-title"></div>' +
      '  <div class="trailer-card-sub"></div>' +
      '  <div class="trailer-card-cta"></div>' +
      '</div>' +
      '<button class="trailer-exit" title="Esci (Esc)"><i class="fa-solid fa-xmark"></i></button>';
    document.body.appendChild(stage);
    els = {
      scrim: stage.querySelector(".trailer-scrim"),
      hole: stage.querySelector(".trailer-hole"),
      progress: stage.querySelector(".trailer-progress span"),
      focus: stage.querySelector(".trailer-focus"),
      caption: stage.querySelector(".trailer-caption"),
      kicker: stage.querySelector(".tc-kicker"),
      title: stage.querySelector(".tc-title"),
      sub: stage.querySelector(".tc-sub"),
      card: stage.querySelector(".trailer-card"),
      cardTitle: stage.querySelector(".trailer-card-title"),
      cardSub: stage.querySelector(".trailer-card-sub"),
      cardCta: stage.querySelector(".trailer-card-cta")
    };
    stage.querySelector(".trailer-exit").addEventListener("click", stop);
  }

  // ---------- primitive visive ----------
  function scrim(mode) { // 'dark' | 'blue' | 'off'
    els.scrim.className = "trailer-scrim" + (mode && mode !== "off" ? " show " + mode : "");
  }
  function showCard(title, sub, cta) {
    els.cardTitle.textContent = title || ""; els.cardSub.textContent = sub || ""; els.cardCta.textContent = cta || "";
    els.card.classList.add("show");
  }
  function hideCard() { els.card.classList.remove("show"); }
  function caption(kicker, title, sub) {
    els.kicker.textContent = kicker || ""; els.title.textContent = title || ""; els.sub.textContent = sub || "";
    els.caption.classList.add("show");
  }
  function hideCaption() { els.caption.classList.remove("show"); }

  function clearSpot() {
    els.hole.classList.remove("show");
    if (spotEl && spotPrev) {
      spotEl.style.transition = spotPrev.transition; spotEl.style.transform = spotPrev.transform;
    }
    spotEl = null; spotPrev = null;
  }
  // Evidenzia UN elemento reale: buco luminoso nello scrim scuro attorno ad esso.
  async function spotlight(sel, padding) {
    var el = document.querySelector(sel);
    if (!el) { scrim("dark"); return; }
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
    await wait(650); if (!alive()) return;
    var r = el.getBoundingClientRect();
    var pad = padding == null ? 10 : padding;
    scrim("off");
    els.hole.style.left = Math.max(6, r.left - pad) + "px";
    els.hole.style.top = Math.max(6, r.top - pad) + "px";
    els.hole.style.width = (r.width + pad * 2) + "px";
    els.hole.style.height = (r.height + pad * 2) + "px";
    els.hole.classList.add("show");
    // leggero "pop" dell'elemento
    spotEl = el;
    spotPrev = { transition: el.style.transition, transform: el.style.transform };
    el.style.transition = "transform .5s cubic-bezier(.16,1,.3,1)";
  }

  function focusHTML(html) { els.focus.innerHTML = html; els.focus.classList.add("show"); }
  function clearFocus() { els.focus.classList.remove("show"); setTimeout(function () { if (els.focus) els.focus.innerHTML = ""; }, 400); }

  async function typeInto(sel, text) {
    var input = document.querySelector(sel);
    if (!input) return;
    input.value = "";
    for (var i = 0; i < text.length; i++) {
      if (!alive()) return;
      input.value += text[i];
      await wait(90);
    }
  }

  function setBasemap(name) {
    var tm = window.transitMap;
    if (!tm || !tm._baseMaps || !tm.map) return;
    try { Object.keys(tm._baseMaps).forEach(function (k) { tm.map.removeLayer(tm._baseMaps[k]); }); (tm._baseMaps[name] || tm._baseMaps["🗺️ Mappa"]).addTo(tm.map); } catch (e) {}
  }

  // ---------- contenuti demo (percorso completo + auto) ----------
  function routeCardHTML() {
    return '<div class="tf-card tf-route">' +
      '<div class="tf-badge tf-badge-green"><i class="fa-solid fa-circle-check"></i> Percorso trovato</div>' +
      '<div class="tf-route-head">Corigliano <i class="fa-solid fa-arrow-right-long"></i> Venezia</div>' +
      '<div class="tf-steps">' +
      '  <div class="tf-step"><span class="tf-ic walk"><i class="fa-solid fa-person-walking"></i></span><span class="tf-txt"><b>200 m a piedi</b> → Terminal Stazione FS</span></div>' +
      '  <div class="tf-step"><span class="tf-ic bus"><i class="fa-solid fa-bus"></i></span><span class="tf-txt"><b>Bus 5133</b> · Corigliano → Cosenza</span></div>' +
      '  <div class="tf-step tf-change"><span class="tf-ic chg"><i class="fa-solid fa-arrows-rotate"></i></span><span class="tf-txt">Cambio a <b>Cosenza Autostazione</b></span></div>' +
      '  <div class="tf-step"><span class="tf-ic train"><i class="fa-solid fa-train"></i></span><span class="tf-txt"><b>Treno RV 2454</b> · Cosenza → Roma T.ni</span></div>' +
      '  <div class="tf-step tf-change"><span class="tf-ic chg"><i class="fa-solid fa-arrows-rotate"></i></span><span class="tf-txt">Cambio a <b>Roma Termini</b></span></div>' +
      '  <div class="tf-step"><span class="tf-ic train"><i class="fa-solid fa-train-subway"></i></span><span class="tf-txt"><b>Frecciarossa</b> · Roma → Venezia S.L.</span></div>' +
      '  <div class="tf-step"><span class="tf-ic flag"><i class="fa-solid fa-flag-checkered"></i></span><span class="tf-txt"><b>Arrivo</b> · Venezia Santa Lucia</span></div>' +
      '</div>' +
      '<div class="tf-route-foot"><span><i class="fa-solid fa-clock"></i> 8h 20m</span><span><i class="fa-solid fa-ticket"></i> da € 39,90</span></div>' +
      '</div>';
  }
  function carCardHTML() {
    return '<div class="tf-card tf-car">' +
      '<div class="tf-badge tf-badge-blue"><i class="fa-solid fa-car"></i> In auto</div>' +
      '<div class="tf-route-head">Corigliano <i class="fa-solid fa-arrow-right-long"></i> Venezia</div>' +
      '<div class="tf-car-stats">' +
      '  <div class="tf-stat"><span class="tf-num">1.020 km</span><span class="tf-lbl">distanza</span></div>' +
      '  <div class="tf-stat"><span class="tf-num">9h 45m</span><span class="tf-lbl">tempo</span></div>' +
      '  <div class="tf-stat"><span class="tf-num">~€ 128</span><span class="tf-lbl">carburante</span></div>' +
      '  <div class="tf-stat"><span class="tf-num">~€ 72</span><span class="tf-lbl">pedaggi</span></div>' +
      '</div>' +
      '<div class="tf-turn"><i class="fa-solid fa-arrow-turn-up"></i> Prendi la <b>A2</b> verso Salerno, poi la <b>A1</b> per Roma</div>' +
      '</div>';
  }

  // ==========================================================================
  var T = window.trailer = {
    playing: false,
    _saved: null,

    play: async function () {
      if (this.playing) return;
      this.playing = true;
      build();
      document.body.classList.add("trailer-mode");
      this._saved = {
        tab: (app() && app().currentTab) || "map",
        mode: (app() && app().currentMode) || "pullman",
        base: (typeof safeStorageGet === "function") ? safeStorageGet("italiabus_basemap", "🗺️ Mappa") : "🗺️ Mappa"
      };
      requestAnimationFrame(function () { stage.classList.add("run"); });
      var TOTAL = 52000;
      els.progress.style.transition = "width " + TOTAL + "ms linear";
      requestAnimationFrame(function () { els.progress.style.width = "100%"; });
      try { await this._run(); } catch (e) {}
      if (this.playing) stop();
    },

    _run: async function () {
      // ===== INTRO =====
      scrim("blue");
      showCard("Muoviti in tutta Italia.", "Bus, treni, tram, taxi e voli — in un'unica app.", "");
      await wait(3200); if (!alive()) return;
      hideCard();

      // ===== 1) ENTRA E SCRIVI LA DESTINAZIONE =====
      if (app()) app().switchTab("map");
      await wait(900);
      caption("È semplicissimo", "Ti basta entrare e scrivere dove vuoi andare", "");
      scrim("blue"); await wait(2600); if (!alive()) return;
      hideCaption(); await wait(300);
      await spotlight(".map-dest-input, #mapDestinationInput, input.map-dest-input", 12); if (!alive()) return;
      caption("Passo 1", "Scrivi la destinazione", "Esempio: Venezia");
      await typeInto(".map-dest-input, #mapDestinationInput, input.map-dest-input", "Venezia"); if (!alive()) return;
      await wait(1600); if (!alive()) return;
      hideCaption(); clearSpot(); await wait(400); if (!alive()) return;

      // ===== 2) PERCORSO COMPLETO CON I CAMBI =====
      scrim("dark");
      focusHTML(routeCardHTML());
      caption("Passo 2", "Hai subito il percorso completo", "Quali bus, treni e tram prendere — e dove cambiare");
      // rivela gli step uno alla volta
      var steps = els.focus.querySelectorAll(".tf-step");
      for (var s = 0; s < steps.length; s++) { steps[s].classList.add("in"); await wait(420); if (!alive()) return; }
      await wait(2600); if (!alive()) return;
      caption("Nessun pensiero", "Ogni cambio spiegato passo-passo", "Indicazioni a prova di scimmia, dall'inizio alla fine");
      await wait(3200); if (!alive()) return;
      hideCaption(); clearFocus(); await wait(500); if (!alive()) return;

      // ===== 3) IN AUTO =====
      scrim("dark");
      focusHTML(carCardHTML());
      caption("Passo 3", "In macchina? Anche il percorso in auto", "Distanza, tempi, consumi, pedaggi e svolte");
      await wait(4200); if (!alive()) return;
      hideCaption(); clearFocus(); await wait(500); if (!alive()) return;

      // ===== 4) MAPPA LIVE DI TUTTA ITALIA =====
      scrim("off");
      var m = tmap();
      caption("In tempo reale", "Mappa GPS di tutta Italia", "Fermate, linee e mezzi dal vivo");
      if (m) {
        m.map.flyTo([45.4642, 9.1900], 12, { duration: 2.3 }); await wait(2700); if (!alive()) return;
        m.map.flyTo([41.9028, 12.4964], 12, { duration: 2.5 }); await wait(2700); if (!alive()) return;
        m.map.flyTo([39.2986, 16.2540], 11, { duration: 2.5 }); await wait(2400); if (!alive()) return;
      } else { await wait(6000); }
      hideCaption(); await wait(300);
      caption("Come vuoi tu", "Satellite, strade, rilievo, scuro", "");
      var bases = ["🛰️ Satellite", "⛰️ Rilievo", "🌙 Scuro", "🗺️ Mappa"];
      for (var b = 0; b < bases.length; b++) { setBasemap(bases[b]); await wait(1300); if (!alive()) return; }
      hideCaption(); await wait(400); if (!alive()) return;

      // ===== 5) RADAR DI BORDO =====
      var bar = document.getElementById("mapRadarBar");
      if (bar) { await spotlight("#mapRadarBar", 8); }
      caption("Extra", "Radar di bordo", "Autovelox, benzinai, autogrill e limiti di velocità");
      await wait(3600); if (!alive()) return;
      clearSpot(); hideCaption(); await wait(400); if (!alive()) return;

      // ===== OUTRO =====
      scrim("blue");
      showCard("Entra. Scrivi. Parti.", "Il percorso completo di tutta Italia, gratis.", "★  Scarica ItaliaRun  ★");
      await wait(4600);
    },

    stop: function () { stop(); }
  };

  function stop() {
    if (!T.playing && !stage) return;
    T.playing = false;
    document.body.classList.remove("trailer-mode");
    clearSpot();
    if (T._saved) {
      try {
        var inp = document.querySelector(".map-dest-input, #mapDestinationInput, input.map-dest-input");
        if (inp) inp.value = "";
        if (app()) { app().switchTab(T._saved.tab); if (app().currentMode !== T._saved.mode) app().switchTransportMode(T._saved.mode); }
        setBasemap(T._saved.base);
      } catch (e) {}
      T._saved = null;
    }
    if (stage) {
      stage.classList.remove("run");
      var s = stage; stage = null; els = {};
      setTimeout(function () { if (s && s.parentNode) s.parentNode.removeChild(s); }, 600);
    }
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && T.playing) stop(); });
})();
