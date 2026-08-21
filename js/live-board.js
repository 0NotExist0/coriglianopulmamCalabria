/**
 * ITALIABUS - LIVE DEPARTURE BOARD & TIMERS ENGINE
 * Gestore partenze in tempo reale con timer a scalare al secondo,
 * calcolo ritardi dinamici e filtri interattivi per le fermate.
 */

if (typeof safeStorageGet === "undefined") {
  window.safeStorageGet = function(key, fallback = null) {
    try {
      if (typeof localStorage !== "undefined") {
        const v = localStorage.getItem(key);
        return v !== null ? v : fallback;
      }
    } catch (e) {}
    return fallback;
  };
}

if (typeof safeStorageSet === "undefined") {
  window.safeStorageSet = function(key, val) {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, val);
      }
    } catch (e) {}
  };
}

class LiveBoardEngine {
  constructor() {
    this.container = document.getElementById("liveBoardList");
    this.clockEl = document.getElementById("liveSystemClock");
    this.filterHubSelect = document.getElementById("boardStopFilter");
    this.filterCategoryTabs = document.querySelectorAll(".board-tab-btn");
    this.searchInput = document.getElementById("boardSearchInput");
    
    this.activeCategory = "all";
    
    const currentRegion = typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria";
    this.activeStopId = typeof getMainHubForRegion === 'function' ? (getMainHubForRegion(currentRegion)?.id || '') : '';
    this.searchQuery = "";
    this.audioEnabled = false;

    this.departures = [];
    this.init();
  }

  init() {
    this.populateStopSelect();
    this.generateInitialDepartures();
    this.bindEvents();
    
    // Timer principale al secondo per aggiornare l'orologio e i countdown
    this.timerInterval = setInterval(() => {
      this.updateClock();
      this.tickCountdowns();
    }, 1000);

    // Refresh periodico per generare nuove corse quando quelle vecchie partono
    this.refreshInterval = setInterval(() => {
      this.refreshDepartures();
    }, 30000);

    document.addEventListener('regionChanged', (e) => {
      const regionId = e.detail?.regionId || (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
      const stopId = e.detail?.stopId;
      this.activeStopId = stopId || (typeof getMainHubForRegion === 'function' ? (getMainHubForRegion(regionId)?.id || '') : '');
      this.populateStopSelect();
      this.generateInitialDepartures();
      this.render();
    });

    document.addEventListener('transportModeChanged', (e) => {
      const currentRegion = typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria";
      this.activeStopId = typeof getMainHubForRegion === 'function' ? (getMainHubForRegion(currentRegion)?.id || '') : '';
      this.populateStopSelect();
      this.generateInitialDepartures();
      this.render();
    });

    this.render();
  }

  populateStopSelect() {
    if (!this.filterHubSelect) return;
    this.filterHubSelect.innerHTML = "";

    const currentRegion = typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria";
    const regionStops = typeof getStopsByRegion === 'function' ? getStopsByRegion(currentRegion) : [];
    
    if (regionStops.length === 0) {
      this.filterHubSelect.innerHTML = `<option value="">Nessun nodo disponibile per questa regione</option>`;
      return;
    }

    const areas = {};
    regionStops.forEach(stop => {
      if (!areas[stop.area]) areas[stop.area] = [];
      areas[stop.area].push(stop);
    });

    Object.entries(areas).forEach(([area, stops]) => {
      const group = document.createElement("optgroup");
      group.label = `📍 ${area}`;
      stops.forEach(stop => {
        const opt = document.createElement("option");
        opt.value = stop.id;
        
        let label = stop.name;
        if (stop.isTemporary) {
          if (stop.temporaryStatus === 'active') {
            label = `🟠 [PROVV. ATTIVA] ${stop.name}`;
          } else {
            label = `⛔ [PROVV. CHIUSA/LAVORI] ${stop.name}`;
          }
        } else {
          label = `${stop.name} (${stop.platforms ? stop.platforms[0] : 'Punto Servizio'})`;
        }

        opt.textContent = label;
        if (stop.id === this.activeStopId) opt.selected = true;
        group.appendChild(opt);
      });
      this.filterHubSelect.appendChild(group);
    });
  }

  switchToStop(stopId) {
    this.activeStopId = stopId;
    if (this.filterHubSelect) {
      this.filterHubSelect.value = stopId;
    }
    this.generateInitialDepartures();
    this.render();
  }

  generateInitialDepartures() {
    const now = new Date();
    this.departures = [];

    const currentRegion = typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria";
    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const isTrain = currentMode === 'train';
    const lines = typeof getLinesByRegion === 'function' ? getLinesByRegion(currentRegion) : [];
    if (!lines || lines.length === 0) return;

    // Genera 14 corse realistiche a partire dall'orario corrente
    const offsets = [1, 3, 5, 8, 12, 16, 21, 26, 32, 39, 48, 58, 70, 85]; // Minuti dal tempo attuale

    offsets.forEach((minOffset, index) => {
      const line = lines[index % lines.length];
      const depDate = new Date(now.getTime() + minOffset * 60 * 1000 + (Math.floor(Math.random() * 40) * 1000));
      
      // Calcola ritardo simulato
      const delayMinutes = Math.random() > 0.7 ? Math.floor(Math.random() * 4) + 1 : 0;
      
      // Banchina o Binario
      const currentStop = (typeof getStopById === 'function' ? getStopById(this.activeStopId) : null) || 
                          ((typeof getStopsByRegion === 'function' ? getStopsByRegion(currentRegion)[0] : null) || { name: isTrain ? 'Stazione Centrale' : 'Hub Principale' });
      const platform = (currentStop.platforms && currentStop.platforms.length > 0)
        ? currentStop.platforms[index % currentStop.platforms.length]
        : (isTrain ? "Binario 1" : "Banchina 1");

      // Capienza simulata
      const occupancy = Math.floor(Math.random() * 45) + 30; // 30% - 75%

      // Destinazione principale della corsa
      const stopsList = line.stopsIds || line.stops || [];
      const destStopId = stopsList.length > 0 ? stopsList[stopsList.length - 1] : null;
      let destName = (destStopId && typeof getStopById === 'function' ? getStopById(destStopId)?.name : null);
      if (!destName || destName === "Capolinea") {
        if (line.name && line.name.includes(" - ")) {
          destName = line.name.split(" - ").pop().split(" (")[0];
        } else {
          destName = isTrain ? "Stazione Terminus" : "Capolinea Centrale";
        }
      }
      
      const vehicleId = isTrain ? `CONVOGLIO-FS-${1000 + (index * 6)}` : `BUS-${currentRegion.substring(0,3).toUpperCase()}-${100 + index}`;

      this.departures.push({
        id: `DEP_${Date.now()}_${index}`,
        lineId: line.id,
        lineCode: line.code || line.shortName || (isTrain ? `R-${index + 1}` : `L-${index + 1}`),
        lineName: line.name,
        lineColor: line.color || (isTrain ? "#dc2626" : "#0284c7"),
        lineType: line.type || (isTrain ? "regional" : "suburban"),
        destination: destName,
        viaInfo: line.fullName || line.name,
        scheduledTime: depDate,
        delayMinutes: delayMinutes,
        platform: platform,
        busModel: line.busModel || (isTrain ? "Treno Elettrico Pop ETR 104" : "Autobus Climatizzato Euro 6"),
        priceBase: (typeof line.priceBase === 'number' && !isNaN(line.priceBase)) ? line.priceBase : (isTrain ? 4.50 : 2.50),
        occupancy: occupancy,
        vehicleId: vehicleId,
        isAcquiring: false
      });
    });

    // Ordina per orario di partenza previsto
    this.departures.sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  refreshDepartures() {
    const now = new Date();
    // Rimuovi corse passate da oltre 2 minuti
    this.departures = this.departures.filter(d => {
      const diffSec = (d.scheduledTime.getTime() - now.getTime()) / 1000;
      return diffSec > -90; // Mantieni per 1.5 min dopo la partenza con stato "Partito"
    });

    const currentRegion = typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria";
    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const isTrain = currentMode === 'train';
    const lines = typeof getLinesByRegion === 'function' ? getLinesByRegion(currentRegion) : [];
    if (!lines || lines.length === 0) return;

    // Se ci sono meno di 10 corse, creane di nuove nel futuro
    while (this.departures.length < 12) {
      const lastDep = this.departures[this.departures.length - 1];
      const baseTime = lastDep ? lastDep.scheduledTime.getTime() : now.getTime();
      const minOffset = Math.floor(Math.random() * 8) + 6;
      const nextTime = new Date(baseTime + minOffset * 60 * 1000);
      
      const line = lines[Math.floor(Math.random() * lines.length)];
      const stopsArr = line.stopsIds || line.stops || [];
      const destStopId = stopsArr.length > 0 ? stopsArr[stopsArr.length - 1] : null;
      let destName = (destStopId && typeof getStopById === 'function' ? getStopById(destStopId)?.name : null);
      if (!destName || destName === "Capolinea") {
        if (line.name && line.name.includes(" - ")) {
          destName = line.name.split(" - ").pop().split(" (")[0];
        } else {
          destName = isTrain ? "Stazione Terminus" : "Capolinea Centrale";
        }
      }

      const currentStop = (typeof getStopById === 'function' ? getStopById(this.activeStopId) : null) || 
                          ((typeof getStopsByRegion === 'function' ? getStopsByRegion(currentRegion)[0] : null) || { name: isTrain ? 'Stazione Centrale' : 'Hub Principale' });
      const platform = (currentStop && currentStop.platforms && currentStop.platforms.length > 0)
        ? currentStop.platforms[Math.floor(Math.random() * currentStop.platforms.length)]
        : (isTrain ? "Binario 1" : "Banchina 1");
      const vehicleId = isTrain ? `CONVOGLIO-FS-${Math.floor(Math.random() * 800) + 1000}` : `BUS-${currentRegion.substring(0,3).toUpperCase()}-${Math.floor(Math.random() * 80) + 100}`;

      this.departures.push({
        id: `DEP_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        lineId: line.id,
        lineCode: line.code || line.shortName || (isTrain ? "R-FS" : "L-BUS"),
        lineName: line.name,
        lineColor: line.color || (isTrain ? "#dc2626" : "#0284c7"),
        lineType: line.type || (isTrain ? "regional" : "suburban"),
        destination: destName,
        viaInfo: line.fullName || line.name,
        scheduledTime: nextTime,
        delayMinutes: 0,
        platform: platform,
        busModel: line.busModel || (isTrain ? "Treno Elettrico Pop ETR 104" : "Autobus Climatizzato Euro 6"),
        priceBase: (typeof line.priceBase === 'number' && !isNaN(line.priceBase)) ? line.priceBase : (isTrain ? 4.50 : 2.50),
        occupancy: Math.floor(Math.random() * 50) + 20,
        vehicleId: vehicleId,
        isAcquiring: false
      });
    }

    this.departures.sort((a, b) => a.scheduledTime - b.scheduledTime);
    this.render();
  }

  updateClock() {
    if (!this.clockEl) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    this.clockEl.textContent = `${hours}:${minutes}:${seconds}`;
  }

  tickCountdowns() {
    const now = new Date();
    
    // Aggiorna gli elementi del DOM direttamente per massime prestazioni
    this.departures.forEach(dep => {
      const timerElement = document.getElementById(`timer_${dep.id}`);
      const statusBadge = document.getElementById(`badge_${dep.id}`);
      if (!timerElement) return;

      const diffSec = Math.floor((dep.scheduledTime.getTime() - now.getTime()) / 1000);

      if (diffSec <= -30) {
        timerElement.textContent = "PARTITO";
        timerElement.className = "timer-clock departed";
        if (statusBadge) {
          statusBadge.textContent = "Partito";
          statusBadge.className = "status-badge status-departed";
        }
      } else if (diffSec <= 0) {
        timerElement.textContent = "IN BANCHINA";
        timerElement.className = "timer-clock at-dock blink";
        if (statusBadge) {
          statusBadge.textContent = "In Banchina / Porte Aperte";
          statusBadge.className = "status-badge status-boarding";
        }
      } else if (diffSec < 60) {
        timerElement.textContent = `IN ARRIVO (${diffSec}s)`;
        timerElement.className = "timer-clock arriving blink";
        if (statusBadge) {
          statusBadge.textContent = "Imminente";
          statusBadge.className = "status-badge status-arriving";
        }
      } else {
        const m = Math.floor(diffSec / 60);
        const s = diffSec % 60;
        timerElement.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        timerElement.className = "timer-clock active";
        
        if (statusBadge) {
          if (dep.delayMinutes > 0) {
            statusBadge.textContent = `Ritardo +${dep.delayMinutes}'`;
            statusBadge.className = "status-badge status-delayed";
          } else {
            statusBadge.textContent = "In Orario";
            statusBadge.className = "status-badge status-ontime";
          }
        }
      }
    });
  }

  bindEvents() {
    // Cambio fermata
    if (this.filterHubSelect) {
      this.filterHubSelect.addEventListener("change", (e) => {
        this.activeStopId = e.target.value;
        this.generateInitialDepartures();
        this.render();
      });
    }

    // Filtro categorie tab
    this.filterCategoryTabs.forEach(btn => {
      btn.addEventListener("click", () => {
        this.filterCategoryTabs.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeCategory = btn.dataset.category || "all";
        this.render();
      });
    });

    // Ricerca testuale
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    // Bottone audio chime
    const soundToggleBtn = document.getElementById("toggleSoundBtn");
    if (soundToggleBtn) {
      soundToggleBtn.addEventListener("click", () => {
        this.audioEnabled = !this.audioEnabled;
        soundToggleBtn.classList.toggle("active", this.audioEnabled);
        soundToggleBtn.innerHTML = this.audioEnabled 
          ? `<i class="fa-solid fa-volume-high"></i> Audio Annunci Attivo` 
          : `<i class="fa-solid fa-volume-xmark"></i> Attiva Annunci Audio`;
        if (this.audioEnabled) this.playChime();
      });
    }

    // Bottone Controlla Partenze dalla Mia Posizione GPS
    const gpsCheckBtn = document.getElementById("btnCheckNearestDepartures");
    if (gpsCheckBtn) {
      gpsCheckBtn.addEventListener("click", () => this.checkNearestDepartures());
    }
  }

  checkNearestDepartures() {
    if (!navigator.geolocation) {
      alert("Geolocalizzazione non supportata dal tuo dispositivo o browser.");
      return;
    }

    const btn = document.getElementById("btnCheckNearestDepartures");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Individuo la fermata più vicina...`;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> Controlla Partenze dalla Mia Posizione`;
        }

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const allStops = typeof getStopsByRegion === 'function' ? getStopsByRegion('all') : [];
        if (!allStops || allStops.length === 0) {
          alert("Nessuna fermata trovata nel database.");
          return;
        }

        let bestStop = null;
        let minDistance = Infinity;

        for (let i = 0; i < allStops.length; i++) {
          const s = allStops[i];
          const dist = typeof calculateDistanceMeters === 'function' 
            ? calculateDistanceMeters(lat, lng, s.lat, s.lng) 
            : 999999;
          if (dist < minDistance) {
            minDistance = dist;
            bestStop = s;
          }
        }

        if (!bestStop) {
          alert("Impossibile individuare la fermata più vicina.");
          return;
        }

        // Se la fermata è in un'altra regione, sincronizza la regione
        const currentRegion = typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria";
        if (bestStop.region && bestStop.region !== currentRegion) {
          if (typeof safeStorageSet === 'function') safeStorageSet("italiabus_region", bestStop.region);
          const regSelect = document.getElementById("globalRegionSelect");
          if (regSelect) {
            regSelect.value = bestStop.region;
            regSelect.dispatchEvent(new Event("change"));
          }
        }

        this.activeStopId = bestStop.id;
        if (typeof safeStorageSet === 'function') safeStorageSet("italiabus_stop", bestStop.id);
        
        // Salva i dati GPS per il banner
        this.gpsNearestInfo = {
          stop: bestStop,
          distanceMeters: minDistance,
          walkTimeMin: Math.max(1, Math.round(minDistance / 80)),
          timestamp: new Date()
        };

        this.populateStopSelect();
        if (this.filterHubSelect) this.filterHubSelect.value = bestStop.id;
        
        const stopHeaderSelect = document.getElementById("hubStopSelect");
        if (stopHeaderSelect) stopHeaderSelect.value = bestStop.id;

        this.generateInitialDepartures();
        this.render();

        // Scroll liscio verso la lista partenze
        const targetEl = document.getElementById("liveBoardList");
        if (targetEl) targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      (err) => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> Controlla Partenze dalla Mia Posizione`;
        }
        let msg = "Impossibile ottenere la posizione GPS.";
        if (err.code === 1) msg = "Permesso di geolocalizzazione negato. Abilita il GPS nelle impostazioni del browser.";
        else if (err.code === 2) msg = "Posizione GPS non disponibile al momento.";
        else if (err.code === 3) msg = "Timeout nella ricezione del segnale GPS. Riprova all'aperto.";
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  }

  playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Suono bitonale stile annuncio stazione/aeroporto
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(880, now + 0.15); // A5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc1.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.6);
    } catch (e) {
      console.log("Audio not allowed yet by user interaction");
    }
  }

  getFilteredDepartures() {
    return this.departures.filter(dep => {
      // Filtro categoria
      if (this.activeCategory === "urban" && dep.lineType !== "urban") return false;
      if (this.activeCategory === "suburban" && dep.lineType !== "suburban") return false;
      if (this.activeCategory === "regional" && dep.lineType !== "regional") return false;
      if (this.activeCategory === "unical" && !dep.lineId.includes("UNI")) return false;
      if (this.activeCategory === "mare" && !dep.lineId.includes("MARE")) return false;

      // Filtro query
      if (this.searchQuery) {
        const matchName = dep.lineName.toLowerCase().includes(this.searchQuery);
        const matchDest = dep.destination.toLowerCase().includes(this.searchQuery);
        const matchCode = dep.lineCode.toLowerCase().includes(this.searchQuery);
        const matchVia = dep.viaInfo.toLowerCase().includes(this.searchQuery);
        if (!matchName && !matchDest && !matchCode && !matchVia) return false;
      }

      return true;
    });
  }

  render() {
    if (!this.container) return;
    const filtered = this.getFilteredDepartures();

    if (filtered.length === 0) {
      this.container.innerHTML = `
        <div class="empty-board-state">
          <i class="fa-solid fa-bus-simple fa-3x"></i>
          <h3>Nessuna partenza trovata</h3>
          <p>Nessun pullman corrisponde ai filtri selezionati per questa fermata.</p>
          <button class="btn btn-outline" onclick="window.liveBoard.resetFilters()">Reimposta Filtri</button>
        </div>
      `;
      return;
    }

    const currentStop = (typeof getStopById === 'function' ? getStopById(this.activeStopId) : null) || { 
      name: "Hub Principale", 
      address: "Centro Città",
      stopCode: "BUS-IT-100",
      gmapsUrl: "https://www.google.com/maps",
      streetViewUrl: "https://www.google.com/maps"
    };

    const isTemp = !!currentStop.isTemporary;
    const isTempActive = isTemp && currentStop.temporaryStatus === 'active';
    const isTempInactive = isTemp && currentStop.temporaryStatus !== 'active';
    const altData = isTemp ? (typeof window.getAlternativeActiveStop === 'function' ? window.getAlternativeActiveStop(currentStop.id) : null) : null;

    const activeRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const activeCity = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_city", "all") : "all");
    const userCity = (this.searchedTaxiCity) || ((activeCity && activeCity !== 'all') ? activeCity : (currentStop.area || "Tua Città"));
    const taxiDiscovery = (currentMode === 'taxi' && typeof window.findTaxiNearCityOrLocation === 'function') ? 
      window.findTaxiNearCityOrLocation(userCity, activeRegion, this.gpsNearestInfo?.userCoords) : null;

    let html = `
      ${currentMode === 'taxi' && taxiDiscovery ? `
        <!-- SEZIONE TAXI VICINO A TE (DISCOVERY LOCALE INTELLIGENTE) -->
        <div class="taxi-near-you-container">
          <div class="taxi-near-you-head">
            <div class="near-head-left">
              <div class="near-badge-pulse">
                <span class="live-dot pulse"></span>
                <span>TAXI VICINO A TE</span>
              </div>
              <h3 class="near-title"><i class="fa-solid fa-location-crosshairs text-warning"></i> Taxi e Radiotaxi a <strong>${taxiDiscovery.cityName}</strong></h3>
              <p class="near-subtitle">Rilevamento automatico posteggi, numeri telefonici diretti e ricerca live su Google Maps</p>
            </div>
            <div class="near-search-input-box">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" id="liveTaxiCityInput" placeholder="Cerca altra città (es. Cuorgnè, Ivrea, Corigliano...)" value="${this.searchedTaxiCity || ''}" onkeydown="if(event.key==='Enter') window.liveBoard.searchTaxiInCity(this.value)">
              <button type="button" class="btn-search-taxi-city" onclick="window.liveBoard.searchTaxiInCity(document.getElementById('liveTaxiCityInput').value)">
                Cerca
              </button>
              ${this.searchedTaxiCity ? `
                <button type="button" class="btn-search-taxi-city" style="background:#475569; color:#fff;" onclick="window.liveBoard.resetTaxiCitySearch()" title="Reimposta città">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              ` : ''}
            </div>
          </div>

          <div class="taxi-near-card-grid">
            <div class="taxi-near-main-card">
              <div class="main-card-top">
                <div class="taxi-icon-circle-lg">
                  <i class="fa-solid fa-taxi"></i>
                </div>
                <div>
                  <h4>${taxiDiscovery.primaryService.name}</h4>
                  <span class="coverage-badge"><i class="fa-solid fa-map-pin"></i> ${taxiDiscovery.primaryService.coverage}</span>
                </div>
              </div>
              <div class="main-card-actions">
                <a href="tel:${taxiDiscovery.primaryService.phone}" class="btn-call-taxi-lg">
                  <i class="fa-solid fa-phone-volume"></i> Chiama Taxi: ${taxiDiscovery.primaryService.phoneDisplay}
                </a>
                ${taxiDiscovery.primaryService.altPhone ? `
                  <a href="tel:${taxiDiscovery.primaryService.altPhone}" class="btn btn-outline-light btn-sm" style="font-weight:700;">
                    <i class="fa-solid fa-phone"></i> Linea 2
                  </a>
                ` : ''}
                <a href="https://wa.me/${(taxiDiscovery.primaryService.whatsapp || '+393471234567').replace(/\+/g, '')}?text=Salve,%20desidero%20richiedere%20un%20taxi%20a%20${encodeURIComponent(taxiDiscovery.cityName)}" target="_blank" class="btn-wa-taxi-lg">
                  <i class="fa-brands fa-whatsapp"></i> Invia Posizione WhatsApp
                </a>
                <a href="${taxiDiscovery.gmapsQueryUrl}" target="_blank" rel="noopener" class="btn-gmaps-taxi-search">
                  <i class="fa-brands fa-google"></i> Cerca Tutti i Taxi a ${taxiDiscovery.cityName} su Google Maps
                </a>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="board-header-summary ${isTemp ? 'board-header-temp' : ''}">
        <div class="board-station-title">
          <span class="station-icon ${isTemp ? (isTempActive ? 'station-temp-active' : 'station-temp-inactive') : ''}"><i class="fa-solid ${isTemp ? (isTempActive ? 'fa-triangle-exclamation' : 'fa-person-digging') : (currentMode === 'taxi' ? 'fa-taxi' : (currentMode === 'train' ? 'fa-train' : 'fa-location-dot'))}"></i></span>
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="${isTempInactive ? 'text-decoration: line-through;' : ''}">${currentStop.name}</strong>
              ${isTemp ? (isTempActive ? 
                '<span class="popup-badge-temp-active"><i class="fa-solid fa-triangle-exclamation"></i> Provvisoria ATTIVA</span>' : 
                '<span class="popup-badge-temp-inactive"><i class="fa-solid fa-ban"></i> Chiusa per Lavori</span>'
              ) : ''}
              <span class="popup-code-badge" style="font-size: 0.72rem;"><i class="fa-solid fa-barcode"></i> ${currentStop.stopCode || 'Palina Transit'}</span>
            </div>
            <span class="station-subtitle"><i class="fa-solid fa-map-pin"></i> ${currentStop.address || ''}</span>
          </div>
        </div>
        <div class="board-header-actions" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <a href="${currentStop.gmapsUrl || '#'}" target="_blank" rel="noopener" class="gmaps-tag-btn" style="padding: 6px 10px; font-size: 0.78rem;">
            <i class="fa-brands fa-google"></i> Vedi su Google Maps
          </a>
          <a href="${currentStop.streetViewUrl || '#'}" target="_blank" rel="noopener" class="gmaps-tag-btn" style="padding: 6px 10px; font-size: 0.78rem;">
            <i class="fa-solid fa-street-view"></i> Street View
          </a>
          <div class="board-live-pill">
            <span class="live-dot pulse"></span> ${currentMode === 'taxi' ? 'POSTEGGIO TAXI UFFICIALE H24' : (currentMode === 'train' ? 'VIAGGIATRENO LIVE RFI' : 'LIVE SATELLITARE GPS')}
          </div>
        </div>
      </div>

      ${currentMode === 'taxi' ? `
        <div class="taxi-dispatch-hero">
          <div class="taxi-hero-header">
            <div class="taxi-company-title">
              <div class="taxi-icon-circle">
                <i class="fa-solid fa-taxi"></i>
              </div>
              <div>
                <h3>${currentStop.radiotaxiName || 'Radiotaxi Ufficiale ' + currentStop.area}</h3>
                <p><i class="fa-solid fa-location-dot text-warning"></i> ${currentStop.name} &bull; Stalli Attivi 24/7</p>
              </div>
            </div>
            <div class="taxi-call-actions">
              <a href="tel:${currentStop.phone || '+39063570'}" class="btn-call-taxi-lg">
                <i class="fa-solid fa-phone-volume"></i> Chiama Taxi: ${currentStop.phoneDisplay || '06 3570'}
              </a>
              <a href="https://wa.me/${(currentStop.whatsapp || '+393471234567').replace(/\+/g, '')}?text=Salve,%20desidero%20richiedere%20un%20taxi%20a%20${encodeURIComponent(currentStop.name)}" target="_blank" class="btn-wa-taxi-lg">
                <i class="fa-brands fa-whatsapp"></i> WhatsApp Dispatch
              </a>
            </div>
          </div>
          <div class="taxi-stats-grid">
            <div class="taxi-stat-item">
              <i class="fa-solid fa-car-side"></i>
              <span>Vetture allo Stallo: <strong>3-5 disponibili</strong></span>
            </div>
            <div class="taxi-stat-item">
              <i class="fa-solid fa-stopwatch"></i>
              <span>Tempo di Arrivo: <strong>~3-6 min</strong></span>
            </div>
            <div class="taxi-stat-item">
              <i class="fa-solid fa-credit-card"></i>
              <span>Pagamenti a Bordo: <strong>POS / Carta / Apple Pay</strong></span>
            </div>
            <div class="taxi-stat-item">
              <i class="fa-solid fa-tag"></i>
              <span>Tariffa Tassametro: <strong>Scatto €3.50 + €1.25/km</strong></span>
            </div>
          </div>
        </div>
      ` : ''}

      ${this.gpsNearestInfo && this.gpsNearestInfo.stop && this.gpsNearestInfo.stop.id === currentStop.id ? `
        <div class="live-board-gps-banner">
          <div class="gps-banner-content">
            <div class="gps-icon-circle pulse">
              <i class="fa-solid fa-location-crosshairs"></i>
            </div>
            <div>
              <h4>📍 Partenze Live dalla Fermata Più Vicina al Tuo GPS</h4>
              <p>Fermata rilevata: <strong>${this.gpsNearestInfo.stop.name}</strong> &bull; Distanza: <strong>${this.gpsNearestInfo.distanceMeters >= 1000 ? (this.gpsNearestInfo.distanceMeters / 1000).toFixed(2) + ' km' : this.gpsNearestInfo.distanceMeters + ' m'}</strong> &bull; Tempo a piedi: <strong>~${this.gpsNearestInfo.walkTimeMin} min</strong></p>
            </div>
          </div>
          <div class="gps-banner-actions">
            <button type="button" class="btn btn-sm btn-outline-light" onclick="if(window.transitMap){window.transitMap.locateUser();if(window.app)window.app.switchTab('map');}">
              <i class="fa-solid fa-map-location-dot"></i> Vedi Percorso su Mappa
            </button>
            <button type="button" class="btn btn-sm btn-light" onclick="window.liveBoard.checkNearestDepartures()">
              <i class="fa-solid fa-rotate"></i> Aggiorna GPS
            </button>
          </div>
        </div>
      ` : ''}

      ${isTemp && isTempInactive ? `
        <div class="board-temporary-notice-banner">
          <div class="notice-banner-left">
            <div class="notice-icon-box">
              <i class="fa-solid fa-triangle-exclamation fa-2x text-danger"></i>
            </div>
            <div class="notice-text-content">
              <h4>⚠️ Fermata Provvisoria Sospesa per Lavori Stradali</h4>
              <p><strong>Causa / Motivo:</strong> ${currentStop.temporaryReason || 'Cantiere stradale'}. Le partenze sono temporaneamente deviate sulla fermata ufficiale attiva.</p>
              ${altData && altData.alternativeStop ? `
                <div class="notice-alt-pill">
                  <i class="fa-solid fa-person-walking text-warning"></i>
                  <span>Fermata Ufficiale Alternativa Consigliata: <strong>${altData.alternativeStop.name}</strong> (${altData.distanceMeters}m &bull; ~${altData.walkTimeMin} min a piedi)</span>
                </div>
              ` : ''}
            </div>
          </div>
          ${altData && altData.alternativeStop ? `
            <div class="notice-banner-actions">
              <button type="button" class="btn btn-warning-alt-switch" onclick="window.liveBoard.switchToStop('${altData.alternativeStop.id}')">
                <i class="fa-solid fa-arrow-right-arrow-left"></i> Passa alla Fermata Ufficiale
              </button>
              <a href="https://www.google.com/maps/dir/?api=1&origin=${currentStop.lat},${currentStop.lng}&destination=${altData.alternativeStop.lat},${altData.alternativeStop.lng}&travelmode=walking" target="_blank" rel="noopener" class="btn btn-outline-gmaps-walk">
                <i class="fa-brands fa-google"></i> Raggiungi a Piedi
              </a>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="departure-cards-grid">
    `;

    const modeData = typeof getActiveMode === "function" ? getActiveMode() : { icon: "fa-bus", name: "Pullman" };

    filtered.forEach(dep => {
      const hours = String(dep.scheduledTime.getHours()).padStart(2, "0");
      const minutes = String(dep.scheduledTime.getMinutes()).padStart(2, "0");
      const schedTimeStr = `${hours}:${minutes}`;

      html += `
        <div class="dep-card clickable-dep-card" data-line="${dep.lineCode}" style="border-left-color: ${dep.lineColor}" onclick="window.liveBoard.showRouteOnMap('${dep.lineId}', '${dep.id}')" title="Clicca per visualizzare il tracciato e le fermate di questa corsa sulla Mappa">
          <div class="dep-card-header">
            <div class="dep-line-tag" style="background-color: ${dep.lineColor}">
              <i class="fa-solid ${modeData.icon || 'fa-bus'}"></i>
              <span>${dep.lineCode}</span>
            </div>
            <div class="dep-route-info">
              <h4 class="dep-destination">Per ${dep.destination}</h4>
              <p class="dep-via" title="${dep.viaInfo}">${dep.viaInfo}</p>
            </div>
            <div class="dep-timer-box">
              <span class="timer-label">Conto alla rovescia</span>
              <div class="timer-clock" id="timer_${dep.id}">--:--</div>
            </div>
          </div>

          <div class="dep-card-meta">
            <div class="meta-item">
              <i class="fa-regular fa-clock"></i>
              <span>Orario: <strong>${schedTimeStr}</strong></span>
            </div>
            <div class="meta-item">
              <i class="fa-solid fa-signs-post"></i>
              <span>${dep.platform}</span>
            </div>
            <div class="meta-item">
              <span id="badge_${dep.id}" class="status-badge ${dep.delayMinutes > 0 ? 'status-delayed' : 'status-ontime'}">
                ${dep.delayMinutes > 0 ? `Ritardo +${dep.delayMinutes}'` : 'In Orario'}
              </span>
            </div>
            <div class="meta-item bus-model-badge" title="${dep.busModel}">
              <i class="fa-solid fa-shield-halved"></i>
              <span>${dep.busModel ? dep.busModel.split(' ')[0] : 'Mezzo'} ${(dep.busModel && dep.busModel.split(' ')[1]) || ''}</span>
            </div>
          </div>

          <div class="dep-card-footer">
            <div class="dep-price-tag">
              <span class="price-label">Tariffa da</span>
              <span class="price-val">€${dep.priceBase.toFixed(2)}</span>
            </div>
            <div class="dep-actions" style="display: flex; gap: 6px; flex-wrap: wrap;" onclick="event.stopPropagation();">
              <button class="btn btn-sm btn-outline btn-check-timetable-card" onclick="event.stopPropagation(); window.liveBoard.openLineScheduleModal('${dep.lineId}', '${dep.lineCode}')" title="Controlla la tabella oraria completa e tutte le fermate">
                <i class="fa-solid fa-clock text-primary"></i> Controlla Orari
              </button>
              <button class="btn btn-sm btn-outline btn-telemetry-inspect" onclick="event.stopPropagation(); if (window.realtimeTransit) window.realtimeTransit.openTelemetryInspector(window.liveBoard.departures.find(d => d.id === '${dep.id}'))" title="Ispeziona telemetria satellitare GPS e confronta con orario GTFS">
                <i class="fa-solid fa-satellite"></i> Telemetria Live
              </button>
              <button class="btn btn-sm btn-outline btn-view-route" onclick="window.liveBoard.showRouteOnMap('${dep.lineId}', '${dep.id}')" title="Visualizza percorso su mappa">
                <i class="fa-solid fa-map-location-dot"></i> Vedi Mappa
              </button>
              <button class="btn btn-sm btn-primary btn-coming-soon" disabled>
                <i class="fa-solid fa-ticket"></i> Prenota
                <span class="coming-soon-badge">Coming Soon</span>
              </button>
            </div>
          </div>
          
          <div class="dep-card-hint">
            <i class="fa-solid fa-route text-primary"></i> <span>Clicca per visualizzare il tracciato &bull; Premi "Telemetria Live" per confrontare con il GPS</span>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    this.container.innerHTML = html;

    // Aggiorna subito i valori dei timer appena renderizzati
    this.tickCountdowns();
  }

  showRouteOnMap(lineId, depId) {
    this.openRouteColorPicker(lineId, depId);
  }

  openRouteColorPicker(lineId, depId = null) {
    let dep = this.departures ? this.departures.find(d => d.id === depId) : null;
    if (!dep && this.departures && this.departures.length > 0) {
      dep = this.departures.find(d => d.lineId === lineId) || this.departures[0];
    }
    const line = (typeof getLineById === 'function' ? getLineById(lineId) : null) || 
                 (dep ? { id: dep.lineId, code: dep.lineCode, name: dep.lineName, color: dep.lineColor } : { id: lineId, code: 'LINEA', name: 'Percorso', color: '#0284c7' });

    if (!dep) {
      dep = {
        id: depId || 'DEP_DIRECT',
        lineId: line.id,
        lineCode: line.code,
        lineName: line.name,
        lineColor: line.color,
        destination: line.name ? line.name.split(' - ')[1] || line.name : 'Capolinea',
        viaInfo: line.fullName || line.name || 'Tracciato di linea',
        scheduledTime: new Date(),
        platform: 'Banchina 1'
      };
    }

    this.pendingRoute = { lineId, depId: dep.id, dep, line };
    this.selectedRouteColor = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_custom_route_color", line?.color || "#0284c7") : (line?.color || "#0284c7"));

    const modal = document.getElementById("routeColorPickerModal");
    const tripInfo = document.getElementById("routeColorTripInfo");
    const swatchesContainer = document.getElementById("routeColorSwatchesGrid");
    const colorInput = document.getElementById("routeCustomColorInput");
    const hexLabel = document.getElementById("routeCustomColorHex");

    if (!modal) {
      console.warn("routeColorPickerModal not found in DOM");
      return;
    }

    // Popola informazioni della corsa selezionata
    const hours = String(dep.scheduledTime.getHours()).padStart(2, "0");
    const minutes = String(dep.scheduledTime.getMinutes()).padStart(2, "0");
    const schedTimeStr = `${hours}:${minutes}`;
    const modeData = typeof getActiveMode === "function" ? getActiveMode() : { icon: "fa-bus" };

    if (tripInfo) {
      tripInfo.innerHTML = `
        <div class="route-banner-tag" style="background:${line?.color || '#0284c7'}; color:#ffffff; padding:8px 12px; border-radius:8px; font-weight:800; font-size:0.95rem; display:flex; align-items:center; gap:6px;">
          <i class="fa-solid ${modeData.icon || 'fa-bus'}"></i>
          <strong>${dep.lineCode}</strong>
        </div>
        <div style="flex:1;">
          <h4 style="margin:0 0 2px 0; font-size:1rem; font-weight:800; color:var(--text-primary);">${dep.viaInfo || line?.name || 'Tracciato'}</h4>
          <p style="margin:0; font-size:0.8rem; color:var(--text-secondary);"><i class="fa-solid fa-flag-checkered text-danger"></i> Per <strong>${dep.destination}</strong> &bull; Orario: <strong>${schedTimeStr}</strong> &bull; <strong>${dep.platform}</strong></p>
        </div>
      `;
    }

    // Palette predefinita ad alta visibilità
    const swatches = [
      { name: "Colore Ufficiale", color: line?.color || '#0284c7', isOfficial: true },
      { name: "Rosso Freccia", color: "#dc2626" },
      { name: "Blu Cobalto", color: "#2563eb" },
      { name: "Verde Smeraldo", color: "#10b981" },
      { name: "Arancio Corsa", color: "#f97316" },
      { name: "Viola Neon", color: "#8b5cf6" },
      { name: "Giallo Fluo", color: "#eab308" },
      { name: "Magenta Glow", color: "#ec4899" },
      { name: "Ciano Brillante", color: "#06b6d4" },
      { name: "Nero Grafite", color: "#1e293b" }
    ];

    if (swatchesContainer) {
      swatchesContainer.innerHTML = "";
      swatches.forEach(sw => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `swatch-btn ${sw.color.toLowerCase() === this.selectedRouteColor.toLowerCase() ? 'active' : ''}`;
        btn.innerHTML = `
          <span class="swatch-circle" style="background:${sw.color};"></span>
          <span>${sw.name}</span>
        `;
        btn.addEventListener("click", () => {
          this.setRouteColor(sw.color, sw.name);
          swatchesContainer.querySelectorAll(".swatch-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
        });
        swatchesContainer.appendChild(btn);
      });
    }

    // Selettore libero
    if (colorInput) {
      colorInput.value = this.selectedRouteColor;
      colorInput.oninput = (e) => {
        this.setRouteColor(e.target.value, "Personalizzato");
        if (swatchesContainer) {
          swatchesContainer.querySelectorAll(".swatch-btn").forEach(b => b.classList.remove("active"));
        }
      };
    }
    if (hexLabel) hexLabel.textContent = this.selectedRouteColor.toUpperCase();

    // Aggiorna anteprima
    this.updateRoutePreview(this.selectedRouteColor, "Colore Selezionato");

    // Binds per chiusura e conferma
    this.bindRouteColorModalEvents();

    // Mostra modale
    modal.classList.add("show");
    modal.classList.add("open");
  }

  setRouteColor(hexColor, name = "Selezionato") {
    this.selectedRouteColor = hexColor;
    if (typeof safeStorageSet === 'function') safeStorageSet("italiabus_custom_route_color", hexColor);
    const hexLabel = document.getElementById("routeCustomColorHex");
    const colorInput = document.getElementById("routeCustomColorInput");
    if (hexLabel) hexLabel.textContent = hexColor.toUpperCase();
    if (colorInput) colorInput.value = hexColor;
    this.updateRoutePreview(hexColor, name);
  }

  updateRoutePreview(hexColor, name) {
    const lineBar = document.getElementById("previewLineBar");
    const lineBar2 = document.getElementById("previewLineBar2");
    const pinMid = document.getElementById("previewPinMid");
    const badge = document.getElementById("previewColorName");

    if (lineBar) {
      lineBar.style.backgroundColor = hexColor;
      lineBar.style.boxShadow = `0 0 10px ${hexColor}80`;
    }
    if (lineBar2) {
      lineBar2.style.backgroundColor = hexColor;
      lineBar2.style.boxShadow = `0 0 10px ${hexColor}80`;
    }
    if (pinMid) {
      pinMid.style.backgroundColor = hexColor;
      pinMid.style.boxShadow = `0 2px 8px ${hexColor}80`;
    }
    if (badge) {
      badge.textContent = name || hexColor.toUpperCase();
      badge.style.color = hexColor;
      badge.style.border = `1px solid ${hexColor}`;
    }
  }

  bindRouteColorModalEvents() {
    const modal = document.getElementById("routeColorPickerModal");
    const closeBtn = document.getElementById("closeRouteColorPickerBtn");
    const cancelBtn = document.getElementById("btnCancelRouteColor");
    const backdrop = document.getElementById("routeColorPickerBackdrop");
    const confirmBtn = document.getElementById("btnConfirmRouteColor");

    const closeModal = () => {
      if (modal) {
        modal.classList.remove("show");
        modal.classList.remove("open");
      }
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (backdrop) backdrop.onclick = closeModal;

    if (confirmBtn) {
      confirmBtn.onclick = () => {
        closeModal();
        if (this.pendingRoute) {
          const { lineId, dep } = this.pendingRoute;
          if (window.app && typeof window.app.switchTab === 'function') {
            window.app.switchTab('map');
          }
          setTimeout(() => {
            if (window.transitMap && typeof window.transitMap.highlightLineRoute === 'function') {
              window.transitMap.highlightLineRoute(lineId, dep, this.selectedRouteColor);
            }
          }, 250);
        }
      };
    }
  }

  searchTaxiInCity(city) {
    if (!city || !city.trim()) return;
    this.searchedTaxiCity = city.trim();
    this.render();
  }

  resetTaxiCitySearch() {
    this.searchedTaxiCity = null;
    this.render();
  }

  resetFilters() {
    this.activeCategory = "all";
    this.searchQuery = "";
    if (this.searchInput) this.searchInput.value = "";
    this.filterCategoryTabs.forEach(b => {
      b.classList.toggle("active", b.dataset.category === "all");
    });
    this.render();
  }
}

// Inizializza globalmente in modo sicuro
function initLiveBoardEngine() {
  if (!window.liveBoard) {
    window.liveBoard = new LiveBoardEngine();
  }
}

window.openRouteColorPicker = function(lineId, depId) {
  if (window.liveBoard) {
    window.liveBoard.openRouteColorPicker(lineId, depId);
  }
};

window.showRouteOnMap = function(lineId, depId) {
  if (window.liveBoard) {
    window.liveBoard.showRouteOnMap(lineId, depId);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLiveBoardEngine);
} else {
  initLiveBoardEngine();
}
