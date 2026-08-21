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
    if (style === "default") {
      this.root.removeAttribute("data-style");
    } else {
      this.root.setAttribute("data-style", style);
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
    const obs = new MutationObserver(() => this.syncActiveStates());
    obs.observe(this.root, { attributes: true, attributeFilter: ["data-theme"] });
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
