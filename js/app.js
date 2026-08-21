/**
 * ITALIABUS & MOBILITÀ ITALIA - MAIN APP CONTROLLER
 * Gestione navigazione, schede, dark mode, rendering sezioni statiche/dinamiche,
 * gestione avvisi di servizio e storage locale sicuro con gestione multi-livello.
 */

// Helper sicuri per lo Storage (evita crash su Safari iOS, Private Mode, WebView)
function safeStorageGet(key, fallback = null) {
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(key);
      return v !== null ? v : fallback;
    }
  } catch (e) {
    console.warn("Storage access warning:", e);
  }
  return fallback;
}

function safeStorageSet(key, val) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, val);
    }
  } catch (e) {
    console.warn("Storage write warning:", e);
  }
}

class AppController {
  constructor() {
    this.currentTab = "live-board";
    this.theme = safeStorageGet("italiabus_theme", "light");
    this.currentMode = safeStorageGet("italiabus_transport_mode", "pullman");
    this.currentRegion = safeStorageGet("italiabus_region", "calabria");
    this.currentCity = safeStorageGet("italiabus_city", "all");
    this.currentStopId = safeStorageGet("italiabus_stop", "");

    if (!this.currentStopId && typeof getMainHubForRegion === "function") {
      this.currentStopId = getMainHubForRegion(this.currentRegion)?.id || "";
    }

    this.init();
  }

  init() {
    try {
      this.bindModeSwitcher();
      this.applyTransportMode(this.currentMode);
      this.populateLocationSelectors();
      this.bindLocationSelectors();
      this.bindNavLinks();
      this.bindThemeToggle();
      this.bindMobileMenu();
      this.applyTheme(this.theme);
      this.renderFleetSection();
      this.renderTariffsSection();
      this.renderAlertsBanner();
      this.notifyLocationChange();
    } catch (err) {
      console.error("AppController init error:", err);
    }
  }

  bindModeSwitcher() {
    // Tasto apri/chiudi dock sinistro
    const openBtn = document.getElementById("openModeSidebarBtn");
    const dock = document.getElementById("modeSidebarDock");
    const overlay = document.getElementById("modeSidebarOverlay");
    const closeBtn = document.getElementById("toggleModeSidebar");

    const openDock = () => {
      if (dock) dock.classList.add("open");
      if (overlay) overlay.classList.add("active");
    };

    const closeDock = () => {
      if (dock) dock.classList.remove("open");
      if (overlay) overlay.classList.remove("active");
    };

    if (openBtn) openBtn.addEventListener("click", openDock);
    if (closeBtn) closeBtn.addEventListener("click", closeDock);
    if (overlay) overlay.addEventListener("click", closeDock);

    // Click sui pulsanti del menu a comparsa sinistro
    document.querySelectorAll(".btn-mode-card").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        if (mode) {
          this.switchTransportMode(mode);
          closeDock();
        }
      });
    });

    // Click sui chips nel drawer mobile
    document.querySelectorAll(".drawer-mode-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        if (mode) {
          this.switchTransportMode(mode);
          const mobileDrawer = document.getElementById("mobileDrawer");
          if (mobileDrawer) mobileDrawer.classList.remove("open");
        }
      });
    });
  }

  switchTransportMode(mode) {
    if (!mode || !window.TRANSIT_DATA || !window.TRANSIT_DATA.modes[mode]) return;
    this.currentMode = mode;
    safeStorageSet("italiabus_transport_mode", mode);
    this.applyTransportMode(mode);

    // Reimposta stop di riferimento per la modalità
    const modeData = window.TRANSIT_DATA.modes[mode];
    const hub = (modeData.stops && modeData.stops.find(s => s.region === this.currentRegion)) || modeData.stops[0];
    if (hub) {
      this.currentStopId = hub.id;
      safeStorageSet("italiabus_stop", this.currentStopId);
    }

    this.populateLocationSelectors();
    this.renderFleetSection();
    this.renderTariffsSection();

    // Notifica tutti i componenti dello switch modalità
    document.dispatchEvent(new CustomEvent("transportModeChanged", {
      detail: { mode: mode, modeData: modeData }
    }));
    this.notifyLocationChange();
  }

  applyTransportMode(mode) {
    const modeData = window.TRANSIT_DATA.modes[mode] || window.TRANSIT_DATA.modes.pullman;

    // Aggiorna classi del body
    document.body.classList.remove("mode-pullman", "mode-train", "mode-tram", "mode-taxi");
    document.body.classList.add(`mode-${mode}`);

    // Aggiorna bottoni attivi
    document.querySelectorAll(".btn-mode-card").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    document.querySelectorAll(".drawer-mode-chip").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });

    // Aggiorna label e branding
    const activeLabel = document.getElementById("activeModeLabel");
    if (activeLabel) activeLabel.textContent = modeData.name;

    const brandTitle = document.getElementById("headerBrandTitle");
    if (brandTitle) brandTitle.innerHTML = modeData.brandTitle;

    const mobileBrand = document.getElementById("mobileDrawerBrandTitle");
    if (mobileBrand) mobileBrand.innerHTML = modeData.brandTitle;

    const brandSubtitle = document.getElementById("headerBrandSubtitle");
    if (brandSubtitle) brandSubtitle.textContent = modeData.subtitle;

    const brandIcon = document.getElementById("headerBrandIcon");
    if (brandIcon) {
      brandIcon.innerHTML = `<i class="fa-solid ${modeData.icon}"></i>`;
    }
  }

  populateLocationSelectors() {
    this.populateRegionSelector();
    this.populateCitySelector();
    this.populateStopSelector();
  }

  populateRegionSelector() {
    const select = document.getElementById("regionSelect");
    if (!select || !window.TRANSIT_DATA || !window.TRANSIT_DATA.regions) return;
    
    select.innerHTML = "";
    window.TRANSIT_DATA.regions.forEach(region => {
      const opt = document.createElement("option");
      opt.value = region.id;
      opt.textContent = region.name;
      if (region.id === this.currentRegion) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    if (!select.value && select.options.length > 0) {
      this.currentRegion = select.options[0].value;
      select.selectedIndex = 0;
    }
  }

  populateCitySelector() {
    const select = document.getElementById("citySelect");
    if (!select) return;
    
    select.innerHTML = "";
    const totalCities = typeof getCitiesByRegion === "function" ? getCitiesByRegion(this.currentRegion) : [];
    
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "all";
    defaultOpt.textContent = `📍 Tutte le Località (${totalCities.length})`;
    select.appendChild(defaultOpt);

    const cat = typeof getCategorizedLocalities === "function" ? getCategorizedLocalities(this.currentRegion) : { cities: totalCities, towns: [], frazioni: [] };

    if (cat.cities && cat.cities.length > 0) {
      const gCity = document.createElement("optgroup");
      gCity.label = "🏙️ Grandi Città & Capoluoghi";
      cat.cities.forEach(city => {
        const opt = document.createElement("option");
        opt.value = city;
        opt.textContent = `🏙️ ${city}`;
        if (city === this.currentCity) opt.selected = true;
        gCity.appendChild(opt);
      });
      select.appendChild(gCity);
    }

    if (cat.towns && cat.towns.length > 0) {
      const gTown = document.createElement("optgroup");
      gTown.label = "🏘️ Paesi & Comuni";
      cat.towns.forEach(town => {
        const opt = document.createElement("option");
        opt.value = town;
        opt.textContent = `🏡 ${town}`;
        if (town === this.currentCity) opt.selected = true;
        gTown.appendChild(opt);
      });
      select.appendChild(gTown);
    }

    if (cat.frazioni && cat.frazioni.length > 0) {
      const gFraz = document.createElement("optgroup");
      gFraz.label = "🌿 Frazioni & Borgate";
      cat.frazioni.forEach(fraz => {
        const opt = document.createElement("option");
        opt.value = fraz;
        opt.textContent = `🌿 ${fraz}`;
        if (fraz === this.currentCity) opt.selected = true;
        gFraz.appendChild(opt);
      });
      select.appendChild(gFraz);
    }
  }

  populateStopSelector() {
    const select = document.getElementById("hubStopSelect");
    if (!select) return;

    select.innerHTML = "";
    const stops = typeof getStopsByCity === "function" ? getStopsByCity(this.currentRegion, this.currentCity) : [];
    if (!stops || stops.length === 0) {
      select.innerHTML = `<option value="">Nessuna fermata disponibile</option>`;
      return;
    }

    // Raggruppa per area
    const areas = {};
    stops.forEach(s => {
      if (!areas[s.area]) areas[s.area] = [];
      areas[s.area].push(s);
    });

    Object.entries(areas).forEach(([area, areaStops]) => {
      const group = document.createElement("optgroup");
      const sample = areaStops[0];
      const icon = sample.localityType === 'city' ? '🏙️' : (sample.localityType === 'frazione' ? '🌿' : '🏡');
      group.label = `${icon} ${area}`;
      
      areaStops.forEach(stop => {
        const opt = document.createElement("option");
        opt.value = stop.id;
        opt.textContent = `${stop.name} [${stop.address}]`;
        if (stop.id === this.currentStopId) {
          opt.selected = true;
        }
        group.appendChild(opt);
      });
      select.appendChild(group);
    });

    if (!stops.some(s => s.id === this.currentStopId)) {
      this.currentStopId = stops[0].id;
      select.value = this.currentStopId;
    }
  }

  bindLocationSelectors() {
    const regionSelect = document.getElementById("regionSelect");
    const citySelect = document.getElementById("citySelect");
    const stopSelect = document.getElementById("hubStopSelect");

    if (regionSelect) {
      regionSelect.addEventListener("change", (e) => {
        this.currentRegion = (e && e.target) ? e.target.value : regionSelect.value;
        this.currentCity = "all";
        this.currentStopId = typeof getMainHubForRegion === "function" ? (getMainHubForRegion(this.currentRegion)?.id || "") : "";
        
        safeStorageSet("italiabus_region", this.currentRegion);
        safeStorageSet("italiabus_city", this.currentCity);
        safeStorageSet("italiabus_stop", this.currentStopId);
        
        this.populateCitySelector();
        this.populateStopSelector();
        this.notifyLocationChange();
      });
    }

    if (citySelect) {
      citySelect.addEventListener("change", (e) => {
        this.currentCity = (e && e.target) ? e.target.value : citySelect.value;
        safeStorageSet("italiabus_city", this.currentCity);
        this.populateStopSelector();
        this.currentStopId = stopSelect ? stopSelect.value : "";
        safeStorageSet("italiabus_stop", this.currentStopId);
        this.notifyLocationChange();
      });
    }

    if (stopSelect) {
      stopSelect.addEventListener("change", (e) => {
        this.currentStopId = (e && e.target) ? e.target.value : stopSelect.value;
        safeStorageSet("italiabus_stop", this.currentStopId);
        this.notifyLocationChange();
      });
    }
  }

  notifyLocationChange() {
    document.dispatchEvent(new CustomEvent('regionChanged', {
      detail: {
        regionId: this.currentRegion,
        city: this.currentCity,
        stopId: this.currentStopId
      }
    }));
  }

  // Gestione tema Dark / Light
  applyTheme(theme) {
    this.theme = theme;
    if (document.documentElement && typeof document.documentElement.setAttribute === 'function') {
      document.documentElement.setAttribute("data-theme", theme);
    }
    safeStorageSet("italiabus_theme", theme);

    const themeToggleBtn = document.getElementById("themeToggleBtn");
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = theme === "dark" 
        ? `<i class="fa-solid fa-sun"></i> <span>Tema Chiaro</span>`
        : `<i class="fa-solid fa-moon"></i> <span>Tema Scuro</span>`;
    }
  }

  bindThemeToggle() {
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const nextTheme = this.theme === "light" ? "dark" : "light";
        this.applyTheme(nextTheme);
      });
    }
  }

  // Navigazione tra le sezioni
  switchTab(tabId) {
    this.currentTab = tabId;

    document.querySelectorAll(".nav-link, .mobile-nav-item").forEach(link => {
      link.classList.toggle("active", link.dataset.tab === tabId);
    });

    document.querySelectorAll(".app-section").forEach(sec => {
      sec.classList.toggle("active", sec.id === `section-${tabId}`);
    });

    if (tabId === "map" && window.transitMap && window.transitMap.map) {
      setTimeout(() => {
        window.transitMap.map.invalidateSize();
      }, 200);
    }

    const mobileDrawer = document.getElementById("mobileDrawer");
    if (mobileDrawer) mobileDrawer.classList.remove("open");
  }

  bindNavLinks() {
    document.querySelectorAll("[data-tab]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = el.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });
  }

  bindMobileMenu() {
    const toggleBtn = document.getElementById("mobileMenuToggle");
    const drawer = document.getElementById("mobileDrawer");
    const closeBtn = document.getElementById("closeMobileDrawer");

    if (toggleBtn && drawer) {
      toggleBtn.addEventListener("click", () => {
        drawer.classList.add("open");
      });
    }

    if (closeBtn && drawer) {
      closeBtn.addEventListener("click", () => {
        drawer.classList.remove("open");
      });
    }
  }

  // Rendering del Parco Mezzi & Flotta
  renderFleetSection() {
    const container = document.getElementById("fleetCardsGrid");
    if (!container) return;

    const modeData = typeof getActiveMode === "function" ? getActiveMode() : (window.TRANSIT_DATA?.modes?.pullman || {});
    const fleetList = modeData.fleet || window.TRANSIT_DATA.fleet || [];

    let html = "";
    fleetList.forEach(item => {
      html += `
        <div class="fleet-card">
          <div class="fleet-card-badge">${item.imageBadge || modeData.name || 'Moderno'}</div>
          <div class="fleet-card-head">
            <h3>${item.model || item.name}</h3>
            <span class="fleet-category-tag">${item.carrier || item.category || item.type}</span>
          </div>

          <div class="fleet-specs-table">
            <div class="spec-row">
              <span class="spec-lbl"><i class="fa-solid fa-users"></i> Capienza:</span>
              <strong class="spec-val">${item.seats || item.capacity}</strong>
            </div>
            <div class="spec-row">
              <span class="spec-lbl"><i class="fa-solid fa-ruler-horizontal"></i> Tipologia / Lunghezza:</span>
              <strong class="spec-val">${item.length || item.type || 'Standard'}</strong>
            </div>
            <div class="spec-row">
              <span class="spec-lbl"><i class="fa-solid fa-gas-pump"></i> Propulsione:</span>
              <strong class="spec-val">${item.engine || item.emission || 'Euro 6D'}</strong>
            </div>
            <div class="spec-row">
              <span class="spec-lbl"><i class="fa-solid fa-leaf"></i> Sostenibilità:</span>
              <strong class="spec-val text-success">${item.co2Reduction || 'Alta Efficienza Green'}</strong>
            </div>
          </div>

          <div class="fleet-features-box">
            <h4>Dotazioni e Comfort:</h4>
            <ul>
              ${(item.comfort || item.features || []).map(f => `<li><i class="fa-solid fa-circle-check text-primary"></i> ${f}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // Rendering Sezione Tariffe Ufficiali
  renderTariffsSection() {
    const container = document.getElementById("tariffsCardsGrid");
    if (!container) return;

    const modeData = typeof getActiveMode === "function" ? getActiveMode() : (window.TRANSIT_DATA?.modes?.pullman || {});
    const tariffList = modeData.tariffs || window.TRANSIT_DATA.tariffs || [];

    let html = "";
    tariffList.forEach(tar => {
      const priceStr = typeof tar.price === 'number' ? `€${tar.price.toFixed(2)}` : (tar.price || '€1.50');
      html += `
        <div class="tariff-card">
          <div class="tariff-badge">${tar.validity || modeData.name}</div>
          <h3 class="tariff-title">${tar.name || tar.type}</h3>
          <div class="tariff-price-box">
            <span class="tariff-price">${priceStr}</span>
          </div>
          <p class="tariff-desc">${tar.description || tar.desc}</p>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // Banner Avvisi Notifiche
  renderAlertsBanner() {
    const banner = document.getElementById("serviceAlertsTicker");
    if (!banner || !window.TRANSIT_DATA) return;

    const allAlerts = window.TRANSIT_DATA.alerts || window.TRANSIT_DATA.serviceAlerts || [];
    const activeAlerts = allAlerts.filter(a => a.active !== false);

    if (activeAlerts.length === 0) {
      banner.style.display = "none";
      return;
    }

    const first = activeAlerts[0];
    banner.innerHTML = `
      <div class="ticker-content">
        <span class="ticker-tag"><i class="fa-solid fa-bullhorn"></i> INFO VIABILITÀ:</span>
        <span class="ticker-text"><strong>${first.title}</strong> &mdash; ${first.text}</span>
      </div>
      <button class="btn-ticker-details" onclick="window.app.switchTab('alerts')">Dettagli Avvisi</button>
    `;
  }
}

// Inizializzazione sicura per qualsiasi stato del DOM (completo, interattivo o in caricamento)
function initAppController() {
  if (!window.app) {
    window.app = new AppController();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppController);
} else {
  initAppController();
}
