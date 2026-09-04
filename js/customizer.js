/**
 * ITALIABUS - MOTORE DI PERSONALIZZAZIONE (COLORI & STILE)
 * Palette estive, accento personalizzato, tema chiaro/scuro e stile bordi.
 * Le preferenze sono salvate in localStorage e riapplicate al caricamento.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

class CustomizerEngine {
  constructor() {
    this.root = document.documentElement;
    this.KEYS = {
      palette: "nx_palette",
      accent: "nx_accent",
      style: "nx_style",
      theme: "italiabus_theme" // condiviso con app.js
    };
    this.DEFAULTS = { palette: "mare", accent: "", style: "default" };
    this.THEME_PROPS = [
      "--brand-primary", "--brand-primary-hover", "--brand-primary-soft",
      "--brand-glow", "--brand-accent", "--brand-gradient",
      "--ticker-gradient", "--hero-accent", "--hero-glow"
    ];

    this.init();
  }

  init() {
    // Applica le preferenze salvate
    this.applyStoredSettings();
    this.bindPanel();
    this.bindControls();
    this.syncActiveStates();
    this.observeThemeChanges();
    this.initAndroidWidgetSection();
  }

  /* ---------- Storage helpers ---------- */
  get(key, fallback) {
    if (typeof safeStorageGet === 'function') {
      return safeStorageGet(this.KEYS[key], fallback);
    }
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(this.KEYS[key]) : null;
      return v !== null ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }
  set(key, value) {
    if (typeof safeStorageSet === 'function') {
      safeStorageSet(this.KEYS[key], value);
      return;
    }
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(this.KEYS[key], value);
    } catch (e) {}
  }

  applyStoredSettings() {
    const palette = this.get("palette", this.DEFAULTS.palette);
    const style = this.get("style", this.DEFAULTS.style);
    const accent = this.get("accent", this.DEFAULTS.accent);

    this.root.setAttribute("data-palette", palette);
    this.applyStyle(style);
    if (accent) this.applyAccent(accent, false);
  }

  /* ---------- Palette ---------- */
  applyPalette(palette) {
    this.root.setAttribute("data-palette", palette);
    this.set("palette", palette);
    // Un nuovo tema colore azzera l'accento personalizzato
    this.clearAccent();
    this.set("accent", "");
    this.refreshThemedVisuals();
    this.syncActiveStates();
  }

  /* ---------- Stile bordi ---------- */
  applyStyle(style) {
    if (this.root) {
      if (style === "default") {
        if (typeof this.root.removeAttribute === "function") this.root.removeAttribute("data-style");
      } else {
        if (typeof this.root.setAttribute === "function") this.root.setAttribute("data-style", style);
      }
    }
    this.set("style", style);
    this.syncActiveStates();
  }

  /* ---------- Tema chiaro / scuro ---------- */
  applyThemeChoice(theme) {
    if (window.app && typeof window.app.applyTheme === "function") {
      window.app.applyTheme(theme); // aggiorna anche pulsante header + storage
    } else {
      this.root.setAttribute("data-theme", theme);
      this.set("theme", theme);
    }
    this.syncActiveStates();
  }

  /* ---------- Accento personalizzato ---------- */
  applyAccent(hex, persist = true) {
    const primary = hex;
    const hover = this.shade(hex, -14);
    const light = this.shade(hex, 18);
    const heroLight = this.shade(hex, 34);

    const props = {
      "--brand-primary": primary,
      "--brand-primary-hover": hover,
      "--brand-primary-soft": this.rgba(hex, 0.13),
      "--brand-glow": this.rgba(hex, 0.30),
      "--brand-accent": light,
      "--brand-gradient": `linear-gradient(135deg, ${light}, ${hex})`,
      "--ticker-gradient": `linear-gradient(90deg, ${hex}, ${light})`,
      "--hero-accent": heroLight,
      "--hero-glow": this.rgba(heroLight, 0.20)
    };
    Object.entries(props).forEach(([k, v]) => this.root.style.setProperty(k, v));

    if (persist) this.set("accent", hex);
    this.refreshThemedVisuals();
    this.syncActiveStates();
  }

  clearAccent() {
    this.THEME_PROPS.forEach(p => this.root.style.removeProperty(p));
  }

  /* ---------- Reset ---------- */
  reset() {
    this.clearAccent();
    this.set("accent", "");
    this.applyPalette(this.DEFAULTS.palette);
    this.applyStyle(this.DEFAULTS.style);
    this.applyThemeChoice("light");
  }

  /* Ridisegna elementi che colorano gli SVG/mappa via JS con i colori tema */
  refreshThemedVisuals() {
    // Nessun ridisegno forzato necessario: gli SVG dei biglietti e la mappa
    // usano i colori delle linee dai dati, indipendenti dal tema UI.
  }

  /* ---------- Colore util ---------- */
  hexToRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const num = parseInt(h, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  rgba(hex, a) {
    const { r, g, b } = this.hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  // percent > 0 schiarisce, < 0 scurisce
  shade(hex, percent) {
    const { r, g, b } = this.hexToRgb(hex);
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    const nr = Math.round((t - r) * p) + r;
    const ng = Math.round((t - g) * p) + g;
    const nb = Math.round((t - b) * p) + b;
    return `#${[nr, ng, nb].map(v => v.toString(16).padStart(2, "0")).join("")}`;
  }

  /* ---------- UI binding ---------- */
  bindPanel() {
    const openBtn = document.getElementById("customizerToggleBtn");
    const closeBtn = document.getElementById("closeCustomizer");
    const overlay = document.getElementById("customizerOverlay");
    const panel = document.getElementById("customizerPanel");

    const open = () => {
      panel.classList.add("open");
      overlay.classList.add("open");
    };
    const close = () => {
      panel.classList.remove("open");
      overlay.classList.remove("open");
    };

    if (openBtn) openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (overlay) overlay.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  bindControls() {
    // Palette
    document.querySelectorAll("#czPaletteGrid .cz-palette-card").forEach(card => {
      card.addEventListener("click", () => this.applyPalette(card.dataset.palette));
    });

    // Accento: swatch
    document.querySelectorAll("#czAccentRow .cz-accent-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        this.applyAccent(dot.dataset.accent);
        const picker = document.getElementById("czColorPicker");
        if (picker) picker.value = dot.dataset.accent;
      });
    });

    // Accento: color picker libero
    const picker = document.getElementById("czColorPicker");
    if (picker) {
      picker.addEventListener("input", (e) => this.applyAccent(e.target.value));
    }

    // Tema chiaro/scuro
    document.querySelectorAll("#czThemeSeg .cz-seg-btn").forEach(btn => {
      btn.addEventListener("click", () => this.applyThemeChoice(btn.dataset.themeChoice));
    });

    // Stile bordi
    document.querySelectorAll("#czStyleSeg .cz-seg-btn").forEach(btn => {
      btn.addEventListener("click", () => this.applyStyle(btn.dataset.styleChoice));
    });

    // Reset
    const resetBtn = document.getElementById("czResetBtn");
    if (resetBtn) resetBtn.addEventListener("click", () => this.reset());
  }

  syncActiveStates() {
    const palette = this.root.getAttribute("data-palette") || this.DEFAULTS.palette;
    const style = this.get("style", this.DEFAULTS.style);
    const theme = this.root.getAttribute("data-theme") || "light";
    const accent = this.get("accent", "");

    document.querySelectorAll("#czPaletteGrid .cz-palette-card").forEach(c => {
      c.classList.toggle("active", !accent && c.dataset.palette === palette);
    });
    document.querySelectorAll("#czThemeSeg .cz-seg-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.themeChoice === theme);
    });
    document.querySelectorAll("#czStyleSeg .cz-seg-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.styleChoice === style);
    });
    document.querySelectorAll("#czAccentRow .cz-accent-dot").forEach(d => {
      d.classList.toggle("active", accent && d.dataset.accent.toLowerCase() === accent.toLowerCase());
    });
  }

  // Mantiene sincronizzato il pannello quando il tema cambia dal pulsante header
  observeThemeChanges() {
    if (typeof MutationObserver !== 'undefined' && this.root) {
      const obs = new MutationObserver(() => this.syncActiveStates());
      obs.observe(this.root, { attributes: true, attributeFilter: ["data-theme"] });
    }
  }

  // ==========================================================================
  // WIDGET SCHERMATA HOME (ANDROID)
  // ==========================================================================
  initAndroidWidgetSection() {
    const originGpsWrap = document.getElementById("czWidgetOriginGpsWrap");
    const originManualWrap = document.getElementById("czWidgetOriginManualWrap");
    const btnEditOrigin = document.getElementById("btnEditWidgetOrigin");
    const btnRestoreGps = document.getElementById("btnRestoreWidgetGps");
    const originInput = document.getElementById("czWidgetOriginInput");
    const destInput = document.getElementById("czWidgetDestInput");
    const btnAddWidget = document.getElementById("btnAddAndroidWidget");

    // Riferimenti anteprima
    const prevFrom = document.getElementById("czWcardFrom");
    const prevTo = document.getElementById("czWcardTo");
    const prevLine = document.getElementById("czWcardLine");
    const prevPlatform = document.getElementById("czWcardPlatform");
    const prevCountdown = document.getElementById("czWcardCountdown");
    const prevStatus = document.getElementById("czWcardStatus");
    const prevModeIcon = document.getElementById("czWcardModeIcon");

    if (!btnAddWidget) return;

    let isGps = true;
    let currentCountdownSec = 12 * 60; // 12 minuti di partenza

    // Carica configurazione precedentemente salvata
    try {
      const saved = localStorage.getItem("italiabus_home_widget_config");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.destination && destInput) destInput.value = data.destination;
        if (data.origin && data.origin !== "Posizione Attuale (GPS)" && originInput) {
          originInput.value = data.origin;
          isGps = false;
          if (originGpsWrap) originGpsWrap.style.display = "none";
          if (originManualWrap) originManualWrap.style.display = "flex";
        }
      }
    } catch (e) {}

    // Funzione di aggiornamento anteprima
    const updatePreview = () => {
      const originText = isGps ? "📍 Posizione Attuale (GPS)" : (originInput?.value.trim() || "Posizione di Partenza");
      const destText = destInput?.value.trim() || "Milano Centrale";

      if (prevFrom) prevFrom.textContent = originText;
      if (prevTo) prevTo.textContent = destText;

      // Riconoscimento intelligente della modalità di trasporto e gate/binario
      const destLower = destText.toLowerCase();
      let modeIcon = "fa-bus";
      let lineText = "Bus 279 A";
      let platformText = '<i class="fa-solid fa-signs-post"></i> Banchina 1';

      if (destLower.includes("aeroport") || destLower.includes("volo") || destLower.includes("fiumicino") || destLower.includes("malpensa") || destLower.includes("gate")) {
        modeIcon = "fa-plane";
        lineText = "Volo AZ 1142";
        platformText = '<i class="fa-solid fa-door-open text-info"></i> Gate B12';
      } else if (destLower.includes("centrale") || destLower.includes("termini") || destLower.includes("stazione") || destLower.includes("treno") || destLower.includes("freccia")) {
        modeIcon = "fa-train";
        lineText = "FR 9612";
        platformText = '<i class="fa-solid fa-signs-post"></i> Binario 4';
      } else if (destLower.includes("metro") || destLower.includes("tram") || destLower.includes("duomo")) {
        modeIcon = "fa-tram";
        lineText = "Metro M1";
        platformText = '<i class="fa-solid fa-signs-post"></i> Banchina Nord';
      }

      if (prevModeIcon) prevModeIcon.className = `fa-solid ${modeIcon} text-primary`;
      if (prevLine) prevLine.textContent = lineText;
      if (prevPlatform) prevPlatform.innerHTML = platformText;

      const mins = Math.max(1, Math.floor(currentCountdownSec / 60));
      if (prevCountdown) prevCountdown.textContent = `${mins} min`;
      if (prevStatus) prevStatus.textContent = "In Orario";
    };

    // Toggle Partenza GPS / Manuale
    if (btnEditOrigin) {
      btnEditOrigin.addEventListener("click", () => {
        isGps = false;
        if (originGpsWrap) originGpsWrap.style.display = "none";
        if (originManualWrap) originManualWrap.style.display = "flex";
        if (originInput) originInput.focus();
        updatePreview();
      });
    }

    if (btnRestoreGps) {
      btnRestoreGps.addEventListener("click", () => {
        isGps = true;
        if (originManualWrap) originManualWrap.style.display = "none";
        if (originGpsWrap) originGpsWrap.style.display = "flex";
        if (originInput) originInput.value = "";
        updatePreview();
      });
    }

    // Input listeners
    if (originInput) originInput.addEventListener("input", updatePreview);
    if (destInput) destInput.addEventListener("input", updatePreview);

    // Pillole di destinazione rapida
    document.querySelectorAll("#czWidgetQuickDestPills .cz-wpill").forEach(pill => {
      pill.addEventListener("click", () => {
        if (destInput) {
          destInput.value = pill.dataset.dest || pill.textContent;
          updatePreview();
        }
      });
    });

    // Timer animato di countdown nell'anteprima
    setInterval(() => {
      currentCountdownSec--;
      if (currentCountdownSec <= 30) currentCountdownSec = 15 * 60;
      const mins = Math.max(1, Math.floor(currentCountdownSec / 60));
      if (prevCountdown) prevCountdown.textContent = `${mins} min`;
    }, 1000);

    // Click: AGGIUNGI WIDGET ALLA SCHERMATA HOME
    btnAddWidget.addEventListener("click", () => {
      const originVal = isGps ? "Posizione Attuale (GPS)" : (originInput?.value.trim() || "Posizione Attuale");
      const destVal = destInput?.value.trim() || "Milano Centrale";
      const lineVal = prevLine?.textContent || "Bus 279 A";
      const platformVal = prevPlatform?.textContent?.trim() || "Gate / Binario 1";
      const minsVal = Math.max(1, Math.floor(currentCountdownSec / 60));

      const widgetConfig = {
        origin: originVal,
        destination: destVal,
        lineCode: lineVal,
        platform: platformVal,
        countdownMinutes: minsVal,
        departureTime: `${minsVal} min`,
        status: "In Orario"
      };

      // Salva in localStorage per persistenza
      try {
        localStorage.setItem("italiabus_home_widget_config", JSON.stringify(widgetConfig));
      } catch (e) {}

      // Feedback animato sul bottone
      const originalHtml = btnAddWidget.innerHTML;
      btnAddWidget.disabled = true;
      btnAddWidget.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aggiunta in corso...';

      // Comunica a Unity per effettuare la chiamata nativa Android (requestPinAppWidget)
      const msg = "pin_android_widget|||" + JSON.stringify(widgetConfig);
      const sentToUnity = window.invokeUnity && window.invokeUnity(msg);

      setTimeout(() => {
        btnAddWidget.disabled = false;
        btnAddWidget.innerHTML = '<i class="fa-solid fa-check"></i> Tratta Salvata nel Widget!';
        setTimeout(() => { btnAddWidget.innerHTML = originalHtml; }, 3000);

        // Mostra popup modale con istruzioni chiare per l'utente Android
        if (typeof showWidgetHomeModal === "function") {
          showWidgetHomeModal(widgetConfig);
        } else {
          alert(`✅ Tratta per il Widget salvata con successo!\n\nPartenza: ${originVal}\nDestinazione: ${destVal}\nProssimo: ${lineVal} (${platformVal})\n\nSe il tuo telefono Android ha aperto la finestra popup, tocca "Aggiungi alla schermata Home". Altrimenti tieni premuto su un punto vuoto della schermata Home, seleziona "Widget" > "Italiamobilità" e posizionalo.`);
        }
      }, 700);
    });

    // Inizializza l'anteprima
    updatePreview();
  }
}

function initCustomizerEngine() {
  if (!window.customizer) {
    window.customizer = new CustomizerEngine();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomizerEngine);
} else {
  initCustomizerEngine();
}
