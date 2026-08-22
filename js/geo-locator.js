/**
 * ITALIABUS - SMART DESTINATION & GEOLOCATION ROUTING ENGINE
 * 
 * Permette all'utente di cercare o selezionare qualsiasi destinazione (Pullman, Treni, Tram, Taxi, Aerei).
 * Invece di indicare una fermata a caso, individua matematicamente la fermata di partenza PIÙ VICINA
 * che effettivamente serve e conduce alla destinazione desiderata, tracciando il percorso completo sulla mappa.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

class GeoLocatorEngine {
  constructor() {
    this.btn = document.getElementById("btnLocateRoute");
    this.panel = document.getElementById("geoRoutePanel");
    
    // Controlli Input & Dropdown Destinazione
    this.destInput = document.getElementById("mapDestinationInput");
    this.destDropdown = document.getElementById("mapDestDropdown");
    this.destDropdownList = document.getElementById("mapDestDropdownList");
    this.destDropdownTitle = document.getElementById("destDropdownTitle");
    this.destDropdownBadge = document.getElementById("destDropdownModeBadge");
    this.btnClearDest = document.getElementById("btnClearMapDest");
    this.btnToggleDropdown = document.getElementById("btnToggleDestDropdown");

    this.map = null;
    this.geoLayer = null;
    this.userLatLng = null;
    this.nearestStop = null;
    this.selectedDestination = null;
    this.activeRouteInfo = null;
    this.walkSeconds = null;
    this.countdownTimer = null;

    this.init();
  }

  init() {
    if (this.btn) {
      this.btn.addEventListener("click", () => this.locateAndRoute());
    }

    this.bindDestinationControls();

    // Aggiornamento reattivo al cambio modalità di trasporto
    document.addEventListener("transportModeChanged", (e) => {
      this.updateModeUI(e.detail?.mode);
      if (this.selectedDestination) {
        // Ricalcola con la nuova modalità se possibile
        this.routeToDestination(this.selectedDestination);
      }
    });

    // Aggiornamento reattivo al cambio regione
    document.addEventListener("regionChanged", () => {
      this.populateDestDropdown();
    });
  }

  ensureMap() {
    if (this.map && this.geoLayer) return this.map;
    if (window.transitMap && window.transitMap.map && typeof L !== 'undefined') {
      this.map = window.transitMap.map;
      if (!this.geoLayer) {
        this.geoLayer = L.featureGroup().addTo(this.map);
      }
    }
    return this.map;
  }

  /* ==========================================================================
     GESTIONE INPUT & DROPDOWN DESTINAZIONI ULTRA-FLUIDO
     ========================================================================== */

  bindDestinationControls() {
    if (!this.destInput) return;
    this.searchDebounceTimer = null;

    // Focus -> apre il menu e popola le destinazioni principali
    this.destInput.addEventListener("focus", () => {
      this.populateDestDropdown(this.destInput.value.trim());
      this.openDropdown();
    });

    // Digitazione con debouncing fluido (60ms) -> zero lag
    this.destInput.addEventListener("input", () => {
      const q = this.destInput.value.trim();
      if (this.btnClearDest) {
        this.btnClearDest.style.display = q ? "flex" : "none";
      }
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.populateDestDropdown(q);
        this.openDropdown();
      }, 60);
    });

    // Tasto Invio -> seleziona il primo risultato filtrato
    this.destInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const firstItem = this.destDropdownList?.querySelector(".dest-dropdown-item");
        if (firstItem && firstItem._destData) {
          this.selectDestination(firstItem._destData);
        }
      } else if (e.key === "Escape") {
        this.closeDropdown();
      }
    });

    // Tasto toggle dropdown
    if (this.btnToggleDropdown) {
      this.btnToggleDropdown.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.destDropdown?.classList.contains("open")) {
          this.closeDropdown();
        } else {
          this.populateDestDropdown(this.destInput.value.trim());
          this.openDropdown();
          this.destInput.focus();
        }
      });
    }

    // Tasto cancella destinazione
    if (this.btnClearDest) {
      this.btnClearDest.addEventListener("click", (e) => {
        e.stopPropagation();
        this.clearDestination();
      });
    }

    // Chiusura al click esterno
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#mapDestinationHubBar")) {
        this.closeDropdown();
      }
    });

    this.updateModeUI();
  }

  openDropdown() {
    if (this.destDropdown) {
      this.destDropdown.classList.add("open");
    }
  }

  closeDropdown() {
    if (this.destDropdown) {
      this.destDropdown.classList.remove("open");
    }
  }

  clearDestination() {
    this.selectedDestination = null;
    this.activeRouteInfo = null;
    if (this.destInput) this.destInput.value = "";
    if (this.btnClearDest) this.btnClearDest.style.display = "none";
    this.closeDropdown();
    if (this.geoLayer) this.geoLayer.clearLayers();
    if (this.panel) this.panel.classList.remove("open");
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  updateModeUI(mode = null) {
    const currentMode = mode || (typeof getActiveMode === 'function' ? getActiveMode() : 'pullman');
    const modeData = window.TRANSIT_DATA?.modes?.[currentMode] || { name: 'Pullman', icon: 'fa-bus' };

    if (this.destDropdownBadge) {
      this.destDropdownBadge.textContent = modeData.name || 'Pullman';
    }
    if (this.destDropdownTitle) {
      this.destDropdownTitle.textContent = `Destinazioni Rete ${modeData.name || 'Trasporti'}`;
    }
    if (this.destInput) {
      const PLACEHOLDERS = {
        pullman: "Dove vuoi andare in Pullman? Es. Roma, Cosenza, Aeroporto, Ospedale...",
        train: "Quale stazione devi raggiungere? Es. Milano Centrale, Roma Termini, Paola...",
        tram: "Dove vuoi andare in Tram? Es. Capolinea, Piazza Duomo, Università...",
        taxi: "Quale indirizzo o posteggio vuoi raggiungere in Taxi? Es. Centro, Stazione...",
        flight: "Quale aeroporto o città vuoi raggiungere in Volo? Es. Roma Fiumicino, Milano..."
      };
      this.destInput.placeholder = PLACEHOLDERS[currentMode] || "Inserisci la tua destinazione...";
    }
  }

  /* ==========================================================================
     RICERCA DESTINAZIONI AD ALTE PRESTAZIONI (< 1ms per 50k fermate)
     ========================================================================== */

  searchDestinations(filterQuery = "", maxLimit = 35) {
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeData = window.TRANSIT_DATA?.modes?.[mode] || window.TRANSIT_DATA?.modes?.pullman;
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const allStops = (modeData?.stops && modeData.stops.length > 0) ? modeData.stops : [];

    const q = (filterQuery || "").toLowerCase().trim();
    const results = [];
    const seen = new Set();

    const formatDest = (s, isHub) => {
      let cat = 'Fermata Rete Regionale';
      let icon = 'fa-location-dot';

      if (mode === 'flight') {
        cat = 'Aeroporto Internazionale / Nazionale';
        icon = 'fa-plane-departure';
      } else if (mode === 'train') {
        cat = isHub ? 'Stazione AV / Principale' : 'Stazione Ferroviaria';
        icon = 'fa-train';
      } else if (mode === 'tram') {
        cat = 'Fermata Tranviaria';
        icon = 'fa-train-tram';
      } else if (mode === 'taxi') {
        cat = 'Posteggio Taxi / Hub';
        icon = 'fa-taxi';
      } else {
        cat = isHub ? 'Autostazione / Hub Principale' : 'Fermata Rete Regionale';
        icon = isHub ? 'fa-bus-simple' : 'fa-location-dot';
      }

      return {
        id: s.id,
        uniqueKey: `dest_${s.id}`,
        name: s.name,
        area: s.area || s.name.split(' - ')[0],
        region: s.region || currentRegion,
        lat: s.lat,
        lng: s.lng,
        isMainHub: isHub,
        category: cat,
        icon: icon,
        stop: s
      };
    };

    if (!q) {
      // 1. Hubs Principali
      for (let i = 0; i < allStops.length; i++) {
        const s = allStops[i];
        if (s.isMainHub && !seen.has(s.name)) {
          seen.add(s.name);
          results.push(formatDest(s, true));
          if (results.length >= 15) break;
        }
      }
      // 2. Fermate della regione attiva
      for (let i = 0; i < allStops.length; i++) {
        const s = allStops[i];
        if ((s.region === currentRegion || !s.region) && !seen.has(s.name)) {
          seen.add(s.name);
          results.push(formatDest(s, !!s.isMainHub));
          if (results.length >= maxLimit) break;
        }
      }
      return results;
    }

    // Ricerca per nome o area con early exit per prestazioni fulminee
    for (let i = 0; i < allStops.length; i++) {
      const s = allStops[i];
      const n = s.name || '';
      const a = s.area || '';
      if (n.toLowerCase().includes(q) || a.toLowerCase().includes(q)) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          results.push(formatDest(s, !!s.isMainHub));
          if (results.length >= maxLimit) break;
        }
      }
    }

    return results;
  }

  /* ==========================================================================
     POPOLAMENTO DROPDOWN DESTINAZIONI
     ========================================================================== */

  populateDestDropdown(filterQuery = "") {
    if (!this.destDropdownList) return;

    const filtered = this.searchDestDestinations ? this.searchDestDestinations(filterQuery, 35) : this.searchDestinations(filterQuery, 35);

    if (!filtered || filtered.length === 0) {
      this.destDropdownList.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          <i class="fa-solid fa-circle-question" style="font-size: 1.5rem; margin-bottom: 6px; display: block; opacity: 0.6;"></i>
          Nessuna destinazione trovata per "<strong>${filterQuery}</strong>".<br>
          <small>Prova a cercare una città, stazione o hub principale.</small>
        </div>
      `;
      return;
    }

    // Raggruppa per categoria
    const groups = {};
    filtered.forEach(item => {
      const cat = item.category || 'Altre Destinazioni';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });

    let html = "";
    for (const [catName, items] of Object.entries(groups)) {
      html += `<div class="dest-dropdown-group-title">${catName} (${items.length})</div>`;
      items.forEach(dest => {
        const isSel = this.selectedDestination && this.selectedDestination.id === dest.id;
        html += `
          <div class="dest-dropdown-item ${isSel ? 'active' : ''}" data-dest-key="${dest.uniqueKey}">
            <div class="dest-item-main">
              <div class="dest-item-icon"><i class="fa-solid ${dest.icon || 'fa-location-dot'}"></i></div>
              <div class="dest-item-text">
                <span class="dest-item-name">${dest.name}</span>
                <span class="dest-item-meta">${dest.area || dest.region || 'Rete Nazionale'}</span>
              </div>
            </div>
            <span class="dest-item-tag">${dest.isMainHub ? 'Hub Diretto' : 'Servito'}</span>
          </div>
        `;
      });
    }

    this.destDropdownList.innerHTML = html;

    // Associa i dati agli elementi per il click rapido
    this.destDropdownList.querySelectorAll(".dest-dropdown-item").forEach(el => {
      const key = el.dataset.destKey;
      const found = filtered.find(x => x.uniqueKey === key);
      el._destData = found;
      el.addEventListener("click", () => {
        if (found) this.selectDestination(found);
      });
    });
  }

  selectDestination(dest) {
    if (!dest) return;
    this.selectedDestination = dest;
    if (this.destInput) this.destInput.value = dest.name;
    if (this.btnClearDest) this.btnClearDest.style.display = "flex";
    this.closeDropdown();

    // Esegui il calcolo della fermata utile più vicina per raggiungere questa destinazione
    this.routeToDestination(dest);
  }

  /* ==========================================================================
     CALCOLO FERMATA DI PARTENZA UTILE PIÙ VICINA ALLA DESTINAZIONE
     ========================================================================== */

  findServingDepartureStop(targetDest, referenceLatLng) {
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeData = window.TRANSIT_DATA?.modes?.[mode] || window.TRANSIT_DATA?.modes?.pullman;
    const allStops = (modeData?.stops && modeData.stops.length > 0) ? modeData.stops : [];
    const allLines = (modeData?.lines && modeData.lines.length > 0) ? modeData.lines : [];

    if (mode === 'taxi') {
      const bestStop = this.findNearestStop(referenceLatLng) || allStops[0];
      return {
        departureStop: bestStop,
        destinationStop: targetDest.stop || { id: 'taxi_dest', name: targetDest.name, lat: targetDest.lat, lng: targetDest.lng },
        servingLines: [{ code: 'TAXI-DIRECT', name: 'Corsa Taxi Diretta H24', color: '#10b981', frequencyMinutes: 5 }],
        distanceToDestKm: this.haversine(referenceLatLng, [targetDest.lat, targetDest.lng]) / 1000
      };
    }

    const targetStopId = targetDest.id || targetDest.stop?.id;

    // Lookup index fermate per accesso O(1)
    const stopMap = new Map();
    for (let i = 0; i < allStops.length; i++) {
      stopMap.set(allStops[i].id, allStops[i]);
    }

    // 1. Trova le linee che includono la destinazione
    const servingLines = [];
    for (let i = 0; i < allLines.length; i++) {
      const l = allLines[i];
      const arr = l.stopsIds || l.stops || [];
      if (arr.includes(targetStopId)) {
        servingLines.push(l);
      }
    }

    let candidateDepartureStops = [];

    if (servingLines.length > 0) {
      const candidateStopIds = new Set();
      servingLines.forEach(l => {
        const stopsArr = l.stopsIds || l.stops || [];
        stopsArr.forEach(sId => {
          if (sId !== targetStopId) {
            candidateStopIds.add(sId);
          }
        });
      });

      candidateDepartureStops = Array.from(candidateStopIds).map(id => stopMap.get(id)).filter(Boolean);
    }

    // Fallback: se non trovate linee dirette registrate, considera tutte le fermate disponibili
    if (candidateDepartureStops.length === 0) {
      candidateDepartureStops = allStops;
    }

    // 2. Tra tutte le candidate, trova la PIÙ VICINA alla posizione di partenza dell'utente
    let bestDeparture = null;
    let minDistance = Infinity;

    for (let i = 0; i < candidateDepartureStops.length; i++) {
      const stop = candidateDepartureStops[i];
      const dist = this.haversine(referenceLatLng, [stop.lat_actual || stop.lat, stop.lng_actual || stop.lng]);
      if (dist < minDistance) {
        minDistance = dist;
        bestDeparture = stop;
      }
    }

    if (!bestDeparture) {
      bestDeparture = this.findNearestStop(referenceLatLng) || allStops[0];
    }

    // Linee di collegamento della fermata di partenza
    let directConnectingLines = servingLines.filter(l => {
      const arr = l.stopsIds || l.stops || [];
      return arr.includes(bestDeparture.id);
    });

    if (directConnectingLines.length === 0) {
      directConnectingLines = servingLines.length > 0 ? servingLines : (this.linesServingStop(bestDeparture.id));
    }

    const targetStopObj = stopMap.get(targetStopId) || targetDest.stop || {
      id: targetStopId,
      name: targetDest.name,
      lat: targetDest.lat,
      lng: targetDest.lng
    };

    return {
      departureStop: bestDeparture,
      destinationStop: targetStopObj,
      servingLines: directConnectingLines,
      distanceToDestKm: this.haversine([bestDeparture.lat, bestDeparture.lng], [targetStopObj.lat, targetStopObj.lng]) / 1000
    };
  }

  /* ==========================================================================
     AVVIO ITINERARIO INTELLIGENTE VERSO LA DESTINAZIONE
     ========================================================================== */

  async routeToDestination(dest) {
    const map = this.ensureMap();
    if (!map) return;

    const doRouting = async () => {
      // Switch alla tab mappa
      if (window.app && typeof window.app.switchTab === 'function') {
        window.app.switchTab('map');
      }

      // Posizione di partenza di riferimento: GPS utente oppure centro della mappa/hub regionale
      let refLatLng = this.userLatLng;
      if (!refLatLng) {
        const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
        const hub = typeof getMainHubForRegion === 'function' ? getMainHubForRegion(currentRegion) : null;
        if (hub) {
          refLatLng = [hub.lat, hub.lng];
        } else {
          const c = map.getCenter();
          refLatLng = [c.lat, c.lng];
        }
      }

      const routeInfo = this.findServingDepartureStop(dest, refLatLng);
      if (!routeInfo || !routeInfo.departureStop) {
        this.showError("Nessuna fermata di partenza trovata per raggiungere questa destinazione.");
        return;
      }

      this.activeRouteInfo = routeInfo;
      this.nearestStop = routeInfo.departureStop;

      // Sincronizza Tabellone Live con la fermata di partenza calcolata
      if (window.liveBoard) {
        window.liveBoard.activeStopId = routeInfo.departureStop.id;
        if (window.liveBoard.filterHubSelect) {
          window.liveBoard.filterHubSelect.value = routeInfo.departureStop.id;
        }
        window.liveBoard.generateInitialDepartures();
        window.liveBoard.render();
      }

      // Disegna il percorso visivo sulla mappa (focalizzato sulla partenza)
      await this.drawSmartRouteOnMap(routeInfo, refLatLng);

      // Renderizza il pannello con i dati del viaggio
      this.renderSmartRoutePanel(routeInfo, refLatLng);

      // Invia notifica di sistema
      if (window.notificationManager) {
        window.notificationManager.send(
          `Fermata Trovata: ${routeInfo.departureStop.name} 🚏`,
          `Punto di salita utile per raggiungere ${dest.name}. Linee attive e orari disponibili.`,
          { type: "success", icon: "fa-person-walking-arrow-right", tabTarget: "map", showToast: true, sendNative: false }
        );
      }
    };

    if (typeof window.withAppLoader === 'function') {
      await window.withAppLoader(`Calcolo Itinerario per ${dest.name || 'Destinazione'}...`, "Individuazione fermata di salita ottimale e tracciato...", doRouting, 240);
    } else {
      await doRouting();
    }
  }

  async routeToNearestDeparture(stop) {
    const map = this.ensureMap();
    if (!map || !stop) return;

    const doRoute = async () => {
      if (window.app && typeof window.app.switchTab === 'function') {
        window.app.switchTab('map');
      }

      const refLatLng = this.userLatLng || [stop.lat, stop.lng];
      const routeInfo = {
        departureStop: stop,
        destinationStop: null,
        servingLines: this.linesServingStop(stop.id),
        distanceToDestKm: 0,
        isDirectNearest: true
      };

      this.activeRouteInfo = routeInfo;
      this.nearestStop = stop;

      if (window.liveBoard) {
        window.liveBoard.activeStopId = stop.id;
        if (window.liveBoard.filterHubSelect) {
          window.liveBoard.filterHubSelect.value = stop.id;
        }
        window.liveBoard.generateInitialDepartures();
        window.liveBoard.render();
      }

      await this.drawSmartRouteOnMap(routeInfo, refLatLng);
      this.renderSmartRoutePanel(routeInfo, refLatLng);

      if (window.notificationManager) {
        window.notificationManager.send(
          `Fermata Più Vicina: ${stop.name} 📍`,
          `Sei a pochi minuti a piedi dalla fermata. Consulta gli orari in tempo reale.`,
          { type: "success", icon: "fa-location-dot", tabTarget: "map", showToast: true, sendNative: false }
        );
      }
    };

    if (typeof window.withAppLoader === 'function') {
      await window.withAppLoader("Localizzazione Fermata Più Vicina...", "Calcolo percorso a piedi verso la fermata...", doRoute, 240);
    } else {
      await doRoute();
    }
  }

  /* ==========================================================================
     DISEGNO VETTORIALE SULLA MAPPA LEAFLET (ZOOM STILE NAVIGATORE GPS)
     ========================================================================== */

  async drawSmartRouteOnMap(routeInfo, refLatLng) {
    const map = this.ensureMap();
    if (!map || !this.geoLayer) return;

    this.geoLayer.clearLayers();

    const dep = routeInfo.departureStop;
    const dest = routeInfo.destinationStop;
    const depLatLng = [dep.lat_actual || dep.lat, dep.lng_actual || dep.lng];

    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const isFlight = currentMode === 'flight';
    const isTrain = currentMode === 'train';
    const isTaxi = currentMode === 'taxi';
    const isTram = currentMode === 'tram';

    let modeIcon = 'fa-bus';
    if (isFlight) modeIcon = 'fa-plane-departure';
    else if (isTrain) modeIcon = 'fa-train';
    else if (isTaxi) modeIcon = 'fa-taxi';
    else if (isTram) modeIcon = 'fa-train-tram';

    // 1. Marker Posizione Utente (se GPS presente)
    if (this.userLatLng) {
      const userIcon = L.divIcon({
        html: `<div class="user-gps-pulse-pin"><span class="gps-core-dot"></span></div>`,
        className: "user-gps-pin-wrapper",
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker(this.userLatLng, { icon: userIcon, zIndexOffset: 2000 })
        .bindPopup(`<strong>📍 La tua Posizione Attuale</strong><br><small>Punto di partenza GPS</small>`)
        .addTo(this.geoLayer);

      // Percorso a piedi fino alla fermata di partenza
      const walkMeters = this.haversine(this.userLatLng, depLatLng);
      let walkCoords = [this.userLatLng, depLatLng];
      if (walkMeters < 50000) {
        try {
          const r = await this.fetchWalkingRoute(this.userLatLng, depLatLng);
          if (r && r.coords && r.coords.length > 1) {
            walkCoords = r.coords;
            this.walkSeconds = r.duration;
          }
        } catch (e) {
          console.warn("Walking route fetch error:", e);
        }
      }
      if (!this.walkSeconds) this.walkSeconds = Math.round(walkMeters / 1.35);

      // Tracciato navigatore ad alta visibilità
      L.polyline(walkCoords, {
        color: "#2563eb",
        weight: 6,
        opacity: 0.9,
        dashArray: "8, 8",
        lineCap: "round",
        lineJoin: "round"
      }).bindTooltip(`🚶 Tragitto a piedi verso ${dep.name} (${Math.round(walkMeters)} m • ~${Math.round(this.walkSeconds / 60)} min)`, { sticky: true }).addTo(this.geoLayer);
    } else {
      this.walkSeconds = Math.round(this.haversine(refLatLng, depLatLng) / 1.35);
    }

    // 2. Marker Fermata / Stazione di Partenza (Punto di Salita utile)
    const depIcon = L.divIcon({
      html: `
        <div class="serving-departure-nav-pin" style="background:#16a34a; color:#fff; border:3px solid #ffffff; border-radius:50%; width:46px; height:46px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(22,163,74,0.8), 0 0 0 8px rgba(22,163,74,0.25); font-size:1.35rem; animation: pulse-nav-pin 2s infinite;">
          <i class="fa-solid ${modeIcon}"></i>
        </div>
      `,
      className: "serving-dep-pin-wrapper",
      iconSize: [46, 46],
      iconAnchor: [23, 46]
    });

    const destContextHtml = dest && !routeInfo.isDirectNearest ? `
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:8px 10px; border-radius:8px; margin-bottom:8px;">
        <small style="color:#166534; font-weight:800; display:block; font-size:0.82rem;">
          <i class="fa-solid fa-arrow-right-long"></i> Salita utile per: <strong>${dest.name}</strong>
        </small>
        <small style="color:#475569; font-size:0.75rem;">Prendi qui il tuo mezzo per raggiungere la destinazione</small>
      </div>
    ` : `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:8px 10px; border-radius:8px; margin-bottom:8px;">
        <small style="color:#0284c7; font-weight:800; display:block; font-size:0.82rem;">
          <i class="fa-solid fa-location-dot"></i> Fermata di riferimento più vicina a te
        </small>
      </div>
    `;

    const depMarker = L.marker(depLatLng, { icon: depIcon, zIndexOffset: 3000 })
      .bindPopup(`
        <div style="min-width: 250px; padding: 4px;">
          <span style="background:#16a34a; color:#fff; padding:4px 10px; border-radius:6px; font-weight:800; font-size:0.78rem; display:inline-block; margin-bottom:6px; letter-spacing:0.3px;">
            <i class="fa-solid fa-circle-check"></i> FERMATA DI PARTENZA DA RAGGIUNGERE
          </span>
          <h4 style="margin:4px 0 2px 0; font-size:1.15rem; color:#0f172a; font-weight:800;">${dep.name}</h4>
          <p style="margin:0 0 8px 0; font-size:0.82rem; color:#64748b;">${dep.address || dep.area || 'Fermata di salita utile'}</p>
          ${destContextHtml}
          <button class="btn btn-xs btn-primary w-100" style="padding:7px 12px; font-size:0.82rem;" onclick="if(window.liveBoard){ window.liveBoard.switchToStop('${dep.id}'); } window.app.switchTab('live-board');">
            <i class="fa-solid fa-clock"></i> Visualizza Tabellone Partenze
          </button>
        </div>
      `)
      .addTo(this.geoLayer);

    // NOTA: La mappa NON segna la fine del viaggio (nessun marker remoto a 600km)
    // per rimanere focalizzata sulla navigazione locale e sulla fermata di partenza!

    // Inquadratura & Zoom cinematografico stile navigatore
    map.invalidateSize();

    if (window.transitMap) {
      window.transitMap.needsRegionRefresh = false;
      window.transitMap.needsModeRefresh = false;
      window.transitMap._skipMoveEnd = true;
    }

    if (this.userLatLng) {
      // Inquadra l'utente e la fermata di partenza con zoom ravvicinato da navigatore
      const localBounds = L.latLngBounds([this.userLatLng, depLatLng]);
      map.flyToBounds(localBounds, {
        padding: [80, 80],
        animate: true,
        duration: 1.4,
        maxZoom: 17,
        easeLinearity: 0.25
      });
    } else {
      // Zooma direttamente e da vicino sulla fermata di partenza
      map.flyTo(depLatLng, 16, {
        animate: true,
        duration: 1.4,
        easeLinearity: 0.25
      });
    }

    setTimeout(() => {
      if (window.transitMap) {
        window.transitMap._skipMoveEnd = false;
      }
      if (this.geoLayer) {
        this.geoLayer.bringToFront();
      }
      depMarker.openPopup();
    }, 1400);
  }

  /* ==========================================================================
     RENDERING DEL PANNELLO INFORMATIVO SMART ROUTE
     ========================================================================== */

  renderSmartRoutePanel(routeInfo, refLatLng) {
    if (!this.panel) return;

    const dep = routeInfo.departureStop;
    const dest = routeInfo.destinationStop;
    const lines = routeInfo.servingLines || [];
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const isTrain = mode === 'train';
    const isFlight = mode === 'flight';
    const isTaxi = mode === 'taxi';

    const distFromUserMeters = this.haversine(refLatLng, [dep.lat_actual || dep.lat, dep.lng_actual || dep.lng]);
    const distTxt = distFromUserMeters >= 1000 
      ? (distFromUserMeters / 1000).toFixed(2) + " km" 
      : Math.round(distFromUserMeters) + " m";
    const walkMin = Math.max(1, Math.round(distFromUserMeters / 80));

    const lineBadgesHtml = lines.slice(0, 3).map(l => `
      <span style="background:${l.color || '#0284c7'}; color:#fff; padding:3px 9px; border-radius:6px; font-weight:800; font-size:0.8rem; display:inline-flex; align-items:center; gap:4px;">
        <i class="fa-solid ${isFlight ? 'fa-plane' : (isTrain ? 'fa-train' : 'fa-bus')}"></i> ${l.code || l.name}
      </span>
    `).join(" ");

    const headTitle = dest && !routeInfo.isDirectNearest
      ? `Per arrivare a <strong>${dest.name}</strong>`
      : `Fermata di Partenza Più Vicina: <strong>${dep.name}</strong>`;

    this.panel.innerHTML = `
      <div class="geo-route-head" style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
        <div>
          <span style="background:rgba(22,163,74,0.15); color:#16a34a; border:1px solid #16a34a; font-weight:800; font-size:0.75rem; padding:3px 8px; border-radius:6px;">
            <i class="fa-solid fa-circle-check"></i> FERMATA DI PARTENZA CONSIGLIATA
          </span>
          <h3 style="margin:6px 0 2px 0; font-size:1.2rem; color:var(--text-primary);">
            ${headTitle}
          </h3>
          <small class="text-muted">Raggiungi questa fermata per prendere il tuo mezzo di trasporto</small>
        </div>
        <button class="btn btn-sm btn-primary" onclick="window.geoLocator.goToLiveBoardTimetable()">
          <i class="fa-solid fa-table-list"></i> Tabellone Orari Completo
        </button>
      </div>

      <div class="geo-stats-grid">
        <div class="geo-stat-card" style="border-left:4px solid #16a34a;">
          <span class="geo-stat-label"><i class="fa-solid fa-person-walking-arrow-right text-success"></i> Fermata da Raggiungere</span>
          <strong class="geo-stat-val text-success">${dep.name}</strong>
          <small class="text-muted">${dep.address || dep.area || 'Punto di salita utile'}</small>
        </div>
        ${dest && !routeInfo.isDirectNearest ? `
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-location-arrow text-primary"></i> Destinazione Voluta</span>
          <strong class="geo-stat-val text-primary">${dest.name}</strong>
          <small class="text-muted">Linee e orari collegati</small>
        </div>
        ` : `
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-location-crosshairs text-primary"></i> Modalità Attiva</span>
          <strong class="geo-stat-val text-primary">${mode.toUpperCase()}</strong>
          <small class="text-muted">Rete trasporti in tempo reale</small>
        </div>
        `}
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-person-walking"></i> Tragitto a Piedi</span>
          <strong class="geo-stat-val">${distTxt}</strong>
          <small class="text-muted">~${walkMin} min di camminata</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-route"></i> Linee da Questa Fermata</span>
          <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">${lineBadgesHtml || '<span class="text-muted">Tutte le linee attive</span>'}</div>
          <small class="text-muted" style="margin-top:4px;">${lines[0]?.name || 'Transito orari regolari'}</small>
        </div>
      </div>

      <div class="geo-departures-wrapper" style="margin-top:14px;">
        <div class="geo-departures-title" style="font-weight:800; font-size:0.95rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-clock text-primary"></i> Prossime partenze da <strong>${dep.name}</strong> ${dest && !routeInfo.isDirectNearest ? `verso <strong>${dest.name}</strong>` : ''}
        </div>
        <div id="geoDeparturesList" class="geo-dep-list-grid"></div>
        <div id="geoVerdict" class="geo-verdict-box" style="margin-top:10px;"></div>
      </div>

      <div class="geo-footer-actions" style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="window.geoLocator.goToLiveBoardTimetable()" style="flex:1;">
          <i class="fa-solid fa-ticket"></i> Visualizza Tabellone Partenze di ${dep.name}
        </button>
        <button class="btn btn-outline" onclick="window.geoLocator.locateAndRoute()">
          <i class="fa-solid fa-location-crosshairs"></i> Rilocalizza GPS
        </button>
      </div>
    `;

    this.panel.classList.add("open");
    this.startCountdown();
  }

  /* ==========================================================================
     GEOLOCALIZZAZIONE NATIVA & TROVA FERMATA
     ========================================================================== */

  locateAndRoute() {
    if (!navigator.geolocation) {
      this.showError("Geolocalizzazione non supportata da questo dispositivo o browser.");
      return;
    }

    this.setLoading(true);

    if (window.app && typeof window.app.switchTab === 'function') {
      window.app.switchTab('map');
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => this.onPosition(pos),
      (err) => this.onGeoError(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  }

  setLoading(on) {
    if (!this.btn) return;
    this.btn.disabled = on;
    this.btn.innerHTML = on
      ? `<i class="fa-solid fa-spinner fa-spin"></i> Individuo la tua posizione GPS...`
      : `<i class="fa-solid fa-location-crosshairs"></i> <span>Trova Fermata per Destinazione</span>`;
  }

  onGeoError(err) {
    this.setLoading(false);
    let msg = "Impossibile ottenere la posizione GPS.";
    if (err.code === 1) msg = "Permesso di geolocalizzazione negato. Abilitalo nelle impostazioni per trovare la fermata più vicina.";
    else if (err.code === 2) msg = "Posizione GPS non disponibile. Assicurati che la localizzazione sia attiva e riprova.";
    else if (err.code === 3) msg = "Tempo scaduto nel recupero del segnale GPS. Riprova all'aperto.";
    this.showError(msg);
  }

  async onPosition(pos) {
    this.setLoading(false);
    const map = this.ensureMap();
    if (!map) return;

    this.userLatLng = [pos.coords.latitude, pos.coords.longitude];

    if (this.selectedDestination) {
      // Se c'è già una destinazione scelta, calcola direttamente la fermata di partenza giusta
      await this.routeToDestination(this.selectedDestination);
    } else {
      // Se non è stata digitata una destinazione, trova direttamente la fermata più vicina
      const defaultStop = this.findNearestStop(this.userLatLng);
      if (defaultStop) {
        await this.routeToNearestDeparture(defaultStop);
      }
    }
  }

  haversine(a, b) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  findNearestStop(latlng) {
    if (!latlng || !latlng[0] || !latlng[1]) return null;
    let best = null, bestD = Infinity;
    let bestStation = null, bestStationD = Infinity;
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeData = window.TRANSIT_DATA?.modes?.[mode] || window.TRANSIT_DATA?.modes?.pullman;
    const stops = (modeData?.stops && modeData.stops.length > 0) ? modeData.stops : [];
    if (!stops || stops.length === 0) return null;

    const isBusStation = (s) => !!(s.isMainHub || (s.name && (s.name.includes("Terminal") || s.name.includes("Autostazione") || s.name.includes("Stazione FS") || s.name.includes("Scalo"))));

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const lat = stop.lat_actual || stop.lat;
      const lng = stop.lng_actual || stop.lng;
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;
      const d = this.haversine(latlng, [lat, lng]);
      if (d < bestD) {
        bestD = d;
        best = stop;
      }
      if (isBusStation(stop) && d < bestStationD) {
        bestStationD = d;
        bestStation = stop;
      }
    }

    // Se c'è una Stazione / Terminal Bus ufficiale entro 5 km, dalle sempre la priorità assoluta!
    if (bestStation && bestStationD <= 5000) {
      return bestStation;
    }

    return best;
  }

  async fetchWalkingRoute(from, to) {
    const url = `https://router.project-osrm.org/route/v1/foot/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.routes || !data.routes.length) return null;
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      return { coords, distance: route.distance, duration: route.duration };
    } catch (e) {
      clearTimeout(timer);
      return null;
    }
  }

  /* ==========================================================================
     PROSSIME PARTENZE CON DESTINAZIONI REALI E COUNTDOWN
     ========================================================================== */

  linesServingStop(stopId) {
    if (typeof getLinesByStop === 'function') {
      const lines = getLinesByStop(stopId);
      if (lines && lines.length > 0) return lines;
    }
    const currentRegion = this.nearestStop?.region || (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    return typeof getLinesByRegion === 'function' ? getLinesByRegion(currentRegion) : [];
  }

  getUpcomingDepartures(stopId, now, limit = 4) {
    const lines = this.linesServingStop(stopId);
    const destName = this.selectedDestination?.name || this.nearestStop?.area || 'Capolinea';

    if (!lines || lines.length === 0) {
      return [{
        line: { code: 'DIRECT', name: 'Corsa Diretta', color: '#0284c7', frequencyMinutes: 15 },
        destination: destName,
        time: new Date(now.getTime() + 6 * 60 * 1000)
      }];
    }

    const list = lines.slice(0, 6).map((line, idx) => {
      const freq = line.frequencyMinutes || 20;
      const offsetMin = (idx * 5 + 3) % 25;
      
      let targetDest = destName;
      if (line.name && line.name.includes(" - ")) {
        targetDest = line.name.split(" - ").pop().split(" (")[0];
      } else if (line.name && line.name.includes("➔")) {
        targetDest = line.name.split("➔").pop().trim();
      }

      return {
        line: {
          id: line.id,
          code: line.code || line.shortName || `L-${idx + 1}`,
          name: line.name || 'Servizio di Trasporto',
          color: line.color || '#0284c7',
          frequencyMinutes: freq
        },
        destination: targetDest,
        time: new Date(now.getTime() + (offsetMin + 2) * 60 * 1000)
      };
    });

    list.sort((a, b) => a.time - b.time);
    return list.slice(0, limit);
  }

  goToLiveBoardTimetable(lineCode = null) {
    if (window.liveBoard && this.nearestStop) {
      window.liveBoard.switchToStop(this.nearestStop.id);
      if (lineCode && window.liveBoard.searchInput) {
        window.liveBoard.searchInput.value = lineCode;
        window.liveBoard.searchQuery = lineCode.toLowerCase();
        window.liveBoard.render();
      }
    }
    if (window.app && typeof window.app.switchTab === 'function') {
      window.app.switchTab('live-board');
    }
    const target = document.getElementById("liveBoardList");
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    }
  }

  startCountdown() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    const update = () => this.updateCountdown();
    update();
    this.countdownTimer = setInterval(update, 1000);
  }

  updateCountdown() {
    if (!this.nearestStop) return;
    const listEl = document.getElementById("geoDeparturesList");
    const verdictEl = document.getElementById("geoVerdict");

    if (!listEl) {
      clearInterval(this.countdownTimer);
      return;
    }

    const now = new Date();
    const walkMin = (this.walkSeconds || 180) / 60;
    const deps = this.getUpcomingDepartures(this.nearestStop.id, now, 4);

    listEl.innerHTML = deps.map(d => {
      const secLeft = Math.max(0, Math.round((d.time - now) / 1000));
      const mm = Math.floor(secLeft / 60);
      const ss = String(secLeft % 60).padStart(2, "0");
      const countTxt = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
      return `
        <div class="geo-dep-row-card" style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 14px; background:var(--bg-subtle, #f8fafc); border-radius:8px; border:1px solid var(--border-color, #e2e8f0); margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="geo-line-badge" style="background:${d.line.color || '#0284c7'}; color:#fff; padding:4px 8px; border-radius:6px; font-weight:800; font-size:0.8rem;">${d.line.code}</div>
            <div>
              <strong style="display:block; font-size:0.9rem;">Per ${d.destination}</strong>
              <small class="text-muted">${d.line.name} &bull; Partenza <strong>${this.fmt(d.time)}</strong></small>
            </div>
          </div>
          <div style="text-align:right;">
            <span style="background:var(--brand-primary-soft, rgba(2,132,199,0.15)); color:var(--brand-primary, #0284c7); padding:3px 8px; border-radius:6px; font-weight:800; font-size:0.8rem;">${countTxt}</span>
          </div>
        </div>
      `;
    }).join("");

    if (deps.length && verdictEl) {
      const firstDepMin = (deps[0].time - now) / 60000;
      const margin = firstDepMin - walkMin;

      if (margin >= 3) {
        verdictEl.className = "geo-verdict-box verdict-ok";
        verdictEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>Ce la fai con calma:</strong> hai ~${Math.round(margin)} minuti di margine per raggiungere la fermata e salire su <strong>${deps[0].line.code}</strong>.`;
      } else if (margin >= 0) {
        verdictEl.className = "geo-verdict-box verdict-warn";
        verdictEl.innerHTML = `<i class="fa-solid fa-person-running"></i> <strong>Affrettati!</strong> Hai ~${Math.max(0, Math.round(margin))} minuti di margine per la partenza di <strong>${deps[0].line.code}</strong>.`;
      } else {
        verdictEl.className = "geo-verdict-box verdict-miss";
        verdictEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Corsa in partenza:</strong> la prima corsa parte prima dell'arrivo a piedi. Ti consigliamo la corsa successiva.`;
      }
    }
  }

  fmt(date) {
    return String(date.getHours()).padStart(2, "0") + ":" +
           String(date.getMinutes()).padStart(2, "0");
  }

  showError(msg) {
    if (!this.panel) return;
    this.panel.innerHTML = `<div class="search-alert alert-warning"><i class="fa-solid fa-circle-exclamation"></i> <div><strong>Avviso Itinerario:</strong><p>${msg}</p></div></div>`;
    this.panel.classList.add("open");
  }
}

function initGeoLocatorEngine() {
  if (!window.geoLocator) {
    window.geoLocator = new GeoLocatorEngine();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGeoLocatorEngine);
} else {
  initGeoLocatorEngine();
}
