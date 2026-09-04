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

    // --- LIVE ACTIVITIES: mappa depId -> activityId nativo iOS ---
    this.trackedActivities = {};
    // Callback invocata da Unity quando una Live Activity viene avviata con successo
    window.onLiveActivityStarted = (activityId) => {
      if (this._pendingLiveActivityDepId) {
        this.trackedActivities[this._pendingLiveActivityDepId] = activityId;
        this._pendingLiveActivityDepId = null;
        console.log(`[LiveActivity] Associata attività ${activityId}`);
      }
    };
    // Contatore per limitare gli aggiornamenti widget (non ogni secondo)
    this._widgetUpdateCounter = 0;

    this.init();
  }

  init() {
    this.updateControlsForMode();
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
      this.updateControlsForMode();
      this.populateStopSelect();
      this.generateInitialDepartures();
      this.render();
    });

    this.render();
  }

  updateControlsForMode() {
    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const tabsBar = document.querySelector(".board-tabs-bar");
    const stopLabel = document.querySelector('label[for="boardStopFilter"]');
    const searchInput = document.getElementById("boardSearchInput");

    // I filtri categoria (.board-tabs-bar) DEVONO RIMANERE ESCLUSIVAMENTE PER I PULLMAN
    if (currentMode === 'pullman') {
      if (tabsBar) {
        tabsBar.style.display = "flex";
        tabsBar.innerHTML = `
          <button class="board-tab-btn active" data-category="all">Tutte le Corse</button>
          <button class="board-tab-btn" data-category="urban">Urbano</button>
          <button class="board-tab-btn" data-category="mare">🏖️ Navette Mare</button>
          <button class="board-tab-btn" data-category="unical">🎓 Universitarie</button>
          <button class="board-tab-btn" data-category="regional">🌍 Regionali</button>
        `;
        this.rebindCategoryTabs();
      }
      if (stopLabel) stopLabel.innerHTML = '<i class="fa-solid fa-bus"></i> Seleziona Fermata / Autostazione:';
      if (searchInput) searchInput.placeholder = "Cerca linea o destinazione pullman...";
    } else {
      // Per Taxi, Treni e Tram: NASCONDI COMPLETAMENTE la barra dei filtri pullman!
      if (tabsBar) tabsBar.style.display = "none";
      this.activeCategory = "all";

      if (currentMode === 'taxi') {
        if (stopLabel) stopLabel.innerHTML = '<i class="fa-solid fa-taxi text-warning"></i> Seleziona Posteggio Taxi:';
        if (searchInput) searchInput.placeholder = "Cerca posteggio o ditta taxi...";
      } else if (currentMode === 'flight') {
        if (stopLabel) stopLabel.innerHTML = '<i class="fa-solid fa-plane-departure text-info"></i> Seleziona Aeroporto / Hub:';
        if (searchInput) searchInput.placeholder = "Cerca volo, codice IATA o destinazione...";
      } else if (currentMode === 'train') {
        if (stopLabel) stopLabel.innerHTML = '<i class="fa-solid fa-train text-danger"></i> Seleziona Stazione FS:';
        if (searchInput) searchInput.placeholder = "Cerca treno, convoglio o destinazione...";
      } else if (currentMode === 'tram') {
        if (stopLabel) stopLabel.innerHTML = '<i class="fa-solid fa-train-tram text-success"></i> Seleziona Fermata Tram:';
        if (searchInput) searchInput.placeholder = "Cerca linea tram o fermata...";
      }
    }
  }

  rebindCategoryTabs() {
    this.filterCategoryTabs = document.querySelectorAll(".board-tab-btn");
    this.filterCategoryTabs.forEach(btn => {
      btn.addEventListener("click", () => {
        this.filterCategoryTabs.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeCategory = btn.dataset.category || "all";
        this.render();
      });
    });
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

    const isBusStation = (s) => !!(s.isMainHub || (s.name && (s.name.includes("Terminal") || s.name.includes("Autostazione") || s.name.includes("Stazione FS") || s.name.includes("Scalo"))));

    const stationHubs = regionStops.filter(s => isBusStation(s));
    const regularStops = regionStops.filter(s => !isBusStation(s));

    // 1. STAZIONI & TERMINAL PRINCIPALI IN CIMA
    if (stationHubs.length > 0) {
      const stationGroup = document.createElement("optgroup");
      stationGroup.label = "⭐ STAZIONI & TERMINAL PRINCIPALI";
      stationHubs.forEach(stop => {
        const opt = document.createElement("option");
        opt.value = stop.id;
        opt.textContent = `⭐ ${stop.name} (${stop.platforms ? stop.platforms[0] : 'Hub Principale'})`;
        if (stop.id === this.activeStopId) opt.selected = true;
        stationGroup.appendChild(opt);
      });
      this.filterHubSelect.appendChild(stationGroup);
    }

    // 2. Raggruppa le altre fermate per area
    const areas = {};
    regularStops.forEach(stop => {
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

    if (!this.activeStopId && stationHubs.length > 0) {
      this.activeStopId = stationHubs[0].id;
      this.filterHubSelect.value = this.activeStopId;
    }
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
    const isTaxi = currentMode === 'taxi';
    const isFlight = currentMode === 'flight';

    if (isTaxi) {
      const taxiStops = typeof getStopsByRegion === 'function' ? getStopsByRegion(currentRegion) : [];
      taxiStops.forEach((stand, index) => {
        const depDate = new Date(now.getTime() + (index * 4 + 2) * 60 * 1000);
        this.departures.push({
          id: `TAXI_${Date.now()}_${index}`,
          lineId: stand.id,
          lineCode: `TAXI-${index + 1}`,
          lineName: stand.radiotaxiName || `Posteggio ${stand.name}`,
          lineColor: "#f59e0b",
          lineType: "urban",
          destination: stand.area + " & Zone Limitrofe",
          viaInfo: stand.address || "Stallo attivo H24 con tassisti in turno",
          scheduledTime: depDate,
          delayMinutes: 0,
          platform: `Stallo ${index + 1}`,
          occupancy: 35,
          priceBase: 3.50,
          busModel: "Vettura Taxi & NCC H24"
        });
      });
      return;
    }

    const allLines = typeof getLinesByRegion === 'function' ? getLinesByRegion(currentRegion) : [];
    if (!allLines || allLines.length === 0) return;

    // SOLO le linee che SERVONO davvero la fermata selezionata (la fermata è tra
    // le sue stops). Prima si ciclavano linee a caso con orari "adesso + minuti
    // random": orari FINTI. Ora si leggono le tabelle orarie REALI (line.schedule).
    let serving = [];
    if (this.activeStopId) {
      serving = allLines.filter((l) => {
        const s = l.stopsIds || l.stops || [];
        return s.indexOf(this.activeStopId) !== -1;
      });
    }
    // Se il dataset non collega nessuna linea a questa fermata, ripiega sulle linee
    // della regione (comunque con i loro orari reali) per non lasciare il tabellone vuoto.
    const pool = serving.length > 0 ? serving : allLines.slice(0, 80);

    this.departures = this._collectScheduledDepartures(now, pool, currentRegion, currentMode);
    this.departures.sort((a, b) => a.scheduledTime - b.scheduledTime);
    this.departures = this.departures.slice(0, 16);
  }

  // Tipo di giorno per leggere schedule.weekday / .saturday / .sunday.
  _dayType(d) {
    const g = d.getDay(); // 0 = domenica, 6 = sabato
    return g === 0 ? 'sunday' : (g === 6 ? 'saturday' : 'weekday');
  }

  // Stima dei minuti dall'origine della linea alla fermata selezionata, in base
  // alla posizione della fermata nel percorso e alla durata totale della corsa.
  // (Il dataset ha l'orario alla partenza + la durata, non i tempi per-fermata.)
  _stopOffsetMinutes(line, stopId) {
    const stops = line.stopsIds || line.stops || [];
    const idx = stopId ? stops.indexOf(stopId) : -1;
    if (idx <= 0) return 0;
    const dur = (typeof line.duration === 'number' && line.duration > 0) ? line.duration : 0;
    if (!dur) return 0;
    const denom = Math.max(1, stops.length - 1);
    return Math.round((dur * idx) / denom);
  }

  // Costruisce le partenze REALI (oggi + domani per riempire la sera) leggendo
  // gli orari ufficiali di ciascuna linea del pool alla fermata selezionata.
  _collectScheduledDepartures(now, lines, region, mode) {
    const isTrain = mode === 'train';
    const isFlight = mode === 'flight';
    const out = [];
    const nowMs = now.getTime();
    const graceMs = 90 * 1000; // mostra ancora una corsa partita da <=90s
    const CAP = 400;

    const currentStop = (typeof getStopById === 'function' ? getStopById(this.activeStopId) : null);
    const platforms = (currentStop && currentStop.platforms && currentStop.platforms.length) ? currentStop.platforms : null;

    for (let dayOffset = 0; dayOffset <= 1 && out.length < CAP; dayOffset++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
      const dayType = this._dayType(day);

      for (let li = 0; li < lines.length && out.length < CAP; li++) {
        const line = lines[li];
        const sched = line.schedule && line.schedule[dayType];
        if (!sched || !sched.length) continue;

        const offMin = this._stopOffsetMinutes(line, this.activeStopId);

        // Destinazione (ultima fermata o nome linea).
        const stopsList = line.stopsIds || line.stops || [];
        const destStopId = stopsList.length ? stopsList[stopsList.length - 1] : null;
        let destName = (destStopId && typeof getStopById === 'function' ? (getStopById(destStopId) || {}).name : null);
        if (!destName || destName === 'Capolinea') {
          if (line.name && line.name.includes(' - ')) destName = line.name.split(' - ').pop().split(' (')[0];
          else if (line.name && line.name.includes('➔')) destName = line.name.split('➔').pop().trim();
          else destName = isFlight ? 'Aeroporto di Destinazione' : (isTrain ? 'Stazione Terminus' : 'Capolinea');
        }

        for (let ti = 0; ti < sched.length && out.length < CAP; ti++) {
          const parts = ('' + sched[ti]).split(':');
          const hh = parseInt(parts[0], 10);
          const mm = parseInt(parts[1], 10);
          if (!isFinite(hh) || !isFinite(mm)) continue;

          const dep = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm + offMin, 0, 0);
          if (dep.getTime() < nowMs - graceMs) continue;

          const platform = platforms
            ? platforms[(hh + mm) % platforms.length]
            : (isFlight ? 'Gate 1' : (isTrain ? 'Binario 1' : 'Banchina 1'));

          out.push({
            // id STABILE (linea+orario) così i countdown non si azzerano ad ogni refresh
            id: `DEP_${line.id}_${dayOffset}_${('' + sched[ti]).replace(':', '')}`,
            lineId: line.id,
            lineCode: line.flightNumber || line.code || line.shortName || line.name || 'Linea',
            lineName: line.name,
            lineColor: line.color || (isFlight ? '#0284c7' : (isTrain ? '#dc2626' : '#0284c7')),
            lineType: line.type || (isFlight ? 'national' : (isTrain ? 'regional' : 'suburban')),
            destination: destName,
            viaInfo: line.airline ? `Compagnia: ${line.airline} &bull; ${line.name}` : (line.fullName || line.name),
            scheduledTime: dep,
            delayMinutes: 0, // nessun ritardo inventato: senza feed live la corsa è "programmata"
            platform: platform,
            busModel: line.busModel || line.aircraft || (isFlight ? 'Aeromobile' : (isTrain ? 'Treno Regionale' : 'Autobus di Linea')),
            priceBase: (typeof line.priceBase === 'number' && !isNaN(line.priceBase)) ? line.priceBase : (isFlight ? 49.00 : (isTrain ? 4.50 : 2.50)),
            occupancy: 45,
            vehicleId: line.id,
            scheduled: true,
            isAcquiring: false
          });
        }
      }
    }
    return out;
  }

  refreshDepartures() {
    // Ricalcola dalle tabelle orarie REALI: l'elenco avanza da solo col passare
    // del tempo (le corse già partite escono, entrano le successive di oggi/domani).
    this.generateInitialDepartures();
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

    // --- LIVE ACTIVITIES: aggiorna stato delle attività tracciate ogni 30 tick (~30s) ---
    this._widgetUpdateCounter++;
    if (Object.keys(this.trackedActivities).length > 0 && this._widgetUpdateCounter % 30 === 0) {
      this._updateTrackedActivities();
    }
    // Aggiorna i dati del Widget Lock Screen ogni 5 minuti (300 tick)
    if (this._widgetUpdateCounter % 300 === 0) {
      this._sendWidgetUpdate();
    }
  }

  // =============================================================
  // LIVE ACTIVITIES — Avvio, Stop e Aggiornamento
  // =============================================================

  /**
   * Toggle Live Activity per una partenza: avvia se non tracciata, ferma se già attiva.
   * @param {string} depId - ID della partenza
   */
  toggleLiveActivity(depId) {
    if (this.trackedActivities[depId]) {
      this.stopLiveActivity(depId);
    } else {
      this.startLiveActivity(depId);
    }
  }

  /**
   * Avvia una Live Activity per la partenza specificata.
   * Invia i dati completi a Unity che li passa al bridge nativo iOS.
   * @param {string} depId - ID della partenza
   */
  startLiveActivity(depId) {
    const dep = this.departures.find(d => d.id === depId);
    if (!dep) return;

    const modeData = typeof getActiveMode === "function" ? getActiveMode() : { name: "bus" };
    const transportMode = this._getTransportMode(modeData);

    const payload = {
      lineCode: dep.lineCode || "",
      lineName: dep.lineName || "",
      destination: dep.destination || "",
      lineColor: dep.lineColor || "#0284c7",
      transportMode: transportMode,
      vehicleModel: dep.busModel || "",
      departureTimestamp: Math.floor(dep.scheduledTime.getTime() / 1000),
      delayMinutes: dep.delayMinutes || 0,
      platform: dep.platform || "",
      status: "scheduled",
      occupancy: dep.occupancy || 0
    };

    this._pendingLiveActivityDepId = depId;
    const msg = "start_live_activity|||" + JSON.stringify(payload);
    
    if (window.invokeUnity && window.invokeUnity(msg)) {
      console.log(`[LiveActivity] Avvio richiesto per ${dep.lineCode} → ${dep.destination}`);
    } else {
      // Fallback per browser: mostra un toast informativo
      this._pendingLiveActivityDepId = null;
      console.log("[LiveActivity] Live Activities non disponibili (non in ambiente Unity/iOS).");
      if (typeof showToast === "function") {
        showToast("📌 Le Live Activities sono disponibili solo su iPhone con iOS 16.1+", "info");
      }
    }
    // Re-render per aggiornare lo stato del pulsante
    this.render();
  }

  /**
   * Ferma una Live Activity attiva per la partenza specificata.
   * @param {string} depId - ID della partenza
   */
  stopLiveActivity(depId) {
    const activityId = this.trackedActivities[depId];
    if (!activityId) return;

    const msg = "end_live_activity|||" + activityId;
    if (window.invokeUnity) window.invokeUnity(msg);

    delete this.trackedActivities[depId];
    console.log(`[LiveActivity] Fermata attività ${activityId} per partenza ${depId}`);
    this.render();
  }

  /**
   * Aggiorna tutte le Live Activities tracciate con i dati correnti.
   * Chiamato periodicamente da tickCountdowns (ogni ~30s).
   * @private
   */
  _updateTrackedActivities() {
    const now = new Date();
    for (const [depId, activityId] of Object.entries(this.trackedActivities)) {
      const dep = this.departures.find(d => d.id === depId);
      if (!dep) {
        // Partenza rimossa dal pool: termina la Live Activity
        const msg = "end_live_activity|||" + activityId;
        if (window.invokeUnity) window.invokeUnity(msg);
        delete this.trackedActivities[depId];
        continue;
      }

      const diffSec = Math.floor((dep.scheduledTime.getTime() - now.getTime()) / 1000);
      let status = "scheduled";
      if (diffSec <= -30) status = "departed";
      else if (diffSec <= 0) status = "boarding";
      else if (diffSec < 60) status = "arriving";

      // Se partito, termina la Live Activity
      if (status === "departed") {
        const endMsg = "end_live_activity|||" + activityId;
        if (window.invokeUnity) window.invokeUnity(endMsg);
        delete this.trackedActivities[depId];
        continue;
      }

      // Aggiorna lo stato della Live Activity
      const stateUpdate = {
        departureTimestamp: Math.floor(dep.scheduledTime.getTime() / 1000),
        delayMinutes: dep.delayMinutes || 0,
        platform: dep.platform || "",
        status: status,
        occupancy: dep.occupancy || 0
      };

      const msg = "update_live_activity|||" + activityId + "|||" + JSON.stringify(stateUpdate);
      if (window.invokeUnity) window.invokeUnity(msg);
    }
  }

  /**
   * Determina la modalità di trasporto dal modeData.
   * @private
   */
  _getTransportMode(modeData) {
    const name = (modeData?.name || "").toLowerCase();
    if (name.includes("pull") || name.includes("bus") || name.includes("autobus")) return "bus";
    if (name.includes("tren") || name.includes("train") || name.includes("ferrovia")) return "train";
    if (name.includes("vol") || name.includes("flight") || name.includes("aer")) return "flight";
    if (name.includes("tram") || name.includes("metro")) return "tram";
    if (name.includes("taxi") || name.includes("ncc")) return "taxi";
    return "bus";
  }

  /**
   * Invia le prossime partenze a Unity per il Widget Lock Screen statico.
   * @private
   */
  _sendWidgetUpdate() {
    if (!window.invokeUnity) return;

    const now = new Date();
    const modeData = typeof getActiveMode === "function" ? getActiveMode() : { name: "bus" };
    const transportMode = this._getTransportMode(modeData);

    // Prendi le prossime 3 partenze non ancora partite
    const upcoming = this.departures
      .filter(dep => dep.scheduledTime.getTime() > now.getTime() - 30000)
      .slice(0, 3)
      .map(dep => ({
        lineCode: dep.lineCode || "",
        destination: dep.destination || "",
        departureTimestamp: Math.floor(dep.scheduledTime.getTime() / 1000),
        delayMinutes: dep.delayMinutes || 0,
        platform: dep.platform || "",
        lineColor: dep.lineColor || "#0284c7",
        transportMode: transportMode
      }));

    if (upcoming.length > 0) {
      const msg = "update_widget_data|||" + JSON.stringify(upcoming);
      window.invokeUnity(msg);
    }
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
    if (window.Unity) {
      const btn = document.getElementById("btnCheckNearestDepartures");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Individuo la fermata pi� vicina...';
      }
      window._waitingForGps = 'board';
      window.Unity.call('request_gps');
      return;
    }

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
        
        const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
        let nearestTaxiDriver = null;

        if (currentMode === 'taxi') {
          const activeReg = bestStop.region || (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
          const discovery = (typeof window.findTaxiNearCityOrLocation === 'function')
            ? window.findTaxiNearCityOrLocation('', activeReg, { lat, lng })
            : null;
          if (discovery && discovery.businesses && discovery.businesses.length > 0) {
            nearestTaxiDriver = discovery.businesses[0];
          }
        }

        // Salva i dati GPS per il banner
        this.gpsNearestInfo = {
          stop: bestStop,
          driver: nearestTaxiDriver,
          userCoords: { lat, lng },
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
    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';

    return this.departures.filter(dep => {
      // I filtri di categoria sono ESCLUSIVAMENTE per i pullman
      if (currentMode === 'pullman') {
        if (this.activeCategory === "urban" && dep.lineType !== "urban") return false;
        if (this.activeCategory === "suburban" && dep.lineType !== "suburban") return false;
        if (this.activeCategory === "regional" && dep.lineType !== "regional") return false;
        if (this.activeCategory === "unical" && !dep.lineId.includes("UNI")) return false;
        if (this.activeCategory === "mare" && !dep.lineId.includes("MARE")) return false;
      }

      // Filtro query testuale
      if (this.searchQuery) {
        const matchName = dep.lineName && dep.lineName.toLowerCase().includes(this.searchQuery);
        const matchDest = dep.destination && dep.destination.toLowerCase().includes(this.searchQuery);
        const matchCode = dep.lineCode && dep.lineCode.toLowerCase().includes(this.searchQuery);
        const matchVia = dep.viaInfo && dep.viaInfo.toLowerCase().includes(this.searchQuery);
        if (!matchName && !matchDest && !matchCode && !matchVia) return false;
      }

      return true;
    });
  }

  render() {
    if (!this.container) return;

    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const isTaxi = currentMode === 'taxi';
    const isTrain = currentMode === 'train';
    const isTram = currentMode === 'tram';
    const isFlight = currentMode === 'flight';

    const currentStop = (typeof getStopById === 'function' ? getStopById(this.activeStopId) : null) || { 
      name: isTaxi ? "Posteggio Taxi Principale" : (isFlight ? "Aeroporto Principale" : (isTrain ? "Stazione Centrale FS" : "Hub Principale")), 
      address: "Centro Città",
      stopCode: isTaxi ? "TAXI-IT-01" : (isFlight ? "SUF" : "BUS-IT-100"),
      gmapsUrl: "https://www.google.com/maps",
      streetViewUrl: "https://www.google.com/maps"
    };

    const isTemp = !!currentStop.isTemporary;
    const isTempActive = isTemp && currentStop.temporaryStatus === 'active';
    const isTempInactive = isTemp && currentStop.temporaryStatus !== 'active';
    const altData = isTemp ? (typeof window.getAlternativeActiveStop === 'function' ? window.getAlternativeActiveStop(currentStop.id) : null) : null;

    const activeRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const activeCity = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_city", "all") : "all");
    const userCity = (this.searchedTaxiCity) || ((activeCity && activeCity !== 'all') ? activeCity : (currentStop.area || ""));
    const taxiDiscovery = (isTaxi && typeof window.findTaxiNearCityOrLocation === 'function') ? 
      window.findTaxiNearCityOrLocation(userCity, activeRegion, this.gpsNearestInfo?.userCoords) : null;

    const filtered = this.getFilteredDepartures();

    if (!isTaxi && filtered.length === 0) {
      const modeLabel = isFlight ? 'volo' : (isTrain ? 'treno' : (isTram ? 'tram' : 'pullman'));
      const emptyIcon = isFlight ? 'fa-plane' : (isTrain ? 'fa-train' : (isTram ? 'fa-train-tram' : 'fa-bus-simple'));
      this.container.innerHTML = `
        <div class="empty-board-state">
          <i class="fa-solid ${emptyIcon} fa-3x"></i>
          <h3>Nessuna partenza trovata</h3>
          <p>Nessun ${modeLabel} corrisponde ai filtri selezionati per questa fermata/aeroporto.</p>
          <button class="btn btn-outline" onclick="window.liveBoard.resetFilters()">Reimposta Filtri</button>
        </div>
      `;
      return;
    }

    let html = `
      ${currentMode === 'taxi' && taxiDiscovery ? `
        <!-- SEZIONE ATTIVITÀ COMMERCIALI TAXI E NCC (GOOGLE LOCAL PACK STYLE) -->
        <div class="google-taxi-pack-container">
          <div class="google-pack-header">
            <div class="google-pack-title-row">
              <div class="google-g-logo">
                <i class="fa-brands fa-google"></i>
              </div>
              <div>
                <h3 class="google-pack-heading">Attività commerciali · Taxi & NCC a <strong>${taxiDiscovery.cityName}</strong></h3>
                <p class="google-pack-sub"><i class="fa-solid fa-location-dot text-danger"></i> Risultati locali verificati con numeri diretti, recensioni e indicazioni stradali</p>
              </div>
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

          <!-- FILTRI RAPIDI STILE GOOGLE -->
          <div class="google-pack-pills-row">
            <span class="g-pill active"><i class="fa-solid fa-check"></i> Aperti adesso (H24)</span>
            <span class="g-pill"><i class="fa-solid fa-star"></i> Valutazioni migliori</span>
            <span class="g-pill"><i class="fa-solid fa-phone"></i> Con numero di telefono diretto</span>
            <a href="${taxiDiscovery.googleSearchUrl}" target="_blank" rel="noopener" class="g-pill g-pill-link">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Apri su Google Search
            </a>
          </div>

          ${this.gpsNearestInfo && this.gpsNearestInfo.driver ? `
            <!-- BANNER TASSISTA PIÙ VICINO RILEVATO DA GPS -->
            <div class="taxi-gps-detected-banner" style="background: linear-gradient(135deg, rgba(245,158,11,0.18), rgba(22,163,74,0.18)); border: 2px solid #f59e0b; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 44px; height: 44px; border-radius: 50%; background: #f59e0b; color: #0f172a; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 800; flex-shrink: 0; box-shadow: 0 4px 12px rgba(245,158,11,0.5);">
                  <i class="fa-solid fa-taxi"></i>
                </div>
                <div>
                  <div style="font-size: 0.75rem; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.05em;"><i class="fa-solid fa-location-crosshairs"></i> Tassista Più Vicino Rilevato dal Tuo GPS</div>
                  <strong style="font-size: 1.15rem; color: #ffffff;">${this.gpsNearestInfo.driver.name}</strong>
                  <div style="font-size: 0.825rem; color: #cbd5e1;">Distanza: <strong style="color: #4ade80;">${this.gpsNearestInfo.distanceMeters >= 1000 ? (this.gpsNearestInfo.distanceMeters/1000).toFixed(1) + ' km' : Math.round(this.gpsNearestInfo.distanceMeters) + ' m'}</strong> &bull; Arrivo stimato: <strong style="color: #4ade80;">~${this.gpsNearestInfo.walkTimeMin} min</strong></div>
                </div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <a href="tel:${this.gpsNearestInfo.driver.phone}" class="btn btn-sm btn-success" style="background:#16a34a; color:#fff; font-weight:800; padding:10px 16px; border-radius:8px; display:flex; align-items:center; gap:6px; text-decoration:none; box-shadow:0 4px 10px rgba(22,163,74,0.4);">
                  <i class="fa-solid fa-phone-volume"></i> Chiama Subito: ${this.gpsNearestInfo.driver.phoneDisplay}
                </a>
                <a href="https://wa.me/${(this.gpsNearestInfo.driver.whatsapp || this.gpsNearestInfo.driver.phone).replace(/[^0-9]/g, '')}?text=Salve,%20ho%20bisogno%20di%20un%20taxi%20subito%20alla%20mia%20posizione%20GPS" target="_blank" class="btn btn-sm btn-success" style="background:#25d366; color:#fff; font-weight:700; padding:10px 14px; border-radius:8px; display:flex; align-items:center; gap:6px; text-decoration:none;">
                  <i class="fa-brands fa-whatsapp"></i> WhatsApp
                </a>
              </div>
            </div>
          ` : ''}

          <!-- LISTA ATTIVITÀ LOCALI TROVATE (NCC & TAXI) -->
          <div class="google-businesses-list">
            ${(taxiDiscovery.businesses || []).map((b, bIdx) => `
              <div class="g-business-item ${bIdx === 0 ? 'top-rated' : ''}">
                <div class="g-biz-main-info">
                  <div class="g-biz-title-wrap">
                    <h4 class="g-biz-name">${b.name}</h4>
                    <div class="g-biz-rating-line">
                      <span class="g-rating-score">${b.rating}</span>
                      <div class="g-stars-gold">
                        ${Array.from({ length: 5 }).map((_, i) => `<i class="fa-solid fa-star ${i < Math.floor(b.stars) ? 'filled' : (i < b.stars ? 'half' : '')}"></i>`).join('')}
                      </div>
                      <span class="g-reviews-count">(${b.reviewsCount})</span>
                      <span class="g-dot-sep">&bull;</span>
                      <span class="g-biz-category">${b.category}</span>
                    </div>
                  </div>

                  <div class="g-biz-meta-line">
                    <span class="g-years-badge"><i class="fa-solid fa-clock-rotate-left"></i> ${b.yearsInBusiness}</span>
                    <span class="g-dot-sep">&bull;</span>
                    <span class="g-address"><i class="fa-solid fa-map-pin"></i> ${b.address}</span>
                  </div>

                  <div class="g-biz-phone-highlight">
                    <i class="fa-solid fa-phone"></i>
                    <strong>${b.phoneDisplay}</strong>
                    <span class="g-open-badge"><i class="fa-solid fa-circle"></i> Aperto 24 ore su 24</span>
                  </div>
                </div>

                <div class="g-biz-actions-col">
                  <a href="tel:${b.phone}" class="btn-g-call" title="Chiama subito questo taxi">
                    <i class="fa-solid fa-phone-volume"></i> Chiama
                  </a>
                  <a href="https://wa.me/${(b.whatsapp || b.phone).replace(/[^0-9]/g, '')}?text=Salve,%20ho%20bisogno%20di%20un%20taxi%20a%20${encodeURIComponent(taxiDiscovery.cityName)}" target="_blank" class="btn-g-wa" title="Invia messaggio WhatsApp">
                    <i class="fa-brands fa-whatsapp"></i> WhatsApp
                  </a>
                  <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}" target="_blank" rel="noopener" class="btn-g-directions" title="Ottieni indicazioni su Google Maps">
                    <i class="fa-solid fa-diamond-turn-right"></i> Indicazioni
                  </a>
                  <a href="https://www.google.com/search?q=${encodeURIComponent(b.name + ' ' + b.address)}" target="_blank" rel="noopener" class="btn-g-web" title="Visualizza scheda Google">
                    <i class="fa-solid fa-globe"></i> Scheda Google
                  </a>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- FOOTER CALL TO ACTION -->
          <div class="google-pack-footer">
            <a href="${taxiDiscovery.gmapsQueryUrl}" target="_blank" rel="noopener" class="btn-more-google-places">
              <i class="fa-brands fa-google"></i> Mostra tutti i risultati per "taxi ${taxiDiscovery.cityName}" su Google Maps
            </a>
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
            <span class="live-dot pulse"></span> ${currentMode === 'taxi' ? 'POSTEGGIO TAXI UFFICIALE H24' : (currentMode === 'train' ? 'ORARIO FS PROGRAMMATO' : 'ORARI UFFICIALI DI LINEA')}
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
            <div class="dep-header-top-row">
              <div class="dep-line-tag" style="background-color: ${dep.lineColor}">
                <i class="fa-solid ${modeData.icon || 'fa-bus'}"></i>
                <span>${dep.lineCode}</span>
              </div>
              <div class="dep-timer-box">
                <span class="timer-label">Conto alla rovescia</span>
                <div class="timer-clock" id="timer_${dep.id}">--:--</div>
              </div>
            </div>
            <div class="dep-route-info">
              <h4 class="dep-destination">Per ${dep.destination}</h4>
              <p class="dep-via" title="${dep.viaInfo}">${dep.viaInfo}</p>
            </div>
          </div>

          <div class="dep-card-meta">
            <div class="meta-item">
              <i class="fa-regular fa-clock"></i>
              <span>Orario: <strong>${schedTimeStr}</strong></span>
            </div>
            <div class="meta-item">
              <i class="fa-solid ${isFlight ? 'fa-door-open text-info' : 'fa-signs-post'}"></i>
              <span>${dep.platform}</span>
            </div>
            <div class="meta-item">
              <span id="badge_${dep.id}" class="status-badge ${dep.delayMinutes > 0 ? 'status-delayed' : 'status-ontime'}">
                ${dep.delayMinutes > 0 ? `Ritardo +${dep.delayMinutes}'` : (isFlight ? 'In Orario' : 'In Orario')}
              </span>
            </div>
            <div class="meta-item bus-model-badge" title="${dep.busModel}">
              <i class="fa-solid ${isFlight ? 'fa-plane' : 'fa-shield-halved'}"></i>
              <span>${dep.busModel ? dep.busModel.split(' ')[0] : (isFlight ? 'Airbus' : 'Mezzo')} ${(dep.busModel && dep.busModel.split(' ')[1]) || ''}</span>
            </div>
          </div>

          <div class="dep-card-footer">
            <div class="dep-price-tag">
              <span class="price-label">${isFlight ? 'Tariffa Volo da' : 'Tariffa da'}</span>
              <span class="price-val">€${dep.priceBase.toFixed(2)}</span>
            </div>
            <div class="dep-actions" onclick="event.stopPropagation();">
              <button class="btn btn-sm btn-outline btn-check-timetable-card" onclick="event.stopPropagation(); window.liveBoard.openLineScheduleModal('${dep.lineId}', '${dep.lineCode}')" title="Controlla la tabella oraria completa e tutte le fermate">
                <i class="fa-solid fa-clock text-primary"></i> ${isFlight ? 'Orari Volo' : 'Controlla Orari'}
              </button>
              <button class="btn btn-sm btn-outline btn-telemetry-inspect" onclick="event.stopPropagation(); if (window.realtimeTransit) window.realtimeTransit.openTelemetryInspector(window.liveBoard.departures.find(d => d.id === '${dep.id}'))" title="Ispeziona telemetria satellitare GPS e confronta con orario GTFS">
                <i class="fa-solid ${isFlight ? 'fa-satellite-dish' : 'fa-satellite'}"></i> ${isFlight ? 'Radar GPS' : 'Telemetria Live'}
              </button>
              <button class="btn btn-sm btn-outline btn-view-route" onclick="window.liveBoard.showRouteOnMap('${dep.lineId}', '${dep.id}')" title="Visualizza percorso su mappa">
                <i class="fa-solid fa-map-location-dot"></i> ${isFlight ? 'Rotta Aerea' : 'Vedi Mappa'}
              </button>
              <button class="btn btn-sm btn-primary btn-coming-soon" disabled>
                <i class="fa-solid fa-ticket"></i> ${isFlight ? 'Carta d\'Imbarco' : 'Prenota'}
                <span class="coming-soon-badge">Coming Soon</span>
              </button>
              <button class="btn btn-sm btn-outline btn-live-activity ${this.trackedActivities[dep.id] ? 'btn-tracking-active' : ''}" 
                onclick="event.stopPropagation(); window.liveBoard.toggleLiveActivity('${dep.id}')" 
                title="${this.trackedActivities[dep.id] ? 'Smetti di seguire questa corsa sulla Lock Screen' : 'Segui il countdown direttamente sulla Lock Screen e nella Dynamic Island'}">
                <i class="fa-solid ${this.trackedActivities[dep.id] ? 'fa-bell-slash' : 'fa-bell'}"></i> ${this.trackedActivities[dep.id] ? 'Smetti di Seguire' : '📌 Segui su Lock Screen'}
              </button>
            </div>
          </div>
          
          <div class="dep-card-hint">
            <i class="fa-solid ${isFlight ? 'fa-plane-departure text-info' : 'fa-route text-primary'}"></i> <span>${isFlight ? 'Clicca per visualizzare la rotta e gli aeroporti &bull; Premi "Radar GPS" per la telemetria di volo' : 'Clicca per visualizzare il tracciato &bull; Premi "Telemetria Live" per confrontare con il GPS'}</span>
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

  // Modale "Controlla Orari": mostra la TABELLA ORARIA REALE della linea
  // (line.schedule → feriale / sabato / domenica). Prima questo metodo NON
  // esisteva e il bottone lanciava un errore.
  openLineScheduleModal(lineId, lineCode) {
    const line = (typeof getLineById === 'function' ? getLineById(lineId) : null);
    const dep = this.departures ? this.departures.find(d => d.lineId === lineId) : null;
    const name = (line && line.name) || (dep && dep.lineName) || lineCode || 'Linea';
    const color = (line && line.color) || (dep && dep.lineColor) || '#0284c7';
    const sched = (line && line.schedule) ? line.schedule : null;
    const today = this._dayType(new Date());
    const dayNames = { weekday: 'Feriale (Lun–Ven)', saturday: 'Sabato', sunday: 'Domenica e festivi' };

    this._ensureScheduleModalStyles();

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const section = (key) => {
      const times = (sched && sched[key]) ? sched[key] : [];
      const label = dayNames[key] + (key === today ? ' · oggi' : '');
      if (!times.length) return `<div class="lsm-day"><h4>${label}</h4><p class="lsm-empty">Nessuna corsa</p></div>`;
      const chips = times.map(t => {
        const p = ('' + t).split(':');
        const mins = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
        const isNext = (key === today && isFinite(mins) && mins >= nowMin);
        return `<span class="lsm-t${isNext ? ' next' : ''}">${t}</span>`;
      }).join('');
      return `<div class="lsm-day${key === today ? ' is-today' : ''}"><h4>${label}</h4><div class="lsm-times">${chips}</div></div>`;
    };

    const overlay = document.createElement('div');
    overlay.className = 'lsm-overlay';
    overlay.innerHTML = `
      <div class="lsm-modal" role="dialog" aria-modal="true">
        <div class="lsm-head">
          <div class="lsm-title"><span class="lsm-code" style="background:${color}">${lineCode || ''}</span> <strong>${name}</strong></div>
          <button type="button" class="lsm-close" aria-label="Chiudi">&times;</button>
        </div>
        <div class="lsm-note"><i class="fa-solid fa-circle-info"></i> Orari ufficiali di linea. Alle fermate intermedie l'orario è stimato sulla durata della corsa; i ritardi in tempo reale non sono disponibili offline.</div>
        <div class="lsm-body">
          ${sched ? (section('weekday') + section('saturday') + section('sunday')) : '<p class="lsm-empty">Orario non disponibile per questa linea.</p>'}
        </div>
      </div>`;
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const closeBtn = overlay.querySelector('.lsm-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(overlay);
  }

  _ensureScheduleModalStyles() {
    if (document.getElementById('lsmStyles')) return;
    const st = document.createElement('style');
    st.id = 'lsmStyles';
    st.textContent = `
      .lsm-overlay{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;}
      .lsm-modal{background:var(--bg-card,#fff);color:var(--text-primary,#0f172a);border:1px solid var(--border-color,#e2e8f0);border-radius:16px;max-width:520px;width:100%;max-height:82vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);}
      .lsm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border-color,#e2e8f0);position:sticky;top:0;background:var(--bg-card,#fff);}
      .lsm-title{display:flex;align-items:center;gap:9px;font-size:1rem;}
      .lsm-code{color:#fff;font-weight:800;padding:3px 9px;border-radius:7px;font-size:.82rem;white-space:nowrap;}
      .lsm-close{border:none;background:var(--bg-subtle,#f1f5f9);color:var(--text-secondary,#475569);width:32px;height:32px;border-radius:999px;font-size:1.2rem;cursor:pointer;line-height:1;}
      .lsm-close:hover{background:var(--border-color,#e2e8f0);}
      .lsm-note{font-size:.76rem;color:var(--text-secondary,#475569);padding:10px 16px;background:var(--bg-subtle,#f1f5f9);}
      .lsm-note i{color:var(--brand-primary,#0284c7);margin-right:5px;}
      .lsm-body{padding:12px 16px 18px;}
      .lsm-day{margin-bottom:14px;}
      .lsm-day h4{margin:0 0 8px;font-size:.85rem;font-weight:800;color:var(--text-primary,#0f172a);}
      .lsm-day.is-today h4{color:var(--brand-primary,#0284c7);}
      .lsm-times{display:flex;flex-wrap:wrap;gap:7px;}
      .lsm-t{font-variant-numeric:tabular-nums;font-weight:700;font-size:.82rem;padding:5px 9px;border-radius:8px;background:var(--bg-subtle,#f1f5f9);color:var(--text-secondary,#475569);border:1px solid var(--border-color,#e2e8f0);}
      .lsm-t.next{background:var(--brand-primary,#0284c7);color:#fff;border-color:var(--brand-primary,#0284c7);}
      .lsm-empty{font-size:.8rem;color:var(--text-muted,#64748b);margin:0;}
    `;
    document.head.appendChild(st);
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



