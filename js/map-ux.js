/**
 * ITALIARUN — MAP UX
 * Rende la mappa comoda "tipo Maps":
 *   • modalità SCHERMO INTERO (la mappa riempie tutta la finestra);
 *   • pannellini di controllo (camera navigatore + itinerario) TRASCINABILI,
 *     RIDUCIBILI A ICONA, RIDIMENSIONABILI e ad AGGANCIO-BORDO (si "ritirano"
 *     a linguetta come l'Edge di Samsung);
 *   • ingranaggio "Personalizza mappa" per attivare/disattivare ogni funzione.
 *
 * Modulo AUTONOMO e ADDITIVO: se non c'è, la mappa funziona come prima.
 * Le preferenze e le posizioni dei pannelli sono salvate in localStorage.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

(function () {
  "use strict";

  /* ---------- storage helpers (JSON) ---------- */
  function ssGet(key, fallback) {
    try {
      if (typeof safeStorageGet === "function") return safeStorageGet(key, fallback);
      var v = localStorage.getItem(key);
      return v !== null ? v : fallback;
    } catch (e) { return fallback; }
  }
  function ssSet(key, val) {
    try {
      if (typeof safeStorageSet === "function") { safeStorageSet(key, val); return; }
      localStorage.setItem(key, val);
    } catch (e) {}
  }
  function loadJSON(key, def) {
    var raw = ssGet(key, null);
    if (!raw) return def;
    try { return JSON.parse(raw); } catch (e) { return def; }
  }
  function saveJSON(key, obj) { ssSet(key, JSON.stringify(obj)); }

  /* ---------- preferenze globali (personalizzabili) ---------- */
  var PREFS = Object.assign(
    { dock: true, collapse: true, resize: true, immersive: true },
    loadJSON("mapux_prefs", {})
  );
  function savePrefs() { saveJSON("mapux_prefs", PREFS); }

  var DOCK_TRIGGER = 34;   // px dal bordo entro cui scatta l'aggancio
  var TAB_SIZE = 26;       // ingombro visibile della linguetta

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function isInteractive(t) {
    return !!(t.closest && t.closest("button, a, input, textarea, select, .mapux-resize-grip, .mapux-mini-btn, .geo-panel-actions"));
  }
  function stopMapProp(el) {
    if (window.L && L.DomEvent && el) {
      try { L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el); } catch (e) {}
    }
  }

  /* ==========================================================================
     PANNELLO FLOTTANTE: drag + aggancio-bordo + riduci a icona + resize
     ========================================================================== */
  function FloatingPanel(el, opts) {
    this.el = el;
    this.opts = opts || {};
    this.key = opts.key;
    this.bounds = opts.boundsEl;
    this.state = loadJSON("mapux_panel_" + this.key, {}); // {left,top,w,h,docked,collapsed}
    el.classList.add("mapux-panel");
    this._build();
    this._bindDrag();
    this._observe();
    this._restore();
  }

  FloatingPanel.prototype._boundsRect = function () {
    return (this.bounds || this.el.parentElement || document.body).getBoundingClientRect();
  };

  /* Crea (una sola volta) linguetta di aggancio, FAB di ripristino e hint bordi. */
  FloatingPanel.prototype._build = function () {
    var self = this, b = this.bounds;
    if (!b) return;

    // Linguetta "Edge": appare quando il pannello è agganciato al bordo.
    var tab = document.createElement("button");
    tab.type = "button";
    tab.className = "mapux-edge-tab";
    tab.innerHTML = '<i class="fa-solid ' + (this.opts.icon || "fa-sliders") + '"></i>' +
      (this.opts.label ? '<span class="mapux-tab-label">' + this.opts.label + "</span>" : "") +
      '<i class="fa-solid fa-angle-right mapux-tab-caret"></i>';
    tab.title = "Riapri " + (this.opts.label || "il pannello");
    tab.addEventListener("click", function (e) { e.stopPropagation(); self.undock(); });
    b.appendChild(tab);
    this.tab = tab;

    // FAB di ripristino: appare quando il pannello è ridotto a icona.
    var fab = document.createElement("button");
    fab.type = "button";
    fab.className = "mapux-restore-fab";
    fab.innerHTML = '<i class="fa-solid ' + (this.opts.icon || "fa-sliders") + '"></i>' +
      '<span class="mapux-fab-badge"></span>';
    fab.title = "Riapri " + (this.opts.label || "il pannello");
    fab.addEventListener("click", function (e) { e.stopPropagation(); self.expand(); });
    b.appendChild(fab);
    this.fab = fab;

    // Suggerimenti bordo (magnetismo) durante il drag.
    var hintL = document.createElement("div"); hintL.className = "mapux-edge-hint left";
    var hintR = document.createElement("div"); hintR.className = "mapux-edge-hint right";
    b.appendChild(hintL); b.appendChild(hintR);
    this.hintL = hintL; this.hintR = hintR;

    stopMapProp(tab); stopMapProp(fab);
  };

  /* Inserisce/ripristina i controlli DENTRO il pannello (sopravvivono ai
     re-render dell'innerHTML grazie al MutationObserver). */
  FloatingPanel.prototype._ensureChrome = function () {
    var self = this, el = this.el;

    // Pulsante "riduci a icona" nell'area azioni (se presente e abilitato).
    if (PREFS.collapse) {
      var actions = this.opts.actionsSelector ? el.querySelector(this.opts.actionsSelector) : null;
      if (actions && !actions.querySelector(".mapux-collapse-btn")) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mapux-mini-btn mapux-collapse-btn";
        btn.title = "Riduci a icona";
        btn.innerHTML = '<i class="fa-solid fa-compress"></i>';
        btn.addEventListener("click", function (e) { e.stopPropagation(); self.collapse(); });
        actions.insertBefore(btn, actions.firstChild);
      }
    }

    // Maniglia di ridimensionamento (angolo in basso a destra).
    if (PREFS.resize && this.opts.resizable) {
      if (!el.querySelector(".mapux-resize-grip")) {
        var grip = document.createElement("div");
        grip.className = "mapux-resize-grip";
        grip.title = "Trascina per ridimensionare";
        el.appendChild(grip);
        this._bindResize(grip);
      }
    }
  };

  /* Osserva i re-render (l'itinerario riscrive innerHTML) e re-inietta il chrome. */
  FloatingPanel.prototype._observe = function () {
    var self = this;
    this._ensureChrome();
    try {
      this._mo = new MutationObserver(function () {
        // evita loop: ripristina solo se manca qualcosa
        var needs =
          (PREFS.resize && self.opts.resizable && !self.el.querySelector(".mapux-resize-grip")) ||
          (PREFS.collapse && self.opts.actionsSelector &&
            self.el.querySelector(self.opts.actionsSelector) &&
            !self.el.querySelector(".mapux-collapse-btn"));
        if (needs) self._ensureChrome();
      });
      this._mo.observe(this.el, { childList: true, subtree: true });
    } catch (e) {}
  };

  /* ---------- DRAG ---------- */
  FloatingPanel.prototype._bindDrag = function () {
    var self = this, el = this.el, moved = false;
    var startX, startY, initLeft, initTop;

    function down(e) {
      if (el.classList.contains("mapux-docked") || el.classList.contains("mapux-minimized-icon")) return;
      var handle = self.opts.handleSelector ? e.target.closest(self.opts.handleSelector) : el;
      if (!handle || !el.contains(handle)) return;
      if (isInteractive(e.target)) return;

      var p = pointer(e);
      var br = self._boundsRect();
      var r = el.getBoundingClientRect();
      initLeft = r.left - br.left;
      initTop = r.top - br.top;
      startX = p.x; startY = p.y; moved = false;

      // normalizza su left/top
      el.style.right = "auto"; el.style.bottom = "auto";
      el.style.left = initLeft + "px"; el.style.top = initTop + "px";
      el.classList.add("mapux-dragging");
      var h = handle.classList ? handle : null;
      if (h) h.classList.add("mapux-grabbing");
      self._grabHandle = h;

      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      if (e.cancelable) e.preventDefault();
    }

    function move(e) {
      var p = pointer(e);
      var dx = p.x - startX, dy = p.y - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      var br = self._boundsRect();
      var r = el.getBoundingClientRect();
      var pad = 8;
      var maxLeft = Math.max(pad, br.width - r.width - pad);
      var maxTop = Math.max(pad, br.height - r.height - pad);
      var nl = clamp(initLeft + dx, pad, maxLeft);
      var nt = clamp(initTop + dy, pad, maxTop);
      el.style.left = nl + "px";
      el.style.top = nt + "px";

      if (PREFS.dock) {
        var nearL = nl <= pad + DOCK_TRIGGER;
        var nearR = nl >= maxLeft - DOCK_TRIGGER;
        self.hintL && self.hintL.classList.toggle("show", nearL);
        self.hintR && self.hintR.classList.toggle("show", nearR);
      }
      if (e.cancelable) e.preventDefault();
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.classList.remove("mapux-dragging");
      if (self._grabHandle) self._grabHandle.classList.remove("mapux-grabbing");
      self.hintL && self.hintL.classList.remove("show");
      self.hintR && self.hintR.classList.remove("show");
      if (!moved) return;

      var br = self._boundsRect();
      var r = el.getBoundingClientRect();
      var pad = 8;
      var left = r.left - br.left, top = r.top - br.top;
      var maxLeft = Math.max(pad, br.width - r.width - pad);

      // Aggancio-bordo (Edge) se rilasciato vicino al bordo sinistro/destro.
      if (PREFS.dock && left <= pad + DOCK_TRIGGER) { self.dock("left", top); return; }
      if (PREFS.dock && left >= maxLeft - DOCK_TRIGGER) { self.dock("right", top); return; }

      self.state.docked = null;
      self.state.left = left;
      self.state.top = top;
      self._save();
    }

    function pointer(e) {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    el.addEventListener("pointerdown", down);
  };

  /* ---------- RESIZE ---------- */
  FloatingPanel.prototype._bindResize = function (grip) {
    var self = this, el = this.el;
    var startX, startY, startW, startH;

    function down(e) {
      var p = pt(e);
      var r = el.getBoundingClientRect();
      startX = p.x; startY = p.y; startW = r.width; startH = r.height;
      el.classList.add("mapux-sized", "mapux-dragging");
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      var p = pt(e);
      var br = self._boundsRect();
      var minW = self.opts.minW || 220, minH = self.opts.minH || 120;
      var maxW = br.width - 16, maxH = br.height - 16;
      var w = clamp(startW + (p.x - startX), minW, maxW);
      var h = clamp(startH + (p.y - startY), minH, maxH);
      el.style.width = w + "px";
      el.style.height = h + "px";
      if (e.cancelable) e.preventDefault();
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.classList.remove("mapux-dragging");
      var r = el.getBoundingClientRect();
      self.state.w = r.width; self.state.h = r.height;
      self._save();
    }
    function pt(e) {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }
    grip.addEventListener("pointerdown", down);
  };

  /* ---------- AGGANCIO-BORDO ---------- */
  FloatingPanel.prototype.dock = function (side, top) {
    var el = this.el, br = this._boundsRect();
    this.state.docked = side;
    if (typeof top === "number") this.state.top = top;
    el.classList.add("mapux-docked");
    el.classList.remove("mapux-minimized-icon");
    if (this.fab) this.fab.classList.remove("show");

    var t = clamp((this.state.top != null ? this.state.top : br.height / 2 - 40), 8, Math.max(8, br.height - 90));
    if (this.tab) {
      this.tab.classList.remove("dock-left", "dock-right");
      this.tab.classList.add("show", side === "left" ? "dock-left" : "dock-right");
      this.tab.style.top = t + "px";
      var caret = this.tab.querySelector(".mapux-tab-caret");
      if (caret) caret.className = "fa-solid mapux-tab-caret fa-angle-" + (side === "left" ? "right" : "left");
    }
    this._save();
    if (typeof this.opts.onChange === "function") this.opts.onChange("docked");
  };

  FloatingPanel.prototype.undock = function () {
    var el = this.el, br = this._boundsRect();
    this.state.docked = null;
    el.classList.remove("mapux-docked");
    if (this.tab) this.tab.classList.remove("show");
    // riappare a filo del bordo da cui era stato ritirato
    var r = el.getBoundingClientRect();
    var pad = 10;
    var left = clamp(this.state.left != null ? this.state.left : pad, pad, Math.max(pad, br.width - r.width - pad));
    var top = clamp(this.state.top != null ? this.state.top : pad, pad, Math.max(pad, br.height - r.height - pad));
    el.style.right = "auto"; el.style.bottom = "auto";
    el.style.left = left + "px"; el.style.top = top + "px";
    this.state.left = left; this.state.top = top;
    this._save();
  };

  /* ---------- RIDUCI A ICONA ---------- */
  FloatingPanel.prototype.collapse = function () {
    var el = this.el, br = this._boundsRect();
    var r = el.getBoundingClientRect();
    var fx = clamp((r.left - br.left) + Math.min(r.width, 120) - 46, 8, Math.max(8, br.width - 54));
    var fy = clamp(r.top - br.top, 8, Math.max(8, br.height - 54));
    this.state.collapsed = true;
    el.classList.add("mapux-minimized-icon");
    el.classList.remove("mapux-docked");
    if (this.tab) this.tab.classList.remove("show");
    if (this.fab) {
      this.fab.style.left = fx + "px";
      this.fab.style.top = fy + "px";
      this.fab.classList.add("show");
    }
    this._save();
  };

  FloatingPanel.prototype.expand = function () {
    this.state.collapsed = false;
    this.el.classList.remove("mapux-minimized-icon");
    if (this.fab) this.fab.classList.remove("show");
    this._save();
  };

  FloatingPanel.prototype.setBadge = function (text) {
    if (!this.fab) return;
    var b = this.fab.querySelector(".mapux-fab-badge");
    if (b) b.textContent = text || "";
    this.fab.classList.toggle("has-badge", !!text);
  };

  /* Salviamo SOLO posizione e dimensione: "ridotto"/"agganciato" sono gesti
     della sessione, non li ripristiniamo su un'apertura nuova (altrimenti un
     itinerario appena calcolato resterebbe nascosto dietro la linguetta). */
  FloatingPanel.prototype._save = function () {
    saveJSON("mapux_panel_" + this.key, {
      left: this.state.left, top: this.state.top, w: this.state.w, h: this.state.h
    });
  };

  /* Applica posizione e dimensione preferite quando il pannello diventa visibile. */
  FloatingPanel.prototype._restore = function () {
    var el = this.el, s = this.state, br = this._boundsRect();
    if (br.width < 40) { // non ancora misurabile: riprova al prossimo frame
      var self = this; requestAnimationFrame(function () { self._restore(); });
      return;
    }
    if (PREFS.resize && this.opts.resizable && s.w) {
      el.classList.add("mapux-sized");
      el.style.width = s.w + "px";
      if (s.h) el.style.height = s.h + "px";
    }
    if (s.left != null && s.top != null && !s.docked) {
      var r = el.getBoundingClientRect();
      el.style.right = "auto"; el.style.bottom = "auto";
      el.style.left = clamp(s.left, 8, Math.max(8, br.width - r.width - 8)) + "px";
      el.style.top = clamp(s.top, 8, Math.max(8, br.height - r.height - 8)) + "px";
    }
  };

  /* Chiamato quando il pannello viene RIAPERTO dalla mappa (nuovo contenuto):
     mostra sempre il pannello, mantenendo posizione e dimensione preferite. */
  FloatingPanel.prototype.reopen = function () {
    this.state.docked = null;
    this.state.collapsed = false;
    this.el.classList.remove("mapux-docked", "mapux-minimized-icon");
    if (this.tab) this.tab.classList.remove("show");
    if (this.fab) this.fab.classList.remove("show");
    this._ensureChrome();
    this._restore();
  };

  /* ==========================================================================
     CONTROLLER GLOBALE
     ========================================================================== */
  var MapUX = {
    panels: {},
    _fsListenersBound: false,

    enhance: function (el, opts) {
      if (!el) return null;
      if (el._mapux) { el._mapux.reopen(); return el._mapux; }
      opts = opts || {};
      if (!opts.boundsEl) {
        opts.boundsEl = document.getElementById("leafletTransitMap") ||
                        document.querySelector(".transit-map-wrapper");
      }
      var p = new FloatingPanel(el, opts);
      el._mapux = p;
      if (opts.key) this.panels[opts.key] = p;
      return p;
    },

    /* ---------- schermo intero ---------- */
    isFullscreen: function () {
      var w = document.querySelector(".transit-map-wrapper");
      return !!(w && w.classList.contains("mapux-fullscreen"));
    },

    toggleFullscreen: function (force) {
      var wrap = document.querySelector(".transit-map-wrapper");
      if (!wrap) return;
      var on = (typeof force === "boolean") ? force : !wrap.classList.contains("mapux-fullscreen");
      wrap.classList.toggle("mapux-fullscreen", on);
      document.documentElement.classList.toggle("mapux-immersive", on && PREFS.immersive !== false);
      if (!on) wrap.classList.remove("mapux-tools-open");
      this._syncFsButtons();
      // Leaflet deve ricalcolare le dimensioni dopo il cambio layout.
      var invalidate = function () { try { window.transitMap && window.transitMap.map && window.transitMap.map.invalidateSize(); } catch (e) {} };
      invalidate();
      setTimeout(invalidate, 120);
      setTimeout(invalidate, 320);
    },

    toggleTools: function () {
      var wrap = document.querySelector(".transit-map-wrapper");
      if (!wrap || !wrap.classList.contains("mapux-fullscreen")) return;
      wrap.classList.toggle("mapux-tools-open");
      this._syncFsButtons();
      var invalidate = function () { try { window.transitMap && window.transitMap.map && window.transitMap.map.invalidateSize(); } catch (e) {} };
      setTimeout(invalidate, 120);
    },

    _syncFsButtons: function () {
      var fs = this.isFullscreen();
      var wrap = document.querySelector(".transit-map-wrapper");
      var toolsOpen = wrap && wrap.classList.contains("mapux-tools-open");
      if (this._btnFs) {
        this._btnFs.innerHTML = '<i class="fa-solid ' + (fs ? "fa-compress" : "fa-expand") + '"></i>';
        this._btnFs.title = fs ? "Esci da schermo intero" : "Schermo intero (tipo Maps)";
      }
      if (this._btnTools) {
        this._btnTools.classList.toggle("mapux-hidden", !fs);
        this._btnTools.classList.toggle("mapux-fab-primary", !!toolsOpen);
        this._btnTools.title = toolsOpen ? "Nascondi strumenti (zoom e radar)" : "Strumenti mappa (zoom e radar)";
      }
    },

    /* ---------- UI: cluster pulsanti + impostazioni ---------- */
    init: function () {
      var mapEl = document.getElementById("leafletTransitMap");
      var wrap = document.querySelector(".transit-map-wrapper");
      if (!mapEl || !wrap || this._inited) return;
      this._inited = true;

      // Cluster pulsanti flottanti (schermo intero / barre / impostazioni)
      var cluster = document.createElement("div");
      cluster.className = "mapux-fab-cluster";
      cluster.innerHTML =
        '<button type="button" class="mapux-fab mapux-fab-tools mapux-hidden" title="Strumenti mappa (zoom e radar)"><i class="fa-solid fa-layer-group"></i></button>' +
        '<button type="button" class="mapux-fab mapux-fab-settings" title="Personalizza mappa"><i class="fa-solid fa-sliders"></i></button>' +
        '<button type="button" class="mapux-fab mapux-fab-primary mapux-fab-fs" title="Schermo intero (tipo Maps)"><i class="fa-solid fa-expand"></i></button>';
      mapEl.appendChild(cluster);
      stopMapProp(cluster);

      this._btnFs = cluster.querySelector(".mapux-fab-fs");
      this._btnTools = cluster.querySelector(".mapux-fab-tools");
      this._btnSettings = cluster.querySelector(".mapux-fab-settings");

      var self = this;
      this._btnFs.addEventListener("click", function () { self.toggleFullscreen(); });
      this._btnTools.addEventListener("click", function () { self.toggleTools(); });
      this._btnSettings.addEventListener("click", function (e) { e.stopPropagation(); self.toggleSettings(); });

      // Chip "esci da schermo intero"
      var exit = document.createElement("button");
      exit.type = "button";
      exit.className = "mapux-exit-fs";
      exit.innerHTML = '<i class="fa-solid fa-arrow-left-long"></i> Esci';
      exit.addEventListener("click", function () { self.toggleFullscreen(false); });
      wrap.appendChild(exit);
      this._exitBtn = exit;

      // Pannello impostazioni
      this._buildSettings(wrap);

      // Esc esce da schermo intero
      if (!this._fsListenersBound) {
        this._fsListenersBound = true;
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && self.isFullscreen()) self.toggleFullscreen(false);
        });
        // chiudi il popup impostazioni cliccando fuori
        document.addEventListener("click", function (e) {
          if (self._settingsPop && self._settingsPop.classList.contains("show") &&
              !self._settingsPop.contains(e.target) && !self._btnSettings.contains(e.target)) {
            self._settingsPop.classList.remove("show");
          }
        });
      }

      this._syncFsButtons();
    },

    toggleSettings: function () {
      if (this._settingsPop) this._settingsPop.classList.toggle("show");
    },

    _buildSettings: function (wrap) {
      var self = this;
      var pop = document.createElement("div");
      pop.className = "mapux-settings-pop";
      pop.innerHTML =
        '<div class="mapux-settings-title"><i class="fa-solid fa-sliders"></i> Personalizza mappa</div>' +
        row("dock", "fa-arrows-left-right-to-line", "Aggancio ai bordi", "Trascina un pannello al bordo per ritirarlo a linguetta") +
        row("collapse", "fa-compress", "Riduci a icona", "Comprimi i pannelli in un pulsante flottante") +
        row("resize", "fa-up-right-and-down-left-from-center", "Ridimensionabili", "Trascina l'angolo per ingrandire/rimpicciolire") +
        row("immersive", "fa-mobile-screen", "Immersivo", "A schermo intero nascondi anche la barra inferiore") +
        '<button type="button" class="mapux-set-reset"><i class="fa-solid fa-rotate-left"></i> Ripristina posizioni pannelli</button>';
      wrap.appendChild(pop);
      this._settingsPop = pop;
      stopMapProp(pop);

      function row(k, icon, label, desc) {
        return '<label class="mapux-set-row">' +
          '<span class="mapux-set-label"><i class="fa-solid ' + icon + '"></i><span>' + label +
          '<small>' + desc + "</small></span></span>" +
          '<span class="mapux-switch"><input type="checkbox" data-pref="' + k + '"' + (PREFS[k] ? " checked" : "") + '>' +
          '<span class="mapux-slider"></span></span></label>';
      }

      pop.querySelectorAll('input[data-pref]').forEach(function (inp) {
        inp.addEventListener("change", function () {
          PREFS[inp.getAttribute("data-pref")] = inp.checked;
          savePrefs();
          self._applyPrefs();
        });
      });
      pop.querySelector(".mapux-set-reset").addEventListener("click", function () { self.resetPanels(); });
    },

    /* Applica le preferenze ai pannelli già presenti (mostra/nascondi chrome). */
    _applyPrefs: function () {
      Object.keys(this.panels).forEach(function (k) {
        var p = MapUX.panels[k];
        if (!PREFS.collapse) p.expand();
        if (!PREFS.dock && p.state.docked) p.undock();
        // (dis)attiva chrome: rimuovi grip/pulsante se disabilitati
        var grip = p.el.querySelector(".mapux-resize-grip");
        if (grip && (!PREFS.resize || !p.opts.resizable)) grip.remove();
        var cbtn = p.el.querySelector(".mapux-collapse-btn");
        if (cbtn && !PREFS.collapse) cbtn.remove();
        p._ensureChrome();
      });
      if (this.isFullscreen()) {
        document.documentElement.classList.toggle("mapux-immersive", PREFS.immersive !== false);
      }
    },

    resetPanels: function () {
      Object.keys(this.panels).forEach(function (k) {
        var p = MapUX.panels[k];
        p.state = {};
        p._save();
        p.el.classList.remove("mapux-docked", "mapux-minimized-icon", "mapux-sized");
        p.el.style.width = ""; p.el.style.height = "";
        p.el.style.left = ""; p.el.style.top = ""; p.el.style.right = ""; p.el.style.bottom = "";
        if (p.tab) p.tab.classList.remove("show");
        if (p.fab) p.fab.classList.remove("show");
      });
      if (this._settingsPop) this._settingsPop.classList.remove("show");
    }
  };

  window.MapUX = MapUX;

  function boot() { MapUX.init(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  // Ritenta se la mappa viene creata dopo (init sicura, idempotente).
  setTimeout(boot, 1200);
  setTimeout(boot, 3000);
})();
