/**
 * ITALIARUN - TRAILER AUTO-ANIMATO (per registrare una pubblicità)
 * L'app si "anima da sola": cambia schede, vola sulla mappa, cambia modalità e
 * basemap, con titoli cinematografici, intro e outro. Avvio: window.trailer.play().
 * Il pulsante di avvio è visibile SOLO all'owner/sviluppatore (vedi account.js).
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";

  var stage = null;
  var els = {};

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function app() { return window.app; }
  function tmap() { return window.transitMap && window.transitMap.map ? window.transitMap : null; }

  function buildStage() {
    if (stage) return;
    stage = document.createElement("div");
    stage.className = "trailer-stage";
    stage.innerHTML =
      '<div class="trailer-bar trailer-bar-top"></div>' +
      '<div class="trailer-bar trailer-bar-bottom"></div>' +
      '<div class="trailer-progress"><span></span></div>' +
      '<div class="trailer-vignette"></div>' +
      '<div class="trailer-caption"><div class="tc-kicker"></div><div class="tc-title"></div><div class="tc-sub"></div></div>' +
      '<div class="trailer-card">' +
      '  <div class="trailer-logo"><span class="tl-badge"><i class="fa-solid fa-route"></i></span>' +
      '    <span class="tl-name">Italia<b>Run</b></span></div>' +
      '  <div class="trailer-card-title"></div>' +
      '  <div class="trailer-card-sub"></div>' +
      '  <div class="trailer-card-cta"></div>' +
      '</div>' +
      '<button class="trailer-exit" title="Esci dal trailer (Esc)"><i class="fa-solid fa-xmark"></i></button>';
    document.body.appendChild(stage);

    els.progress = stage.querySelector(".trailer-progress span");
    els.caption = stage.querySelector(".trailer-caption");
    els.kicker = stage.querySelector(".tc-kicker");
    els.title = stage.querySelector(".tc-title");
    els.sub = stage.querySelector(".tc-sub");
    els.card = stage.querySelector(".trailer-card");
    els.cardTitle = stage.querySelector(".trailer-card-title");
    els.cardSub = stage.querySelector(".trailer-card-sub");
    els.cardCta = stage.querySelector(".trailer-card-cta");

    stage.querySelector(".trailer-exit").addEventListener("click", stop);
  }

  // ---- helper di scena ----
  function showCard(title, sub, cta) {
    els.cardTitle.textContent = title || "";
    els.cardSub.textContent = sub || "";
    els.cardCta.textContent = cta || "";
    els.card.classList.add("show");
  }
  function hideCard() { els.card.classList.remove("show"); }

  function showCaption(kicker, title, sub) {
    els.kicker.textContent = kicker || "";
    els.title.textContent = title || "";
    els.sub.textContent = sub || "";
    els.caption.classList.add("show");
  }
  function hideCaption() { els.caption.classList.remove("show"); }

  var T = window.trailer = {
    playing: false,
    _saved: null,

    play: async function () {
      if (this.playing) return;
      this.playing = true;
      buildStage();
      document.body.classList.add("trailer-mode");
      // salva lo stato per ripristinarlo alla fine
      this._saved = {
        tab: (app() && app().currentTab) || "map",
        mode: (app() && app().currentMode) || "pullman",
        base: (typeof safeStorageGet === "function") ? safeStorageGet("italiabus_basemap", "🗺️ Mappa") : "🗺️ Mappa"
      };
      // avvia lettering + progress
      requestAnimationFrame(function () { stage.classList.add("run"); });
      var TOTAL = 47000;
      els.progress.style.transition = "width " + TOTAL + "ms linear";
      requestAnimationFrame(function () { els.progress.style.width = "100%"; });

      try {
        await this._run();
      } catch (e) { /* interrotto */ }
      if (this.playing) stop();
    },

    _run: async function () {
      var self = this;
      function alive() { return self.playing; }

      // ===== INTRO =====
      showCard("La mobilità di tutta Italia", "In tempo reale, in un'unica app", "");
      await wait(3200); if (!alive()) return;
      hideCard();
      await wait(700); if (!alive()) return;

      // ===== 1) TABELLONE LIVE =====
      if (app()) app().switchTab("live-board");
      await wait(500);
      showCaption("Tabellone Partenze", "Orari in Tempo Reale", "Conto alla rovescia al secondo per ogni corsa");
      await wait(4000); if (!alive()) return;
      hideCaption(); await wait(500); if (!alive()) return;

      // ===== 2) TUTTI I MEZZI =====
      showCaption("Un'app per tutto", "Pullman, Treni, Tram, Taxi e Aerei", "Cambia mezzo con un tocco");
      var modes = ["train", "tram", "taxi", "flight", "pullman"];
      for (var i = 0; i < modes.length; i++) {
        if (app()) app().switchTransportMode(modes[i]);
        await wait(950); if (!alive()) return;
      }
      hideCaption(); await wait(500); if (!alive()) return;

      // ===== 3) MAPPA GPS - VOLO SULL'ITALIA =====
      if (app()) app().switchTab("map");
      await wait(1200);
      showCaption("Mappa GPS Live", "Tutta l'Italia sulla Mappa", "Fermate, linee e mezzi in tempo reale");
      var m = tmap();
      if (m) {
        m.map.flyTo([45.4642, 9.1900], 12, { duration: 2.4 }); await wait(3000); if (!alive()) return;   // Milano
        m.map.flyTo([41.9028, 12.4964], 12, { duration: 2.6 }); await wait(3000); if (!alive()) return;   // Roma
        m.map.flyTo([39.2986, 16.2540], 11, { duration: 2.6 }); await wait(2600); if (!alive()) return;   // Calabria
      } else { await wait(6000); }
      hideCaption(); await wait(400); if (!alive()) return;

      // ===== 4) MODALITA' BASEMAP =====
      showCaption("Come vuoi tu", "Satellite, Strade, Rilievo, Scuro", "Scegli la vista che preferisci");
      var bases = ["🛰️ Satellite", "⛰️ Rilievo", "🌙 Scuro", "🗺️ Mappa"];
      for (var b = 0; b < bases.length; b++) { setBasemap(bases[b]); await wait(1500); if (!alive()) return; }
      hideCaption(); await wait(400); if (!alive()) return;

      // ===== 5) RADAR DI BORDO =====
      pulseRadar(true);
      showCaption("Radar di Bordo", "Autovelox, Benzinai, Autogrill", "Avvisi di prossimità e limiti di velocità");
      await wait(4000); if (!alive()) return;
      pulseRadar(false);
      hideCaption(); await wait(400); if (!alive()) return;

      // ===== 6) NAVIGATORE =====
      showCaption("Navigatore Intelligente", "Fermata più vicina e cambi", "Indicazioni passo-passo, a prova di scimmia");
      if (m) { m.map.flyTo([39.2986, 16.2540], 14, { duration: 2.0 }); }
      await wait(3800); if (!alive()) return;
      hideCaption(); await wait(400); if (!alive()) return;

      // ===== 7) CERCA & SCIOPERI =====
      if (app()) app().switchTab("search");
      await wait(700);
      showCaption("Cerca la Corsa", "Confronto Percorsi & Coincidenze", "Il tragitto migliore, sempre");
      await wait(3400); if (!alive()) return;
      hideCaption(); await wait(400);
      if (app()) app().switchTab("strikes");
      await wait(700);
      showCaption("Scioperi & Avvisi", "Sempre Aggiornati", "Non farti mai trovare impreparato");
      await wait(3400); if (!alive()) return;
      hideCaption(); await wait(500); if (!alive()) return;

      // ===== OUTRO =====
      if (app()) app().switchTab("map");
      showCard("Italia in movimento.", "Orari, mappe, navigatore e radar — gratis.", "★  Scarica ItaliaRun  ★");
      await wait(4600);
    },

    stop: function () { stop(); }
  };

  function setBasemap(name) {
    var tm = window.transitMap;
    if (!tm || !tm._baseMaps || !tm.map) return;
    try {
      Object.keys(tm._baseMaps).forEach(function (k) { tm.map.removeLayer(tm._baseMaps[k]); });
      (tm._baseMaps[name] || tm._baseMaps["🗺️ Mappa"]).addTo(tm.map);
    } catch (e) {}
  }

  function pulseRadar(on) {
    var bar = document.getElementById("mapRadarBar");
    if (bar) bar.classList.toggle("trailer-pulse", !!on);
  }

  function stop() {
    if (!T.playing && !stage) return;
    T.playing = false;
    pulseRadar(false);
    document.body.classList.remove("trailer-mode");
    // ripristina lo stato iniziale
    if (T._saved) {
      try {
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
