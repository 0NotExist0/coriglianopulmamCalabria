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
      const preloader = document.getElementById("initialPreloader");
      const initialMode = this.currentMode || "pullman";
      if (preloader) {
        preloader.setAttribute("data-mode", initialMode);
        const pGif = preloader.querySelector(".mode-loader-gif");
        const MODE_FILTERS = {
          pullman: "hue-rotate(75deg) saturate(1.4) brightness(1.05) drop-shadow(0 8px 24px rgba(2, 132, 199, 0.45))",
          train: "hue-rotate(230deg) saturate(2.2) brightness(1.05) drop-shadow(0 8px 24px rgba(220, 38, 38, 0.5))",
          tram: "hue-rotate(0deg) saturate(0.55) brightness(1.05) opacity(0.88) drop-shadow(0 8px 24px rgba(16, 185, 129, 0.35))",
          taxi: "hue-rotate(-88deg) saturate(1.8) brightness(1.15) drop-shadow(0 8px 24px rgba(245, 158, 11, 0.5))",
          flight: "hue-rotate(60deg) saturate(1.45) brightness(1.1) drop-shadow(0 8px 24px rgba(14, 165, 233, 0.45))"
        };
        if (pGif && MODE_FILTERS[initialMode]) pGif.style.filter = MODE_FILTERS[initialMode];
      }
      this.bindModeSwitcher();
      this.applyTransportMode(this.currentMode);
      this.populateLocationSelectors();
      this.bindLocationSelectors();
      this.bindNavLinks();
      this.bindThemeToggle();
      this.bindMobileMenu();
      this.bindGlobalClickFeedback();
      this.applyTheme(this.theme);
      this.initHeroBanner();
      this.renderFleetSection();
      this.renderTariffsSection();
      this.renderAlertsBanner();
      this.notifyLocationChange();
      this.dismissInitialPreloader();
    } catch (err) {
      console.error("AppController init error:", err);
      this.dismissInitialPreloader();
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

    // Click sui pill nella barra mobile rapida (1-tap switch)
    document.querySelectorAll(".mobile-mode-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        if (mode) {
          this.switchTransportMode(mode);
        }
      });
    });
  }

  showModeSwitchLoader(mode) {
    const loader = document.getElementById("modeSwitchLoader");
    const currentMode = mode || this.currentMode || (typeof getActiveMode === "function" ? getActiveMode() : "pullman");
    const modeData = window.TRANSIT_DATA?.modes?.[currentMode] || { name: "Trasporto", icon: "fa-bus" };
    const titleEl = document.getElementById("modeLoaderTitle");
    const subEl = document.getElementById("modeLoaderSub");
    const gifEl = document.getElementById("modeLoaderGif");
    const progressEl = document.getElementById("modeLoaderProgressBar");

    const MODE_FILTERS = {
      pullman: "hue-rotate(75deg) saturate(1.4) brightness(1.05) drop-shadow(0 8px 24px rgba(2, 132, 199, 0.45))",
      train: "hue-rotate(230deg) saturate(2.2) brightness(1.05) drop-shadow(0 8px 24px rgba(220, 38, 38, 0.5))",
      tram: "hue-rotate(0deg) saturate(0.55) brightness(1.05) opacity(0.88) drop-shadow(0 8px 24px rgba(16, 185, 129, 0.35))",
      taxi: "hue-rotate(-88deg) saturate(1.8) brightness(1.15) drop-shadow(0 8px 24px rgba(245, 158, 11, 0.5))",
      flight: "hue-rotate(60deg) saturate(1.45) brightness(1.1) drop-shadow(0 8px 24px rgba(14, 165, 233, 0.45))"
    };

    const MODE_GRADIENTS = {
      pullman: "linear-gradient(90deg, #0284c7, #38bdf8)",
      train: "linear-gradient(90deg, #dc2626, #ef4444)",
      tram: "linear-gradient(90deg, #10b981, #6ee7b7)",
      taxi: "linear-gradient(90deg, #f59e0b, #fbbf24)",
      flight: "linear-gradient(90deg, #0284c7, #38bdf8)"
    };

    if (loader) {
      loader.setAttribute("data-mode", currentMode);
    }
    if (gifEl && MODE_FILTERS[currentMode]) {
      gifEl.style.filter = MODE_FILTERS[currentMode];
    }
    if (progressEl && MODE_GRADIENTS[currentMode]) {
      progressEl.style.background = MODE_GRADIENTS[currentMode];
    }
    if (titleEl) titleEl.textContent = `Caricamento Rete ${modeData.name}...`;

    const MODE_DESCRIPTIONS = {
      pullman: "Sincronizzazione orari pullman, autostazioni e telemetria satellitare",
      train: "Caricamento orari ferroviari, linee Alta Velocità, regionali e binari",
      tram: "Sincronizzazione frequenze tramviarie urbane e fermate cittadine",
      taxi: "Connessione con posteggi taxi, centralini radio e tariffe chilometriche",
      flight: "Tracking radar rotte aeree, aeroporti, terminal e varchi d'imbarco"
    };

    if (subEl) subEl.textContent = MODE_DESCRIPTIONS[currentMode] || "Aggiornamento orari e telemetria in tempo reale...";

    if (loader) {
      loader.classList.add("active");
    }
  }

  showAppLoading(title = "Caricamento in corso...", sub = "Elaborazione dati e sincronizzazione in tempo reale...") {
    this.showModeSwitchLoader(this.currentMode);
    const titleEl = document.getElementById("modeLoaderTitle");
    const subEl = document.getElementById("modeLoaderSub");
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = sub;
  }

  hideModeSwitchLoader() {
    const loader = document.getElementById("modeSwitchLoader");
    if (loader) {
      loader.classList.remove("active");
    }
  }

  hideAppLoading() {
    this.hideModeSwitchLoader();
  }

  async withAppLoader(title, sub, fn, minDuration = 180) {
    this.showAppLoading(title, sub);
    const start = Date.now();
    try {
      // Attesa microtask per consentire al browser di renderizzare il loader PRIMA del lavoro CPU/DOM
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 25)));
      if (typeof fn === 'function') {
        await fn();
      }
    } catch (err) {
      console.error("withAppLoader execution error:", err);
    } finally {
      const elapsed = Date.now() - start;
      const remain = Math.max(0, minDuration - elapsed);
      setTimeout(() => {
        this.hideAppLoading();
      }, remain);
    }
  }

  switchTransportMode(mode) {
    if (!mode || !window.TRANSIT_DATA || !window.TRANSIT_DATA.modes[mode]) return;
    if (this.currentMode === mode) {
      const dock = document.getElementById("modeSidebarDock");
      const overlay = document.getElementById("modeSidebarOverlay");
      if (dock) dock.classList.remove("open");
      if (overlay) overlay.classList.remove("active");
      return;
    }

    // 1. Chiudi subito dock/overlay per reattività immediata
    const dock = document.getElementById("modeSidebarDock");
    const overlay = document.getElementById("modeSidebarOverlay");
    if (dock) dock.classList.remove("open");
    if (overlay) overlay.classList.remove("active");

    // 2. Imposta ISTANTANEAMENTE le classi body per il colore corretto prima del caricamento
    document.body.classList.remove("mode-pullman", "mode-train", "mode-tram", "mode-taxi", "mode-flight");
    document.body.classList.add(`mode-${mode}`);

    // 3. Mostra animazione di caricamento con il colore già applicato a 0ms
    this.showModeSwitchLoader(mode);

    // 4. Esegui il cambio stato asincronamente per garantire la massima fluidità a 60fps
    setTimeout(() => {
      this.currentMode = mode;
      safeStorageSet("italiabus_transport_mode", mode);
      window.TRANSIT_DATA.activeMode = mode;
      this.applyTransportMode(mode);

      // Reimposta stop di riferimento per la modalità
      const modeData = window.TRANSIT_DATA.modes[mode];
      const modeStops = (modeData.stops && modeData.stops.length > 0) ? modeData.stops : [];
      const regionalStop = modeStops.find(s => s.region === this.currentRegion);
      const hub = regionalStop || modeStops[0];
      if (hub) {
        this.currentStopId = hub.id;
        this.currentCity = "all";
        if (!regionalStop && hub.region) {
          this.currentRegion = hub.region;
          safeStorageSet("italiabus_region", this.currentRegion);
        }
        safeStorageSet("italiabus_city", "all");
        safeStorageSet("italiabus_stop", this.currentStopId);
      }

      this.populateLocationSelectors();
      this.renderFleetSection();
      this.renderTariffsSection();

      // Notifica tutti i componenti dello switch modalità
      document.dispatchEvent(new CustomEvent("transportModeChanged", {
        detail: { mode: mode, modeData: modeData, stopId: this.currentStopId, regionId: this.currentRegion }
      }));
      this.notifyLocationChange();

      // 4. Concludi l'animazione di caricamento in modo morbido
      setTimeout(() => {
        this.hideModeSwitchLoader();
      }, 260);
    }, 120);
  }

  applyTransportMode(mode) {
    const modeData = window.TRANSIT_DATA.modes[mode] || window.TRANSIT_DATA.modes.pullman;

    // Aggiorna classi del body
    document.body.classList.remove("mode-pullman", "mode-train", "mode-tram", "mode-taxi", "mode-flight");
    document.body.classList.add(`mode-${mode}`);

    // Aggiorna bottoni attivi
    document.querySelectorAll(".btn-mode-card").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    document.querySelectorAll(".drawer-mode-chip").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    document.querySelectorAll(".mobile-mode-pill").forEach(b => {
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

    // Adatta testi di tutte le schede (Live Board, Cerca, Mappa, Flotta, Tariffe, Scioperi)
    const MODE_TEXTS = {
      pullman: {
        navLive: '<i class="fa-solid fa-clock"></i> Tabellone Live',
        navSearch: '<i class="fa-solid fa-magnifying-glass-location"></i> Cerca & Prenota',
        navMap: '<i class="fa-solid fa-map-location-dot"></i> Mappa Live GPS',
        navFleet: '<i class="fa-solid fa-truck-front"></i> Flotta Mezzi',
        navTariffs: '<i class="fa-solid fa-tags"></i> Tariffe & Abbonamenti',
        navStrikes: '<i class="fa-solid fa-triangle-exclamation"></i> Scioperi <span class="nav-badge-pill nav-badge-strike">LIVE</span>',
        stopLabel: '<i class="fa-solid fa-bus"></i> Fermata:',
        liveBoardHeading: 'Tabellone Partenze Pullman Live',
        liveBoardSub: 'Orari in tempo reale, banchine, ritardi e telemetria satellitare GPS',
        searchHeading: 'Cerca Tratte & Biglietteria Pullman',
        searchSub: 'Pianifica il tuo viaggio in autobus tra oltre 48.000 fermate in tutta Italia',
        searchBtn: '<i class="fa-solid fa-magnifying-glass"></i> Cerca Corse Pullman',
        gpsBtn: '<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia il Percorso alla Fermata',
        checkDeparturesBtn: '<i class="fa-solid fa-location-crosshairs"></i> Controlla Partenze dalla Mia Posizione'
      },
      flight: {
        navLive: '<i class="fa-solid fa-plane-departure"></i> Tabellone Voli Live',
        navSearch: '<i class="fa-solid fa-ticket"></i> Cerca & Prenota Voli',
        navMap: '<i class="fa-solid fa-map-location-dot"></i> Radar Aeroporti GPS',
        navFleet: '<i class="fa-solid fa-plane-up"></i> Flotta Aeromobili',
        navTariffs: '<i class="fa-solid fa-tags"></i> Tariffe & Bagagli',
        navStrikes: '<i class="fa-solid fa-triangle-exclamation"></i> Scioperi Voli <span class="nav-badge-pill nav-badge-strike">LIVE</span>',
        stopLabel: '<i class="fa-solid fa-plane-departure"></i> Aeroporto / Hub:',
        liveBoardHeading: 'Tabellone Partenze & Arrivi Voli Live (ENAC / IATA)',
        liveBoardSub: 'Voli in tempo reale, Gate di imbarco, Terminal, stato decolli/atterraggi e tracking radar',
        searchHeading: 'Cerca Voli Nazionali & Internazionali',
        searchSub: 'Confronta rotte aeree, orari, compagnie di linea e low-cost su tutti gli aeroporti italiani',
        searchBtn: '<i class="fa-solid fa-plane"></i> Cerca & Compara Voli',
        gpsBtn: '<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia Percorso all\'Aeroporto',
        checkDeparturesBtn: '<i class="fa-solid fa-location-crosshairs"></i> Controlla Voli dall\'Aeroporto Più Vicino'
      },
      train: {
        navLive: '<i class="fa-solid fa-clock"></i> Tabellone Stazione FS',
        navSearch: '<i class="fa-solid fa-ticket"></i> Biglietteria Treni FS',
        navMap: '<i class="fa-solid fa-map-location-dot"></i> Mappa Ferroviaria GPS',
        navFleet: '<i class="fa-solid fa-train-subway"></i> Materiale Rotabile FS',
        navTariffs: '<i class="fa-solid fa-tags"></i> Tariffe FS & Frecce',
        navStrikes: '<i class="fa-solid fa-triangle-exclamation"></i> Scioperi FS <span class="nav-badge-pill nav-badge-strike">LIVE</span>',
        stopLabel: '<i class="fa-solid fa-train"></i> Stazione FS:',
        liveBoardHeading: 'Tabellone Stazione Ferroviaria Live (RFI / ViaggiaTreno)',
        liveBoardSub: 'Partenze in tempo reale, binari effettivi, ritardi satellitari e composizione treni',
        searchHeading: 'Cerca Treni, Orari & Biglietteria Nazionale FS',
        searchSub: 'Pianifica collegamenti Alta Velocità, Intercity e Regionali in tutta Italia',
        searchBtn: '<i class="fa-solid fa-ticket"></i> Cerca Treni & Orari FS',
        gpsBtn: '<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia Percorso alla Stazione',
        checkDeparturesBtn: '<i class="fa-solid fa-location-crosshairs"></i> Controlla Treni dalla Mia Posizione'
      },
      tram: {
        navLive: '<i class="fa-solid fa-clock"></i> Tabellone Rete Tram',
        navSearch: '<i class="fa-solid fa-route"></i> Linee Tram Urbane',
        navMap: '<i class="fa-solid fa-map-location-dot"></i> Mappa Rete Tram',
        navFleet: '<i class="fa-solid fa-train-tram"></i> Parco Vetture Tram',
        navTariffs: '<i class="fa-solid fa-tags"></i> Tariffe Rete Tram',
        navStrikes: '<i class="fa-solid fa-triangle-exclamation"></i> Scioperi Metro/Tram <span class="nav-badge-pill nav-badge-strike">LIVE</span>',
        stopLabel: '<i class="fa-solid fa-train-tram"></i> Fermata Tram:',
        liveBoardHeading: 'Tabellone Live Fermate Rete Tram',
        liveBoardSub: 'Passaggi in tempo reale alle banchine e frequenze tranviarie',
        searchHeading: 'Pianifica Spostamenti su Rete Tramviaria',
        searchSub: 'Trova le linee tram urbane, coincidenze e passaggi in tempo reale',
        searchBtn: '<i class="fa-solid fa-route"></i> Trova Linee Tram',
        gpsBtn: '<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia Fermata Tram',
        checkDeparturesBtn: '<i class="fa-solid fa-location-crosshairs"></i> Controlla Tram dalla Mia Posizione'
      },
      taxi: {
        navLive: '<i class="fa-solid fa-clock"></i> Posteggi Taxi Live',
        navSearch: '<i class="fa-solid fa-phone"></i> Chiama / Prenota Taxi',
        navMap: '<i class="fa-solid fa-map-location-dot"></i> Mappa Posteggi Taxi',
        navFleet: '<i class="fa-solid fa-car"></i> Parco Auto Taxi',
        navTariffs: '<i class="fa-solid fa-calculator"></i> Tariffe Tassametro Taxi',
        navStrikes: '<i class="fa-solid fa-triangle-exclamation"></i> Fermo Taxi <span class="nav-badge-pill nav-badge-strike">LIVE</span>',
        stopLabel: '<i class="fa-solid fa-taxi"></i> Posteggio Taxi:',
        liveBoardHeading: 'Posteggi Taxi Live & Vetture in Attesa H24',
        liveBoardSub: 'Stalli taxi con colonnina di chiamata, vetture disponibili e tariffe precalcolate',
        searchHeading: 'Calcola Preventivo Corsa & Prenota Taxi',
        searchSub: 'Stima del costo a tassametro, tariffe fisse aeroportuali e chiamata radiotaxi immediata',
        searchBtn: '<i class="fa-solid fa-calculator"></i> Calcola Tariffa Taxi & Chiama',
        gpsBtn: '<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Trova Posteggio Taxi Più Vicino',
        checkDeparturesBtn: '<i class="fa-solid fa-location-crosshairs"></i> Trova Taxi Più Vicino a Me'
      }
    };

    const t = MODE_TEXTS[mode] || MODE_TEXTS.pullman;

    // Aggiorna Desktop Nav Links
    const linkLive = document.querySelector('.desktop-nav [data-tab="live-board"]');
    if (linkLive) linkLive.innerHTML = t.navLive;

    const linkSearch = document.querySelector('.desktop-nav [data-tab="search"]');
    if (linkSearch) linkSearch.innerHTML = t.navSearch;

    const linkMap = document.querySelector('.desktop-nav [data-tab="map"]');
    if (linkMap) linkMap.innerHTML = t.navMap;

    const linkFleet = document.querySelector('.desktop-nav [data-tab="fleet"]');
    if (linkFleet) linkFleet.innerHTML = t.navFleet;

    const linkTariffs = document.querySelector('.desktop-nav [data-tab="tariffs"]');
    if (linkTariffs) linkTariffs.innerHTML = t.navTariffs;

    const linkStrikes = document.querySelector('.desktop-nav [data-tab="strikes"]');
    if (linkStrikes && t.navStrikes) linkStrikes.innerHTML = t.navStrikes;

    // Aggiorna Mobile Drawer Links
    const mLive = document.querySelector('.drawer-nav [data-tab="live-board"]');
    if (mLive) mLive.innerHTML = t.navLive;

    const mSearch = document.querySelector('.drawer-nav [data-tab="search"]');
    if (mSearch) mSearch.innerHTML = t.navSearch;

    const mMap = document.querySelector('.drawer-nav [data-tab="map"]');
    if (mMap) mMap.innerHTML = t.navMap;

    const mFleet = document.querySelector('.drawer-nav [data-tab="fleet"]');
    if (mFleet) mFleet.innerHTML = t.navFleet;

    const mTariffs = document.querySelector('.drawer-nav [data-tab="tariffs"]');
    if (mTariffs) mTariffs.innerHTML = t.navTariffs;

    const mStrikes = document.querySelector('.drawer-nav [data-tab="strikes"]');
    if (mStrikes && t.navStrikes) mStrikes.innerHTML = t.navStrikes;

    // Aggiorna label selettore header
    const stopLabelEl = document.querySelector('label[for="hubStopSelect"]');
    if (stopLabelEl) stopLabelEl.innerHTML = t.stopLabel;

    // Aggiorna bottoni GPS
    const btnLocateRoute = document.getElementById("btnLocateRoute");
    if (btnLocateRoute) btnLocateRoute.innerHTML = t.gpsBtn;

    const btnCheckNearest = document.getElementById("btnCheckNearestDepartures");
    if (btnCheckNearest) btnCheckNearest.innerHTML = t.checkDeparturesBtn;
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

    const cat = typeof getCategorizedLocalities === "function" ? getCategorizedLocalities(this.currentRegion) : { capoluoghi: totalCities, towns: [], frazioni: [] };

    // 1. Capoluoghi di Provincia & Grandi Città
    const caps = cat.capoluoghi || cat.cities || [];
    if (caps && caps.length > 0) {
      const gCity = document.createElement("optgroup");
      gCity.label = "🏛️ Capoluoghi di Provincia & Grandi Città";
      caps.forEach(city => {
        const opt = document.createElement("option");
        opt.value = city;
        opt.textContent = `🏛️ ${city}`;
        if (city === this.currentCity) opt.selected = true;
        gCity.appendChild(opt);
      });
      select.appendChild(gCity);
    }

    // 2. Paesi & Comuni
    const towns = cat.towns || cat.borghi || [];
    if (towns && towns.length > 0) {
      const gTown = document.createElement("optgroup");
      gTown.label = "🏘️ Paesi & Comuni";
      towns.forEach(town => {
        const opt = document.createElement("option");
        opt.value = town;
        opt.textContent = `🏡 ${town}`;
        if (town === this.currentCity) opt.selected = true;
        gTown.appendChild(opt);
      });
      select.appendChild(gTown);
    }

    // 3. Frazioni & Borgate
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
        const val = (e && e.target) ? e.target.value : regionSelect.value;
        this.withAppLoader("Aggiornamento Rete Regionale...", "Sincronizzazione fermate e linee della regione...", () => {
          this.currentRegion = val;
          this.currentCity = "all";
          this.currentStopId = typeof getMainHubForRegion === "function" ? (getMainHubForRegion(this.currentRegion)?.id || "") : "";
          
          safeStorageSet("italiabus_region", this.currentRegion);
          safeStorageSet("italiabus_city", this.currentCity);
          safeStorageSet("italiabus_stop", this.currentStopId);
          
          this.populateCitySelector();
          this.populateStopSelector();
          this.notifyLocationChange();
        }, 160);
      });
    }

    if (citySelect) {
      citySelect.addEventListener("change", (e) => {
        const val = (e && e.target) ? e.target.value : citySelect.value;
        this.withAppLoader("Filtro Città & Frazioni...", "Caricamento delle fermate urbane e locali...", () => {
          this.currentCity = val;
          safeStorageSet("italiabus_city", this.currentCity);
          this.populateStopSelector();
          this.currentStopId = stopSelect ? stopSelect.value : "";
          safeStorageSet("italiabus_stop", this.currentStopId);
          this.notifyLocationChange();
        }, 140);
      });
    }

    if (stopSelect) {
      stopSelect.addEventListener("change", (e) => {
        const val = (e && e.target) ? e.target.value : stopSelect.value;
        this.withAppLoader("Sincronizzazione Fermata...", "Aggiornamento tabellone orari per questa fermata...", () => {
          this.currentStopId = val;
          safeStorageSet("italiabus_stop", this.currentStopId);
          this.notifyLocationChange();
        }, 140);
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

  // Gestione visibilità Hero Banner (Nascondi con X / Mostra)
  initHeroBanner() {
    const isHidden = safeStorageGet("italiabus_hero_hidden", "false") === "true";
    if (isHidden) {
      this.hideHeroBanner(false);
    }
  }

  hideHeroBanner(persist = true) {
    const hero = document.getElementById("mainHeroBanner");
    const restoreBtn = document.getElementById("btnRestoreHeroBanner");
    if (hero) {
      hero.classList.add("hero-hidden");
    }
    if (restoreBtn) {
      restoreBtn.style.display = "inline-flex";
    }
    if (persist) {
      safeStorageSet("italiabus_hero_hidden", "true");
    }
  }

  showHeroBanner() {
    const hero = document.getElementById("mainHeroBanner");
    const restoreBtn = document.getElementById("btnRestoreHeroBanner");
    if (hero) {
      hero.classList.remove("hero-hidden");
    }
    if (restoreBtn) {
      restoreBtn.style.display = "none";
    }
    safeStorageSet("italiabus_hero_hidden", "false");
  }

  // Chiusura fluida del preloader iniziale all'avvio dell'app
  dismissInitialPreloader() {
    const preloader = document.getElementById("initialPreloader");
    if (preloader) {
      setTimeout(() => {
        preloader.classList.add("fade-out");
        setTimeout(() => {
          if (preloader.parentNode) {
            preloader.parentNode.removeChild(preloader);
          }
        }, 500);
      }, 400);
    }
  }

  // Navigazione tra le sezioni con feedback e preloader asincrono
  switchTab(tabId) {
    if (this.currentTab === tabId && document.querySelector(`.app-section#section-${tabId}.active`)) {
      return;
    }

    const TAB_LABELS = {
      "live-board": { title: "Tabellone Orari in Tempo Reale", sub: "Sincronizzazione orari di arrivo e partenze live..." },
      "map": { title: "Mappa Satellitare GPS & Fermate", sub: "Inizializzazione tracciati, linee e fermate..." },
      "search": { title: "Pianificazione Itinerario di Viaggio", sub: "Calcolo percorsi, orari e coincidenze..." },
      "strikes": { title: "Calendario Scioperi & Aggiornamenti", sub: "Sincronizzazione dati Ministero delle Infrastrutture e dei Trasporti..." },
      "fleet": { title: "Parco Mezzi & Flotta", sub: "Caricamento allestimenti, tipologie e dotazioni di bordo..." },
      "tariffs": { title: "Tariffe & Titoli di Viaggio", sub: "Consultazione prezzi, abbonamenti e agevolazioni..." },
      "alerts": { title: "Avvisi di Servizio & Info Mobilità", sub: "Verifica circolazione, deviazioni e allerte..." }
    };

    const info = TAB_LABELS[tabId] || { title: "Caricamento Sezione...", sub: "Elaborazione contenuti in tempo reale..." };

    this.withAppLoader(info.title, info.sub, () => {
      this.currentTab = tabId;

      document.querySelectorAll(".nav-link, .mobile-nav-item, .mobile-nav-btn").forEach(link => {
        link.classList.toggle("active", link.dataset.tab === tabId);
      });

      document.querySelectorAll(".app-section").forEach(sec => {
        sec.classList.toggle("active", sec.id === `section-${tabId}`);
      });

      // Scroll fluido in alto al cambio scheda su mobile
      if (window.innerWidth <= 768) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      if (tabId === "map" && window.transitMap && window.transitMap.map) {
        if (window.transitMap.needsModeRefresh) {
          window.transitMap.needsModeRefresh = false;
          window.transitMap.refreshMapForMode(window.transitMap.lastModeDetail || {
            mode: this.currentMode,
            stopId: this.currentStopId,
            regionId: this.currentRegion
          });
        }
        setTimeout(() => {
          window.transitMap.map.invalidateSize();
        }, 60);
      }

      if (tabId === "strikes" && window.strikesEngine) {
        window.strikesEngine.renderStrikesList();
        window.strikesEngine.updateStatsBar();
      }

      const mobileDrawer = document.getElementById("mobileDrawer");
      if (mobileDrawer) mobileDrawer.classList.remove("open");
    }, 180);
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

  // Banner Avvisi Notifiche & Scioperi
  renderAlertsBanner() {
    const banner = document.getElementById("serviceAlertsTicker");
    if (!banner || !window.TRANSIT_DATA) return;

    const strikes = window.TRANSIT_DATA.strikes || [];
    const allAlerts = window.TRANSIT_DATA.alerts || window.TRANSIT_DATA.serviceAlerts || [];
    const activeAlerts = allAlerts.filter(a => a.active !== false);

    if (strikes.length > 0) {
      const nextStrike = strikes[0];
      banner.innerHTML = `
        <div class="ticker-content">
          <span class="ticker-tag" style="background:#dc2626; color:#fff;"><i class="fa-solid fa-triangle-exclamation"></i> AVVISO SCIOPERI:</span>
          <span class="ticker-text"><strong>${nextStrike.categoryLabel}</strong> &mdash; ${nextStrike.title} (${nextStrike.durationHours}h, Fasce Protette Garantite L. 146/90)</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="btn-ticker-details" onclick="window.app.switchTab('strikes')"><i class="fa-solid fa-calendar-xmark"></i> Calendario Scioperi</button>
        </div>
      `;
      banner.style.display = "block";
      return;
    }

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

  // Feedback istantaneo a 0ms su ogni click/tap prima del freeze o caricamento
  bindGlobalClickFeedback() {
    const handlePress = (e) => {
      const btn = e.target.closest("button, .btn, .nav-link, .mobile-nav-btn, .mobile-nav-item, .quick-tab-chip, .filter-chip, .dest-dropdown-item, .drawer-mode-chip, .btn-mode-card, .btn-action, .btn-theme-toggle, .live-board-mode-pill, [onclick], [role='button'], input[type='submit']");
      if (btn) {
        btn.classList.add("btn-pressed");
        setTimeout(() => btn.classList.remove("btn-pressed"), 180);
      }
    };

    document.addEventListener("mousedown", handlePress, { passive: true, capture: true });
    document.addEventListener("touchstart", handlePress, { passive: true, capture: true });
  }
}

// Inizializzazione sicura per qualsiasi stato del DOM (completo, interattivo o in caricamento)
function initAppController() {
  if (!window.app) {
    window.app = new AppController();
  }
  // Export globali universali per tutte le sezioni
  window.showAppLoading = (title, sub) => window.app.showAppLoading(title, sub);
  window.hideAppLoading = () => window.app.hideAppLoading();
  window.withAppLoader = (title, sub, fn, minTime) => window.app.withAppLoader(title, sub, fn, minTime);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppController);
} else {
  initAppController();
}

window.addEventListener('load', () => {
  const preloader = document.getElementById("initialPreloader");
  if (preloader && !preloader.classList.contains("fade-out")) {
    preloader.classList.add("fade-out");
    setTimeout(() => {
      if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
    }, 500);
  }
});
