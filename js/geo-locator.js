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

    // --- Stato NAVIGATORE in tempo reale ---
    this.watchId = null;              // id di navigator.geolocation.watchPosition (path browser)
    this.tracking = false;           // tracking GPS continuo attivo
    this.arrived = false;            // utente arrivato a destinazione
    this.userMarker = null;          // marker posizione utente (aggiornato live)
    this.depMarker = null;           // marker fermata di partenza
    this.destMarker = null;          // marker destinazione finale (bandierina)
    this.walkPolyline = null;        // tracciato a piedi utente -> fermata
    this.walkGlow = null;            // alone bianco sotto il tracciato a piedi
    this.busPolyline = null;         // tracciato del mezzo fermata -> destinazione
    this.busGlow = null;             // alone bianco sotto il tracciato del mezzo
    this.walkCoords = null;          // coordinate del tratto a piedi
    this.busCoords = null;           // coordinate del tratto in mezzo
    this.busRouteShown = false;      // il percorso del mezzo e' stato evidenziato
    this._followSuspendedUntil = 0;  // grace period per non contrastare le animazioni camera

    // --- Modello a TRATTE (itinerario multi-hop con cambi) ---
    this.navLegs = null;             // [{type:'walk'|'ride', coords, polyline, glow, revealed, ...}]
    this.activeItinerary = null;     // itinerario corrente (dal journey planner o fallback)
    this.legMarkers = [];            // segnaposto di salita/cambio/destinazione
    this.fullRouteShown = false;     // tutte le tratte sono state rivelate ("Visualizza Orari")

    // Modalita' camera: 'free' = la mappa NON torna al punto da sola (default);
    // 'auto' = segue la posizione dell'utente, zoomata (stile navigatore).
    this.followMode = 'free';

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
    this.stopLiveTracking();
    this.resetNavState();
    if (this.geoLayer) this.geoLayer.clearLayers();
    if (this.panel) this.panel.classList.remove("open");
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  /* Azzera tutti i riferimenti a marker/tracciati del navigatore */
  resetNavState() {
    this.userMarker = null;
    this.depMarker = null;
    this.destMarker = null;
    this.walkPolyline = null;
    this.walkGlow = null;
    this.busPolyline = null;
    this.busGlow = null;
    this.walkCoords = null;
    this.busCoords = null;
    this.busRouteShown = false;
    this.arrived = false;
    // Modello a tratte (itinerario multi-hop)
    this.navLegs = null;
    this.activeItinerary = null;
    this.legMarkers = [];
    this.fullRouteShown = false;
    this.followMode = 'free';
    this.hideNavControls();
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

  /* Nome regione leggibile (es. 'emilia_romagna' -> 'Emilia Romagna') */
  regionLabel(regionId) {
    if (!regionId) return '';
    const r = typeof getRegionById === 'function' ? getRegionById(regionId) : null;
    if (r && r.name) return r.name;
    return String(regionId).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  /* Nome-base della localita' (senza dettagli tra parentesi / dopo " - "),
     usato per capire quando due fermate si chiamano uguale in regioni diverse. */
  _basePlaceName(stop) {
    let s = (stop.area || stop.name || '').toString();
    s = s.split('(')[0].split(' - ')[0].split(',')[0];
    return s.trim().toLowerCase();
  }

  /* Indice GLOBALE delle localita' omonime tra regioni (calcolato una volta per
     modalita'). Esclude vie/piazze/fermate: conta solo i nomi di localita' che
     esistono in piu' di una regione (es. "rivarolo" in Piemonte e Liguria). */
  _ambiguityIndex() {
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeData = window.TRANSIT_DATA?.modes?.[mode] || window.TRANSIT_DATA?.modes?.pullman;
    const stops = (modeData && modeData.stops) || [];
    if (this._ambIdx && this._ambIdxMode === mode && this._ambIdxCount === stops.length) {
      return this._ambIdx;
    }
    const STREET = /^(via|viale|v\.le|piazza|p\.?zza|p\.za|corso|c\.so|strada|str\.|s\.s\.|s\.p\.|sp\b|ss\b|largo|vico|vicolo|salita|contrada|c\.da|localit|loc\.|traversa|rotonda|rotatoria|bivio|svincolo|km|autostazione|stazione|terminal|capolinea|fermata|banchina|parcheggio|ospedale|scuola|chiesa|cimitero|municipio|comune)\b/i;
    const map = new Map();
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const base = this._basePlaceName(s);
      if (!base || base.length < 3 || STREET.test(base)) continue;
      let set = map.get(base);
      if (!set) { set = new Set(); map.set(base, set); }
      set.add(s.region);
    }
    this._ambIdx = map; this._ambIdxMode = mode; this._ambIdxCount = stops.length;
    return map;
  }

  /* Marca come "ambigui" i risultati il cui nome (localita') esiste in piu'
     regioni: per quelli mostriamo la regione bene in evidenza. */
  _markAmbiguity(list) {
    if (!list || !list.length) return list;
    const idx = this._ambiguityIndex();
    for (const it of list) {
      const key = it.baseName || (it.name || '').toLowerCase();
      const set = idx.get(key);
      it.ambiguous = !!(set && set.size > 1);
    }
    return list;
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

      const regId = s.region || currentRegion;
      return {
        id: s.id,
        uniqueKey: `dest_${s.id}`,
        name: s.name,
        area: s.area || s.name.split(' - ')[0],
        region: regId,
        regionName: this.regionLabel(regId),
        baseName: this._basePlaceName(s),
        ambiguous: false,
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
      return this._markAmbiguity(results);
    }

    // Ricerca per nome o area. I risultati della REGIONE ATTIVA hanno priorita'
    // (evita di scegliere per sbaglio un'omonima in un'altra regione, es.
    // "Alessandria" -> Alessandria del Carretto in Calabria mentre sei in Piemonte).
    const inRegion = [];
    const others = [];
    for (let i = 0; i < allStops.length; i++) {
      const s = allStops[i];
      const n = s.name || '';
      const a = s.area || '';
      if (n.toLowerCase().includes(q) || a.toLowerCase().includes(q)) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          const item = formatDest(s, !!s.isMainHub);
          if (s.region === currentRegion) inRegion.push(item); else others.push(item);
          if (inRegion.length + others.length >= maxLimit * 2) break;
        }
      }
    }
    return this._markAmbiguity(inRegion.concat(others).slice(0, maxLimit));
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
        const regionName = dest.regionName || dest.region || 'Rete Nazionale';
        const areaTxt = (dest.area && dest.area.toLowerCase() !== regionName.toLowerCase()) ? (dest.area + ' · ') : '';
        const regionChip = dest.ambiguous
          ? `<span class="dest-item-region amb" title="Nome presente in piu' regioni"><i class="fa-solid fa-location-dot"></i> ${regionName}</span>`
          : `<span class="dest-item-region"><i class="fa-solid fa-map-pin"></i> ${regionName}</span>`;
        html += `
          <div class="dest-dropdown-item ${isSel ? 'active' : ''}" data-dest-key="${dest.uniqueKey}">
            <div class="dest-item-main">
              <div class="dest-item-icon"><i class="fa-solid ${dest.icon || 'fa-location-dot'}"></i></div>
              <div class="dest-item-text">
                <span class="dest-item-name">${dest.name}</span>
                <span class="dest-item-meta">${areaTxt}${regionChip}</span>
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
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (found) this.selectDestination(found);
      });
      el.addEventListener("touchstart", (e) => {
        e.preventDefault();
        if (found) this.selectDestination(found);
      }, {passive: false});
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
      if (localStorage.getItem('premium_unlocked') !== 'true') {
        if (typeof window.showAppAd === 'function') window.showAppAd();
      }
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

      // Costruisce l'itinerario completo (multi-tratta con cambi automatici se serve)
      const itinerary = await this.buildItinerary(dest, refLatLng);
      if (!itinerary || !itinerary.legs || itinerary.legs.length === 0) {
        this.showNoRouteError(dest, refLatLng);
        return;
      }

      this.setActiveItinerary(itinerary, refLatLng);

      // Migliora il primo tratto a piedi con la geometria pedonale reale (OSRM)
      await this.enhanceOriginWalkGeometry();

      // Disegna l'itinerario sulla mappa (mostra il primo tratto a piedi + i segnaposto del piano)
      this.drawNavLegs(refLatLng);

      // Renderizza il pannello con le indicazioni passo-passo
      this.renderItineraryPanel(refLatLng);

      // Notifica di sistema
      if (window.notificationManager) {
        const board = this.nearestStop;
        const extra = itinerary.transfers > 0
          ? `Percorso con ${itinerary.transfers} cambio${itinerary.transfers > 1 ? 'i' : ''}: segui le indicazioni passo-passo.`
          : `Sali a ${board.name} e raggiungi ${dest.name}.`;
        window.notificationManager.send(
          `Itinerario pronto per ${dest.name} 🧭`,
          extra,
          { type: "success", icon: "fa-route", tabTarget: "map", showToast: true, sendNative: false }
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
      const stopLL = [stop.lat_actual || stop.lat, stop.lng_actual || stop.lng];

      // Itinerario a tratta singola: solo camminata fino alla fermata piu' vicina
      const itinerary = {
        legs: [{
          type: 'walk',
          isOrigin: true,
          fromLatLng: refLatLng,
          toStop: stop,
          toName: stop.name,
          coords: [refLatLng, stopLL],
          meters: Math.round(this.haversine(refLatLng, stopLL)),
          seconds: Math.round(this.haversine(refLatLng, stopLL) / 1.35),
          elevGain: null
        }],
        transfers: 0,
        rideCount: 0,
        totalWalkMeters: Math.round(this.haversine(refLatLng, stopLL)),
        totalRideMeters: 0,
        rideStops: 0,
        destinationStop: null,
        isDirectNearest: true
      };

      this.setActiveItinerary(itinerary, refLatLng);
      await this.enhanceOriginWalkGeometry();
      this.drawNavLegs(refLatLng);
      this.renderSmartRoutePanel(this.activeRouteInfo, refLatLng);

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
     COSTRUZIONE ITINERARIO (multi-tratta con cambi automatici)
     ========================================================================== */

  async buildItinerary(dest, refLatLng) {
    const destStop = dest.stop || { id: dest.id, name: dest.name, lat: dest.lat, lng: dest.lng };

    // 0) Se configurata la chiave Google, usa i percorsi REALI di Google Maps
    //    (trasporto pubblico). Senza chiave questo blocco e' inattivo.
    if (window.gmapsDirections && window.gmapsDirections.available()) {
      try {
        const gIt = await window.gmapsDirections.plan(refLatLng, destStop, {});
        if (gIt && gIt.legs && gIt.legs.length) return gIt;
      } catch (e) {
        console.warn("Google Directions non disponibile, uso il pianificatore locale:", e);
      }
    }

    // 1) Pianificatore multi-hop: trova a piedi + mezzi + cambi fino a destinazione
    let itinerary = null;
    if (window.journeyPlanner && destStop.id) {
      try {
        itinerary = await window.journeyPlanner.plan(refLatLng, destStop, {});
      } catch (e) {
        console.warn("journeyPlanner error:", e);
      }
    }
    if (itinerary && itinerary.legs && itinerary.rideCount >= 1) {
      return itinerary;
    }

    // 2) Fallback LOCALE: fermata servente piu' vicina + tratto diretto (rete Calabria)
    const localFb = this._localDirectFallback(dest, refLatLng);
    if (localFb) return localFb;

    // 3) Rete pubblica REALE nazionale (Transitous/MOTIS, gratis, senza chiave):
    //    copre le tratte lunghe/interregionali che la rete locale non ha, con
    //    bus + treni + metro e orari reali (come Google Maps).
    if (window.transitousRouting && window.transitousRouting.available()) {
      try {
        const tt = await window.transitousRouting.plan(refLatLng, destStop, {});
        if (tt && tt.legs && tt.rideCount >= 1) return tt;
      } catch (e) {
        console.warn("transitous fallback error:", e);
      }
    }

    return null;
  }

  /* Fallback locale: fermata servente piu' vicina + tratto diretto del mezzo.
     Ritorna null se non esiste una linea reale o la fermata e' troppo lontana
     (evita corse fittizie in linea retta). */
  _localDirectFallback(dest, refLatLng) {
    const routeInfo = this.findServingDepartureStop(dest, refLatLng);
    if (!routeInfo || !routeInfo.departureStop) return null;

    const depStop = routeInfo.departureStop;
    const depLL = [depStop.lat_actual || depStop.lat, depStop.lng_actual || depStop.lng];
    const destObj = routeInfo.destinationStop;
    const destLL = [destObj.lat_actual || destObj.lat, destObj.lng_actual || destObj.lng];
    const busCoords = this.computeBusLegCoords(routeInfo);
    const walkMeters = this.haversine(refLatLng, depLL);
    if (!busCoords || busCoords.length < 2 || walkMeters > 25000) return null;

    const rideMeters = this.haversine(depLL, destLL);
    const line = (routeInfo.servingLines && routeInfo.servingLines[0]) || null;
    const legs = [
      { type: 'walk', isOrigin: true, fromLatLng: refLatLng, toStop: depStop, toName: depStop.name,
        coords: [refLatLng, depLL], meters: Math.round(walkMeters), seconds: Math.round(walkMeters / 1.35), elevGain: null },
      { type: 'ride', line: line, boardStop: depStop, alightStop: destObj,
        boardName: depStop.name, alightName: destObj.name, coords: busCoords,
        stopsCount: Math.max(1, busCoords.length - 1), meters: Math.round(rideMeters) }
    ];
    return {
      legs, transfers: 0, rideCount: 1,
      totalWalkMeters: Math.round(walkMeters), totalRideMeters: Math.round(rideMeters),
      rideStops: legs[1].stopsCount, destinationStop: destObj, servingLines: routeInfo.servingLines
    };
  }

  setActiveItinerary(itinerary, refLatLng) {
    this.activeItinerary = itinerary;
    this.arrived = false;
    // Evidenzia SUBITO l'intero percorso sulla mappa (tutti i tratti + cambi),
    // cosi' e' ben visibile fin da subito.
    this.fullRouteShown = true;

    this.navLegs = itinerary.legs.map((lg) => Object.assign({}, lg, {
      revealed: true,
      polyline: null, glow: null
    }));

    const firstRide = itinerary.legs.find(l => l.type === 'ride');
    const firstWalk = itinerary.legs.find(l => l.type === 'walk' && l.isOrigin);
    const boardStop = firstRide ? firstRide.boardStop : (firstWalk ? firstWalk.toStop : null);
    this.nearestStop = boardStop || this.nearestStop;

    const lines = itinerary.legs.filter(l => l.type === 'ride').map(l => l.line).filter(Boolean);
    this.activeRouteInfo = {
      departureStop: boardStop,
      destinationStop: itinerary.destinationStop,
      servingLines: lines.length ? lines : (boardStop ? this.linesServingStop(boardStop.id) : []),
      isDirectNearest: !!itinerary.isDirectNearest
    };

    // Sincronizza il tabellone live con la prima fermata di salita
    if (boardStop && window.liveBoard) {
      window.liveBoard.activeStopId = boardStop.id;
      if (window.liveBoard.filterHubSelect) window.liveBoard.filterHubSelect.value = boardStop.id;
      window.liveBoard.generateInitialDepartures();
      window.liveBoard.render();
    }
  }

  /* Migliora la geometria del primo tratto a piedi con il percorso pedonale reale */
  async enhanceOriginWalkGeometry() {
    if (!this.navLegs) return;
    const leg = this.navLegs.find(l => l.type === 'walk' && l.isOrigin);
    if (!leg || !leg.coords || leg.coords.length < 2) return;
    const from = leg.coords[0];
    const to = leg.coords[leg.coords.length - 1];
    const meters = this.haversine(from, to);
    if (meters >= 50000 || meters < 15) return;
    try {
      const r = await this.fetchWalkingRoute(from, to);
      if (r && r.coords && r.coords.length > 1) {
        leg.coords = r.coords.map(c => [c[0], c[1]]);
        if (r.distance) leg.meters = Math.round(r.distance);
        if (r.duration) { leg.seconds = Math.round(r.duration); this.walkSeconds = leg.seconds; }
      }
    } catch (e) { /* fallback: linea retta gia' presente */ }
  }

  /* ==========================================================================
     DISEGNO DELL'ITINERARIO A TRATTE SULLA MAPPA (STILE NAVIGATORE)
     ========================================================================== */

  drawNavLegs(refLatLng) {
    const map = this.ensureMap();
    if (!map || !this.geoLayer || !this.navLegs) return;

    this.geoLayer.clearLayers();
    // Azzera SOLO i riferimenti ai layer (mantiene navLegs / itinerario)
    this.userMarker = null; this.depMarker = null; this.destMarker = null; this.legMarkers = [];
    this.walkPolyline = null; this.walkGlow = null; this.busPolyline = null; this.busGlow = null;

    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeIcon = currentMode === 'flight' ? 'fa-plane-departure'
      : (currentMode === 'train' ? 'fa-train'
      : (currentMode === 'taxi' ? 'fa-taxi'
      : (currentMode === 'tram' ? 'fa-train-tram' : 'fa-bus')));

    // Marker posizione utente (live)
    const startLL = this.userLatLng || refLatLng;
    if (startLL) {
      const userIcon = L.divIcon({
        html: `<div class="user-gps-pulse-pin"><span class="gps-core-dot"></span></div>`,
        className: "user-gps-pin-wrapper", iconSize: [28, 28], iconAnchor: [14, 14]
      });
      this.userMarker = L.marker(startLL, { icon: userIcon, zIndexOffset: 2000 })
        .bindPopup(`<strong>📍 La tua Posizione Attuale</strong>`)
        .addTo(this.geoLayer);
    }

    // Polilinee per ogni tratta (rivelate solo se leg.revealed)
    for (let i = 0; i < this.navLegs.length; i++) {
      const leg = this.navLegs[i];
      if (!leg.coords || leg.coords.length < 2) continue;
      const isRide = leg.type === 'ride';
      const color = isRide ? ((leg.line && leg.line.color) || '#0284c7') : (leg.isOrigin ? '#2563eb' : '#ea580c');
      const shown = leg.revealed ? leg.coords : [];

      leg.glow = L.polyline(shown, {
        color: '#ffffff', weight: isRide ? 12 : 11, opacity: 0.82, lineCap: 'round', lineJoin: 'round'
      }).addTo(this.geoLayer);

      if (isRide) {
        leg.polyline = L.polyline(shown, {
          color, weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round'
        }).bindTooltip(`<strong>${leg.line ? (leg.line.code || leg.line.name) : 'Mezzo'}</strong> ➔ ${leg.alightName || ''}`,
          { sticky: true, className: 'custom-map-tooltip' }).addTo(this.geoLayer);
      } else {
        leg.polyline = L.polyline(shown, {
          color, weight: 6, opacity: 0.95, dashArray: '8, 8', lineCap: 'round', lineJoin: 'round', className: 'walking-route-polyline'
        }).bindTooltip(`🚶 ${leg.meters} m • ~${Math.max(1, Math.round((leg.seconds || leg.meters / 1.35) / 60))} min a piedi`,
          { sticky: true }).addTo(this.geoLayer);
      }
    }

    // Segnaposto di salita / cambio / destinazione
    this._drawItineraryMarkers(modeIcon);

    // Controlli camera (Auto/Libera/Centra/Vedi percorso)
    this.showNavControls();

    // Se l'utente trascina la mappa mentre e' in Auto, passa a Libera
    // (cosi' la mappa non "combatte" e non torna al punto da sola).
    if (!this._dragHandlerBound && map) {
      this._dragHandlerBound = true;
      map.on('dragstart', () => {
        if (this.followMode === 'auto') {
          this.followMode = 'free';
          this.updateNavControlsUI();
        }
      });
    }

    // Vista iniziale: l'INTERO percorso (per vedere subito tratti e cambi). Default: LIBERA.
    map.invalidateSize();
    this.followMode = 'free';
    this._followSuspendedUntil = Date.now() + 2200;
    if (window.transitMap) {
      window.transitMap.needsRegionRefresh = false;
      window.transitMap.needsModeRefresh = false;
      window.transitMap._skipMoveEnd = true;
    }

    try {
      const all = [];
      if (startLL) all.push(startLL);
      for (const leg of this.navLegs) if (leg.coords) for (const c of leg.coords) all.push(c);
      const b = L.latLngBounds(all);
      if (b.isValid()) {
        map.flyToBounds(b, { padding: [60, 60], animate: true, duration: 1.2, maxZoom: 16, easeLinearity: 0.25 });
      } else if (startLL) {
        map.flyTo(startLL, 15, { animate: true, duration: 1.2 });
      }
    } catch (e) {}

    setTimeout(() => {
      if (window.transitMap) window.transitMap._skipMoveEnd = false;
      if (this.geoLayer) this.geoLayer.bringToFront();
    }, 1300);
  }

  _drawItineraryMarkers(modeIcon) {
    const legs = this.navLegs;
    if (!legs) return;
    const rideLegs = legs.filter(l => l.type === 'ride');
    const destStop = this.activeItinerary && this.activeItinerary.destinationStop;

    rideLegs.forEach((leg, idx) => {
      const b = leg.boardStop;
      if (!b) return;
      const bLL = [b.lat_actual || b.lat, b.lng_actual || b.lng];
      const code = leg.line ? (leg.line.code || 'Mezzo') : 'Mezzo';
      const color = (leg.line && leg.line.color) || '#16a34a';
      const isFirst = idx === 0;
      const prevCode = (idx > 0 && rideLegs[idx - 1].line) ? (rideLegs[idx - 1].line.code || 'mezzo') : '';
      const transferNo = idx; // per idx>=1 e' il numero del cambio

      let m;
      if (isFirst) {
        // Punto di SALITA (verde, pulsante)
        const pin = L.divIcon({
          html: `<div class="serving-departure-nav-pin" style="background:#16a34a;color:#fff;border:3px solid #fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(22,163,74,0.7),0 0 0 6px rgba(22,163,74,0.22);font-size:1.05rem;animation:pulse-nav-pin 2s infinite;"><i class="fa-solid ${modeIcon}"></i></div>`,
          className: 'serving-dep-pin-wrapper', iconSize: [44, 44], iconAnchor: [22, 44]
        });
        m = L.marker(bLL, { icon: pin, zIndexOffset: 3000 }).bindPopup(
          `<div style="min-width:230px;padding:4px;"><span style="background:#16a34a;color:#fff;padding:4px 10px;border-radius:6px;font-weight:800;font-size:0.76rem;display:inline-block;margin-bottom:6px;"><i class="fa-solid fa-circle-check"></i> SALI QUI</span><h4 style="margin:4px 0 2px 0;font-size:1.05rem;color:#0f172a;font-weight:800;">${b.name}</h4><p style="margin:0;font-size:0.82rem;color:#0f172a;"><i class="fa-solid ${modeIcon}" style="color:${color}"></i> Prendi <strong>${code}</strong> e scendi a <strong>${leg.alightName || ''}</strong></p></div>`
        ).addTo(this.geoLayer);
        m.bindTooltip(`Sali: ${code}`, { permanent: true, direction: 'top', offset: [0, -40], className: 'geo-change-label geo-change-board' });
        this.depMarker = m;
      } else {
        // Punto di CAMBIO (arancione, con numero + etichetta permanente)
        const pin = L.divIcon({
          html: `<div class="geo-transfer-pin" style="background:#ea580c;color:#fff;border:3px solid #fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(234,88,12,0.7),0 0 0 6px rgba(234,88,12,0.22);position:relative;"><i class="fa-solid fa-arrows-rotate"></i><span style="position:absolute;top:-7px;right:-7px;background:#0f172a;color:#fff;border-radius:50%;width:19px;height:19px;font-size:0.72rem;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;">${transferNo}</span></div>`,
          className: 'geo-transfer-pin-wrapper', iconSize: [40, 40], iconAnchor: [20, 40]
        });
        m = L.marker(bLL, { icon: pin, zIndexOffset: 3000 }).bindPopup(
          `<div style="min-width:240px;padding:4px;"><span style="background:#ea580c;color:#fff;padding:4px 10px;border-radius:6px;font-weight:800;font-size:0.76rem;display:inline-block;margin-bottom:6px;"><i class="fa-solid fa-arrows-rotate"></i> CAMBIO ${transferNo}</span><h4 style="margin:4px 0 4px 0;font-size:1.02rem;color:#0f172a;font-weight:800;">${b.name}</h4><p style="margin:0 0 3px 0;font-size:0.82rem;color:#0f172a;"><i class="fa-solid fa-arrow-down text-danger"></i> Scendi da <strong>${prevCode}</strong></p><p style="margin:0;font-size:0.82rem;color:#0f172a;"><i class="fa-solid ${modeIcon}" style="color:${color}"></i> Prendi <strong>${code}</strong> e scendi a <strong>${leg.alightName || ''}</strong></p></div>`
        ).addTo(this.geoLayer);
        m.bindTooltip(`Cambio ${transferNo}: ${prevCode} ➔ ${code}`, { permanent: true, direction: 'top', offset: [0, -36], className: 'geo-change-label geo-change-transfer' });
      }
      this.legMarkers.push(m);

      // Se tra questa discesa e il cambio successivo si cammina (fermate diverse),
      // segna il punto di discesa "scendi e cammina".
      const a = leg.alightStop;
      const nextBoard = rideLegs[idx + 1] ? rideLegs[idx + 1].boardStop : null;
      const isFinalAlight = destStop && a && a.id === destStop.id;
      const sameAsNextBoard = nextBoard && a && nextBoard.id === a.id;
      if (a && !isFinalAlight && !sameAsNextBoard) {
        const aLL = [a.lat_actual || a.lat, a.lng_actual || a.lng];
        const apin = L.divIcon({
          html: `<div style="background:#f59e0b;color:#0f172a;border:2px solid #fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(245,158,11,0.6);"><i class="fa-solid fa-person-walking"></i></div>`,
          className: 'target-marker-wrapper', iconSize: [28, 28], iconAnchor: [14, 28]
        });
        const am = L.marker(aLL, { icon: apin, zIndexOffset: 2400 })
          .bindPopup(`<strong>Scendi a ${a.name}</strong><br><small>Poi cammina fino al cambio ${idx + 1}</small>`)
          .addTo(this.geoLayer);
        this.legMarkers.push(am);
      }
    });

    // Destinazione finale
    if (destStop) {
      const dLL = [destStop.lat_actual || destStop.lat, destStop.lng_actual || destStop.lng];
      const color = (rideLegs.length && rideLegs[rideLegs.length - 1].line && rideLegs[rideLegs.length - 1].line.color) || '#0284c7';
      const dIcon = L.divIcon({
        html: `<div class="target-alt-marker-pulse" style="background:${color};"><i class="fa-solid fa-flag-checkered"></i></div>`,
        className: 'target-marker-wrapper', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30]
      });
      this.destMarker = L.marker(dLL, { icon: dIcon, zIndexOffset: 2600 }).bindPopup(
        `<div style="min-width:200px;padding:4px;"><span style="background:${color};color:#fff;padding:4px 10px;border-radius:6px;font-weight:800;font-size:0.76rem;"><i class="fa-solid fa-flag-checkered"></i> DESTINAZIONE</span><h4 style="margin:4px 0 2px;font-size:1.05rem;color:#0f172a;font-weight:800;">${destStop.name}</h4></div>`
      ).addTo(this.geoLayer);
      this.legMarkers.push(this.destMarker);
    }

    // Caso "fermata piu' vicina" senza destinazione: marker sulla fermata a piedi
    if (rideLegs.length === 0) {
      const w = legs.find(l => l.type === 'walk');
      if (w && w.toStop) {
        const s = w.toStop;
        const sLL = [s.lat_actual || s.lat, s.lng_actual || s.lng];
        const pin = L.divIcon({
          html: `<div class="serving-departure-nav-pin" style="background:#16a34a;color:#fff;border:3px solid #fff;border-radius:50%;width:46px;height:46px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(22,163,74,0.8),0 0 0 8px rgba(22,163,74,0.25);font-size:1.35rem;animation:pulse-nav-pin 2s infinite;"><i class="fa-solid ${modeIcon}"></i></div>`,
          className: 'serving-dep-pin-wrapper', iconSize: [46, 46], iconAnchor: [23, 46]
        });
        this.depMarker = L.marker(sLL, { icon: pin, zIndexOffset: 3000 }).bindPopup(
          `<div style="min-width:220px;padding:4px;"><span style="background:#16a34a;color:#fff;padding:4px 10px;border-radius:6px;font-weight:800;font-size:0.76rem;"><i class="fa-solid fa-location-dot"></i> FERMATA PIU' VICINA</span><h4 style="margin:4px 0 2px;font-size:1.05rem;color:#0f172a;font-weight:800;">${s.name}</h4></div>`
        ).addTo(this.geoLayer);
        this.legMarkers.push(this.depMarker);
      }
    }
  }

  /* Rivela tutte le tratte del mezzo (chiamato da "Visualizza Orari") */
  revealFullItinerary() {
    const map = this.ensureMap();
    if (!map || !this.navLegs) return;
    this.fullRouteShown = true;
    this.busRouteShown = true;

    for (const leg of this.navLegs) {
      leg.revealed = true;
      if (leg.polyline) leg.polyline.setLatLngs(leg.coords);
      if (leg.glow) leg.glow.setLatLngs(leg.coords);
    }

    if (window.transitMap) window.transitMap._skipMoveEnd = true;
    this._followSuspendedUntil = Date.now() + 3000;
    try {
      const all = [];
      if (this.userLatLng) all.push(this.userLatLng);
      for (const leg of this.navLegs) if (leg.coords) for (const c of leg.coords) all.push(c);
      const b = L.latLngBounds(all);
      if (b.isValid()) map.flyToBounds(b, { padding: [70, 70], maxZoom: 15, duration: 1.2 });
    } catch (e) {}
    setTimeout(() => { if (window.transitMap) window.transitMap._skipMoveEnd = false; }, 1400);

    if (!this.tracking && this.userLatLng) this.startLiveTracking();

    if (window.notificationManager) {
      const dest = this.activeItinerary && this.activeItinerary.destinationStop;
      window.notificationManager.send(
        `Percorso completo evidenziato 🗺️`,
        `Segui le tratte fino a ${dest ? dest.name : 'destinazione'}. Il percorso si accorcia mentre avanzi.`,
        { type: "info", icon: "fa-route", tabTarget: "map", showToast: true, sendNative: false }
      );
    }
  }

  /* ==========================================================================
     DISEGNO VETTORIALE SULLA MAPPA LEAFLET (LEGACY - non piu' in uso)
     ========================================================================== */

  async drawSmartRouteOnMap(routeInfo, refLatLng) {
    const map = this.ensureMap();
    if (!map || !this.geoLayer) return;

    this.geoLayer.clearLayers();
    // Un nuovo itinerario azzera i tracciati precedenti (mantiene userLatLng)
    this.resetNavState();

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
      this.userMarker = L.marker(this.userLatLng, { icon: userIcon, zIndexOffset: 2000 })
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

      // Memorizza la geometria del tratto a piedi per il trimming in tempo reale
      this.walkCoords = walkCoords.map(c => [c[0], c[1]]);

      // Alone bianco sotto il tracciato per massima leggibilita' su mappa
      this.walkGlow = L.polyline(walkCoords, {
        color: "#ffffff",
        weight: 11,
        opacity: 0.75,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(this.geoLayer);

      // Tracciato navigatore ad alta visibilità (utente -> fermata)
      this.walkPolyline = L.polyline(walkCoords, {
        color: "#2563eb",
        weight: 6,
        opacity: 0.95,
        dashArray: "8, 8",
        lineCap: "round",
        lineJoin: "round",
        className: "walking-route-polyline"
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

    const depMarker = this.depMarker = L.marker(depLatLng, { icon: depIcon, zIndexOffset: 3000 })
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

    // Evita che il follow del tracking contrasti l'animazione cinematografica iniziale
    this._followSuspendedUntil = Date.now() + 2200;

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
     PERCORSO DEL MEZZO: FERMATA DI PARTENZA -> DESTINAZIONE
     Innescato da "Visualizza Orari". Evidenzia il tragitto che fa il mezzo
     SENZA rimuovere il percorso a piedi dell'utente fino alla fermata.
     ========================================================================== */

  /* Calcola la sequenza di coordinate del mezzo tra fermata di partenza e destinazione,
     seguendo le fermate intermedie della linea che le serve entrambe. */
  computeBusLegCoords(routeInfo) {
    const dep = routeInfo.departureStop;
    const dest = routeInfo.destinationStop;
    if (!dep || !dest) return null;

    const depLL = [dep.lat_actual || dep.lat, dep.lng_actual || dep.lng];
    const destLL = [dest.lat_actual || dest.lat, dest.lng_actual || dest.lng];
    const lines = routeInfo.servingLines || [];

    for (let i = 0; i < lines.length; i++) {
      const ids = lines[i].stopsIds || lines[i].stops || [];
      if (!ids || ids.length < 2) continue;
      const di = ids.indexOf(dep.id);
      const ti = ids.indexOf(dest.id);
      if (di === -1 || ti === -1 || di === ti) continue;

      // Rispetta il verso di marcia della linea
      const seq = di < ti ? ids.slice(di, ti + 1) : ids.slice(ti, di + 1).reverse();
      const coords = [];
      for (let k = 0; k < seq.length; k++) {
        const s = typeof getStopById === 'function' ? getStopById(seq[k]) : null;
        if (s) coords.push([s.lat_actual || s.lat, s.lng_actual || s.lng]);
      }
      if (coords.length >= 2) return coords;
    }

    // Nessuna linea collega davvero partenza e destinazione.
    // Per il TAXI la corsa diretta punto-punto e' legittima (linea retta);
    // per bus/treno/tram/volo NON inventiamo una corsa -> null (irraggiungibile).
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    if (mode === 'taxi') return [depLL, destLL];
    return null;
  }

  /* Gestore del pulsante "Visualizza Orari": evidenzia il percorso del mezzo
     sulla mappa (tenendo il percorso a piedi) e mostra gli orari. */
  onVisualizzaOrari() {
    const info = this.activeRouteInfo;
    if (this.navLegs && info && info.destinationStop && !info.isDirectNearest) {
      // Il percorso e' gia' evidenziato sulla mappa: inquadra l'intero tragitto
      // (con i cambi) e scorri agli orari.
      this.fitWholeRoute();
      const list = document.getElementById("geoStepsList") || document.getElementById("geoDeparturesList");
      if (list) setTimeout(() => list.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    } else {
      // Nessuna destinazione scelta: apri direttamente il tabellone completo
      this.goToLiveBoardTimetable();
    }
  }

  highlightBusRouteToDestination() {
    const map = this.ensureMap();
    if (!map || !this.geoLayer || !this.activeRouteInfo) return;

    const routeInfo = this.activeRouteInfo;
    const dest = routeInfo.destinationStop;
    if (!dest) return;

    const busCoords = this.computeBusLegCoords(routeInfo);
    if (!busCoords || busCoords.length < 2) return;

    this.busCoords = busCoords.map(c => [c[0], c[1]]);
    this.busRouteShown = true;

    const line = (routeInfo.servingLines && routeInfo.servingLines[0]) || null;
    const color = (line && line.color) || '#0284c7';

    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    let modeIcon = 'fa-bus';
    if (currentMode === 'flight') modeIcon = 'fa-plane';
    else if (currentMode === 'train') modeIcon = 'fa-train';
    else if (currentMode === 'taxi') modeIcon = 'fa-taxi';
    else if (currentMode === 'tram') modeIcon = 'fa-train-tram';

    // Rimuovi eventuale evidenziazione precedente
    if (this.busGlow) { this.geoLayer.removeLayer(this.busGlow); this.busGlow = null; }
    if (this.busPolyline) { this.geoLayer.removeLayer(this.busPolyline); this.busPolyline = null; }
    if (this.destMarker) { this.geoLayer.removeLayer(this.destMarker); this.destMarker = null; }

    // Alone bianco + linea colorata del percorso del mezzo
    this.busGlow = L.polyline(busCoords, {
      color: '#ffffff', weight: 12, opacity: 0.9, lineJoin: 'round', lineCap: 'round'
    }).addTo(this.geoLayer);

    this.busPolyline = L.polyline(busCoords, {
      color: color, weight: 6, opacity: 1, lineJoin: 'round', lineCap: 'round'
    }).bindTooltip(
      `<strong>${line ? (line.code || line.name) : 'Mezzo'}</strong> ➔ ${dest.name}`,
      { sticky: true, className: 'custom-map-tooltip' }
    ).addTo(this.geoLayer);

    // Marker destinazione finale (bandierina a scacchi)
    const destLL = [dest.lat_actual || dest.lat, dest.lng_actual || dest.lng];
    const destIcon = L.divIcon({
      html: `<div class="target-alt-marker-pulse" style="background:${color};"><i class="fa-solid fa-flag-checkered"></i></div>`,
      className: 'target-marker-wrapper',
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -30]
    });
    this.destMarker = L.marker(destLL, { icon: destIcon, zIndexOffset: 2600 })
      .bindPopup(`
        <div style="min-width:220px; padding:4px;">
          <span style="background:${color}; color:#fff; padding:4px 10px; border-radius:6px; font-weight:800; font-size:0.78rem; display:inline-block; margin-bottom:6px;">
            <i class="fa-solid fa-flag-checkered"></i> DESTINAZIONE
          </span>
          <h4 style="margin:4px 0 2px 0; font-size:1.1rem; color:#0f172a; font-weight:800;">${dest.name}</h4>
          <p style="margin:0; font-size:0.8rem; color:#64748b;"><i class="fa-solid ${modeIcon}"></i> Arrivi con ${line ? (line.code || line.name) : 'il mezzo'} da ${routeInfo.departureStop.name}</p>
        </div>
      `)
      .addTo(this.geoLayer);

    // Inquadra l'intero viaggio (piedi + mezzo) una volta, poi riprende a seguire l'utente
    if (window.transitMap) window.transitMap._skipMoveEnd = true;
    this._followSuspendedUntil = Date.now() + 3000;
    try {
      const all = (this.walkCoords || []).concat(busCoords);
      const bounds = L.latLngBounds(all);
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 15, duration: 1.2 });
      }
    } catch (e) {}
    setTimeout(() => { if (window.transitMap) window.transitMap._skipMoveEnd = false; }, 1400);

    // Se il tracking non e' attivo (GPS non ancora acquisito), avvialo ora
    if (!this.tracking && this.userLatLng) this.startLiveTracking();

    if (window.notificationManager) {
      window.notificationManager.send(
        `Percorso evidenziato: ➔ ${dest.name}`,
        `Segui il tracciato del mezzo da ${routeInfo.departureStop.name}. Il percorso si accorcera' man mano che avanzi.`,
        { type: "info", icon: "fa-route", tabTarget: "map", showToast: true, sendNative: false }
      );
    }
  }

  /* ==========================================================================
     PANNELLO ITINERARIO PASSO-PASSO ("a prova di scimmia")
     ========================================================================== */

  renderItineraryPanel(refLatLng) {
    if (!this.panel || !this.activeItinerary) return;
    const it = this.activeItinerary;
    const legs = it.legs || [];
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const vehIcon = mode === 'flight' ? 'fa-plane' : (mode === 'train' ? 'fa-train' : (mode === 'taxi' ? 'fa-taxi' : (mode === 'tram' ? 'fa-train-tram' : 'fa-bus')));
    const dest = it.destinationStop;

    const steps = [];
    for (const leg of legs) {
      if (leg.type === 'walk') {
        let terrain = '';
        if (leg.elevGain != null && Math.abs(leg.elevGain) >= 5) {
          terrain = leg.elevGain < 0
            ? ` <span class="terrain-chip terrain-down"><i class="fa-solid fa-arrow-trend-down"></i> in discesa (${Math.abs(leg.elevGain)} m)</span>`
            : ` <span class="terrain-chip terrain-up"><i class="fa-solid fa-arrow-trend-up"></i> in salita (${leg.elevGain} m)</span>`;
        }
        const mins = Math.max(1, Math.round((leg.seconds || leg.meters / 1.35) / 60));
        const dirWord = leg.isOrigin ? 'Cammina' : 'Scendi e cammina';
        steps.push(`<i class="fa-solid fa-person-walking text-primary"></i> <strong>${dirWord} ${leg.meters} m</strong> (~${mins} min)${terrain} fino a <strong>${leg.toName}</strong>.`);
      } else {
        const code = leg.line ? (leg.line.code || leg.line.name || 'Mezzo') : 'Mezzo';
        const lname = leg.line && leg.line.name ? leg.line.name : '';
        const nstops = leg.stopsCount || 1;
        steps.push(`<i class="fa-solid ${vehIcon}" style="color:${leg.line && leg.line.color ? leg.line.color : '#0284c7'}"></i> <strong>Prendi ${code}</strong>${lname ? ` <small>(${lname})</small>` : ''} e <strong>scendi a ${leg.alightName}</strong> <small>(${nstops} ferma${nstops === 1 ? 'ta' : 'te'})</small>.`);
      }
    }
    steps.push(`<i class="fa-solid fa-flag-checkered text-success"></i> <strong>Sei arrivato a ${dest ? dest.name : 'destinazione'}.</strong>`);

    const stepsHtml = steps.map((s, i) =>
      `<li class="geo-step-item"><span class="geo-step-num">${i + 1}</span><span class="geo-step-text">${s}</span></li>`
    ).join('');

    const transfersBadge = it.transfers > 0
      ? `<span class="geo-transfers-badge"><i class="fa-solid fa-arrows-turn-right"></i> ${it.transfers} cambio${it.transfers > 1 ? 'i' : ''}</span>`
      : `<span class="geo-transfers-badge geo-direct"><i class="fa-solid fa-bolt"></i> Diretto</span>`;

    const totalWalkTxt = it.totalWalkMeters >= 1000 ? (it.totalWalkMeters / 1000).toFixed(1) + ' km' : it.totalWalkMeters + ' m';
    const boardName = this.nearestStop ? this.nearestStop.name : '';
    const gmapsUrl = this.buildGmapsTransitUrl(refLatLng, dest);

    this.panel.innerHTML = `
      <div class="geo-route-head" style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
        <div>
          <span style="background:rgba(22,163,74,0.15); color:#16a34a; border:1px solid #16a34a; font-weight:800; font-size:0.72rem; padding:3px 8px; border-radius:6px;">
            <i class="fa-solid fa-route"></i> ITINERARIO CONSIGLIATO
          </span> ${transfersBadge}
          <h3 style="margin:6px 0 2px 0; font-size:1.2rem; color:var(--text-primary);">Verso <strong>${dest ? dest.name : 'Destinazione'}</strong></h3>
          <small class="text-muted"><i class="fa-solid ${vehIcon}"></i> ${it.rideCount} mezzo${it.rideCount === 1 ? '' : 'i'} &bull; <i class="fa-solid fa-person-walking"></i> ${totalWalkTxt} a piedi in totale</small>
        </div>
        <button class="btn btn-sm btn-primary" onclick="window.geoLocator.onVisualizzaOrari()">
          <i class="fa-solid fa-route"></i> Visualizza Orari e Percorso
        </button>
      </div>

      <ol class="geo-steps-list" id="geoStepsList">${stepsHtml}</ol>

      <div class="geo-departures-wrapper" style="margin-top:14px;">
        <div class="geo-departures-title" style="font-weight:800; font-size:0.95rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-clock text-primary"></i> Prossime partenze da <strong>${boardName}</strong>
        </div>
        <div id="geoDeparturesList" class="geo-dep-list-grid"></div>
        <div id="geoVerdict" class="geo-verdict-box" style="margin-top:10px;"></div>
      </div>

      <div class="geo-footer-actions" style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="window.geoLocator.onVisualizzaOrari()" style="flex:1;">
          <i class="fa-solid fa-route"></i> Visualizza Orari e Traccia Percorso Completo
        </button>
        ${gmapsUrl ? `
        <a href="${gmapsUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-gmaps-compare" title="Apri e confronta questo percorso su Google Maps (trasporto pubblico)">
          <i class="fa-brands fa-google"></i> Confronta su Google Maps
        </a>` : ''}
        <button class="btn btn-outline" onclick="window.geoLocator.goToLiveBoardTimetable()">
          <i class="fa-solid fa-table-list"></i> Tabellone
        </button>
        <button class="btn btn-outline" onclick="window.geoLocator.locateAndRoute()">
          <i class="fa-solid fa-location-crosshairs"></i> Rilocalizza
        </button>
      </div>
    `;

    this.panel.classList.add("open");
    this.startCountdown();
  }

  /* Deep-link a Google Maps con indicazioni in TRASPORTO PUBBLICO (gratuito,
     nessuna API key): permette all'utente di confrontare col percorso "reale". */
  buildGmapsTransitUrl(refLatLng, destStop) {
    const origin = this.userLatLng || refLatLng;
    if (!origin || !destStop) return null;
    const dLat = destStop.lat_actual || destStop.lat;
    const dLng = destStop.lng_actual || destStop.lng;
    if (dLat == null || dLng == null) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${origin[0]},${origin[1]}&destination=${dLat},${dLng}&travelmode=transit`;
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

    const hasDest = !!(dest && !routeInfo.isDirectNearest);
    const vehicleWord = isFlight ? 'del Volo' : (isTrain ? 'del Treno' : (isTaxi ? 'del Taxi' : (mode === 'tram' ? 'del Tram' : 'del Bus')));

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
        <button class="btn btn-sm btn-primary" onclick="window.geoLocator.${hasDest ? 'onVisualizzaOrari()' : 'goToLiveBoardTimetable()'}">
          <i class="fa-solid ${hasDest ? 'fa-route' : 'fa-table-list'}"></i> ${hasDest ? 'Visualizza Orari e Percorso' : 'Tabellone Orari Completo'}
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
        ${hasDest ? `
        <button class="btn btn-primary" onclick="window.geoLocator.onVisualizzaOrari()" style="flex:1;">
          <i class="fa-solid fa-route"></i> Visualizza Orari e Traccia Percorso ${vehicleWord}
        </button>
        ` : `
        <button class="btn btn-primary" onclick="window.geoLocator.goToLiveBoardTimetable()" style="flex:1;">
          <i class="fa-solid fa-ticket"></i> Visualizza Tabellone Partenze di ${dep.name}
        </button>
        `}
        <button class="btn btn-outline" onclick="window.geoLocator.goToLiveBoardTimetable()">
          <i class="fa-solid fa-table-list"></i> Tabellone Completo
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
    // Interrompe un'eventuale navigazione precedente prima di ricalcolare
    this.stopLiveTracking();
    this.arrived = false;

    if (window.invokeUnity('request_gps')) {
      this.setLoading(true);
      window._waitingForGps = 'geo';
      return;
    }

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
    if (on) {
      this.btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Individuo la tua posizione GPS...`;
    } else {
      // Ripristina l'etichetta corretta per la modalita' attiva (Bus/Treno/Tram/Taxi/Volo)
      const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
      const LABELS = {
        pullman: `<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia il Percorso alla Fermata`,
        flight: `<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia Percorso all'Aeroporto`,
        train: `<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia Percorso alla Stazione`,
        tram: `<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia Fermata Tram`,
        taxi: `<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Trova Posteggio Taxi Più Vicino`
      };
      this.btn.innerHTML = LABELS[mode] || LABELS.pullman;
    }
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
    this.arrived = false;

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

    // Avvia il tracciamento GPS continuo (navigatore): il percorso si accorcia
    // man mano che l'utente si avvicina, come un vero navigatore.
    this.startLiveTracking();
  }

  /* ==========================================================================
     NAVIGATORE IN TEMPO REALE: TRACCIAMENTO GPS CONTINUO
     ========================================================================== */

  startLiveTracking() {
    if (this.tracking) return;

    // Path nativo Unity/iOS: chiede al layer nativo aggiornamenti GPS continui
    if (window.Unity || (window.webkit && window.webkit.messageHandlers)) {
      window._gpsTrackingActive = true;
      this.tracking = true;
      window.invokeUnity('start_gps_tracking');
      return;
    }

    // Path browser/WebView standard: watchPosition
    if (navigator.geolocation) {
      window._gpsTrackingActive = true;
      this.tracking = true;
      try {
        this.watchId = navigator.geolocation.watchPosition(
          (pos) => this.onLivePosition(pos),
          (err) => { /* mantiene l'ultimo tracciato; non interrompe la navigazione */ console.warn("watchPosition:", err && err.message); },
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
        );
      } catch (e) {
        this.tracking = false;
        window._gpsTrackingActive = false;
      }
    }
  }

  stopLiveTracking() {
    window._gpsTrackingActive = false;
    this.tracking = false;
    if (this.watchId != null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(this.watchId); } catch (e) {}
      this.watchId = null;
    }
    if (window.Unity || (window.webkit && window.webkit.messageHandlers)) {
      window.invokeUnity('stop_gps_tracking');
    }
  }

  /* Aggiornamento posizione GPS in tempo reale (chiamato ad ogni tick) */
  onLivePosition(pos) {
    if (!pos || !pos.coords) return;
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    if ((lat === 0 && lng === 0) || isNaN(lat) || isNaN(lng)) return;

    this.userLatLng = [lat, lng];

    // Sposta il marker utente (crealo se assente)
    if (this.userMarker) {
      this.userMarker.setLatLng(this.userLatLng);
    } else if (this.geoLayer && typeof L !== 'undefined') {
      const userIcon = L.divIcon({
        html: `<div class="user-gps-pulse-pin"><span class="gps-core-dot"></span></div>`,
        className: "user-gps-pin-wrapper",
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      this.userMarker = L.marker(this.userLatLng, { icon: userIcon, zIndexOffset: 2000 }).addTo(this.geoLayer);
    }

    this.updateNavigationProgress();
    this.followUser();
  }

  /* La camera segue l'utente (pan) senza combattere con le sue interazioni */
  followUser() {
    // Segue l'utente SOLO in modalita' "auto". In "libera" la mappa non si
    // sposta mai da sola: l'utente puo' esplorare il percorso liberamente.
    if (this.followMode !== 'auto') return;
    const map = this.map;
    if (!map || !this.userLatLng || typeof L === 'undefined') return;
    if (Date.now() < this._followSuspendedUntil) return;
    try {
      const inner = map.getBounds().pad(-0.25);
      if (!inner.contains(L.latLng(this.userLatLng[0], this.userLatLng[1]))) {
        if (window.transitMap) window.transitMap._skipMoveEnd = true;
        map.panTo(this.userLatLng, { animate: true, duration: 0.6 });
        setTimeout(() => { if (window.transitMap) window.transitMap._skipMoveEnd = false; }, 700);
      }
    } catch (e) {}
  }

  /* ==========================================================================
     CONTROLLI CAMERA: Auto (segui) / Libera + Centra + Vedi percorso
     ========================================================================== */

  setFollowMode(mode) {
    this.followMode = (mode === 'auto') ? 'auto' : 'free';
    this.updateNavControlsUI();
    if (this.followMode === 'auto') {
      // Rientra subito sull'utente e riprende a seguirlo
      this.recenterOnUser();
    }
  }

  toggleFollowMode() {
    this.setFollowMode(this.followMode === 'auto' ? 'free' : 'auto');
  }

  recenterOnUser() {
    const map = this.ensureMap();
    if (!map) return;
    const target = this.userLatLng || (this.nearestStop ? [this.nearestStop.lat_actual || this.nearestStop.lat, this.nearestStop.lng_actual || this.nearestStop.lng] : null);
    if (!target) return;
    this._followSuspendedUntil = Date.now() + 1600;
    if (window.transitMap) window.transitMap._skipMoveEnd = true;
    try { map.flyTo(target, Math.max(map.getZoom(), 16), { animate: true, duration: 0.9 }); } catch (e) {}
    setTimeout(() => { if (window.transitMap) window.transitMap._skipMoveEnd = false; }, 1000);
  }

  /* Inquadra l'INTERO percorso (tutti i tratti + cambi): vista d'insieme */
  fitWholeRoute() {
    const map = this.ensureMap();
    if (!map || !this.navLegs) return;
    // Vedere tutto il percorso implica passare in modalita' libera
    this.followMode = 'free';
    this.updateNavControlsUI();
    this._followSuspendedUntil = Date.now() + 2000;
    if (window.transitMap) window.transitMap._skipMoveEnd = true;
    try {
      const all = [];
      if (this.userLatLng) all.push(this.userLatLng);
      for (const leg of this.navLegs) if (leg.coords) for (const c of leg.coords) all.push(c);
      const b = L.latLngBounds(all);
      if (b.isValid()) map.flyToBounds(b, { padding: [60, 60], maxZoom: 15, duration: 1.0 });
    } catch (e) {}
    setTimeout(() => { if (window.transitMap) window.transitMap._skipMoveEnd = false; }, 1100);
  }

  /* Pannello di controllo camera flottante sulla mappa */
  ensureNavControls() {
    let el = document.getElementById('geoNavControls');
    if (el) return el;
    const wrapper = document.querySelector('.transit-map-wrapper');
    if (!wrapper) return null;
    el = document.createElement('div');
    el.id = 'geoNavControls';
    el.className = 'geo-nav-controls';
    el.innerHTML = `
      <div class="geo-nav-modes">
        <button type="button" class="geo-nav-mode-btn" data-mode="auto" onclick="window.geoLocator.setFollowMode('auto')" title="La mappa segue la tua posizione, zoomata">
          <i class="fa-solid fa-location-arrow"></i> Auto
        </button>
        <button type="button" class="geo-nav-mode-btn" data-mode="free" onclick="window.geoLocator.setFollowMode('free')" title="Mappa libera: spostati per vedere tutto il percorso">
          <i class="fa-solid fa-hand"></i> Libera
        </button>
      </div>
      <button type="button" class="geo-nav-act-btn" onclick="window.geoLocator.recenterOnUser()" title="Centra sulla mia posizione">
        <i class="fa-solid fa-crosshairs"></i> <span>Centra su di me</span>
      </button>
      <button type="button" class="geo-nav-act-btn" onclick="window.geoLocator.fitWholeRoute()" title="Vedi l'intero percorso e i cambi">
        <i class="fa-solid fa-route"></i> <span>Vedi tutto il percorso</span>
      </button>
    `;
    wrapper.appendChild(el);
    return el;
  }

  showNavControls() {
    const el = this.ensureNavControls();
    if (el) el.classList.add('active');
    this.updateNavControlsUI();
  }

  hideNavControls() {
    const el = document.getElementById('geoNavControls');
    if (el) el.classList.remove('active');
  }

  updateNavControlsUI() {
    const el = document.getElementById('geoNavControls');
    if (!el) return;
    el.querySelectorAll('.geo-nav-mode-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-mode') === this.followMode);
    });
  }

  /* ==========================================================================
     TRIMMING PROGRESSIVO DEL PERCORSO (STILE NAVIGATORE)
     Il tratto gia' percorso sparisce; resta solo quello davanti all'utente.
     ========================================================================== */

  updateNavigationProgress() {
    if (!this.userLatLng || !this.navLegs || !this.navLegs.length) return;

    // Considera solo le tratte gia' rivelate (visibili sulla mappa)
    const revealed = this.navLegs.filter(l => l.revealed && l.coords && l.coords.length >= 2);
    if (!revealed.length) return;

    // Trova la tratta+segmento piu' vicini alla posizione GPS reale
    let bestLi = -1, bestSeg = 0, bestPt = null, bestDist = Infinity;
    for (let li = 0; li < revealed.length; li++) {
      const n = this._nearestOnPath(this.userLatLng, revealed[li].coords);
      if (n.dist < bestDist) { bestDist = n.dist; bestLi = li; bestSeg = n.idx; bestPt = n.point; }
    }
    if (bestLi < 0) return;

    // Arrivo a destinazione (solo quando l'intero percorso e' stato rivelato)
    const lastLeg = revealed[revealed.length - 1];
    const destPt = lastLeg.coords[lastLeg.coords.length - 1];
    if (this.fullRouteShown && this.haversine(this.userLatLng, destPt) < 45) {
      this.onArrived();
      return;
    }

    // Trimming stile navigatore: le tratte percorse spariscono, quella corrente
    // si accorcia davanti all'utente, quelle successive restano intere.
    for (let li = 0; li < revealed.length; li++) {
      const leg = revealed[li];
      if (li < bestLi) {
        this._setLine(leg.polyline, []);
        this._setLine(leg.glow, []);
      } else if (li === bestLi) {
        const rem = [bestPt].concat(leg.coords.slice(bestSeg + 1));
        this._setLine(leg.polyline, rem);
        this._setLine(leg.glow, rem);
      } else {
        this._setLine(leg.polyline, leg.coords);
        this._setLine(leg.glow, leg.coords);
      }
    }
  }

  _setLine(line, coords) {
    if (line && typeof line.setLatLngs === 'function') {
      line.setLatLngs(coords);
    }
  }

  onArrived() {
    if (this.arrived) return;
    this.arrived = true;
    if (this.navLegs) {
      for (const leg of this.navLegs) {
        this._setLine(leg.polyline, []);
        this._setLine(leg.glow, []);
      }
    }
    this.stopLiveTracking();
    this.hideNavControls();
    const destName = this.selectedDestination?.name || this.activeRouteInfo?.destinationStop?.name || "destinazione";
    if (window.notificationManager) {
      window.notificationManager.send(
        "Sei arrivato a destinazione! 🎉",
        `Benvenuto a ${destName}. Buon proseguimento con ItaliaBus.`,
        { type: "success", icon: "fa-flag-checkered", tabTarget: "map", showToast: true, sendNative: false }
      );
    }
  }

  /* Proiezione di un punto sul segmento a-b in metri locali (equirettangolare) */
  _projSeg(p, a, b) {
    const ky = 110540;                                   // metri per grado di latitudine
    const kx = 111320 * Math.cos(a[0] * Math.PI / 180);  // metri per grado di longitudine
    const ax = a[1] * kx, ay = a[0] * ky;
    const bx = b[1] * kx, by = b[0] * ky;
    const px = p[1] * kx, py = p[0] * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const dist = Math.hypot(px - cx, py - cy);
    return { t, point: [cy / ky, cx / kx], dist };
  }

  /* Trova il punto piu' vicino su una polilinea: {idx segmento, point, dist} */
  _nearestOnPath(p, coords) {
    let best = { idx: 0, point: coords[0], dist: Infinity };
    for (let i = 0; i < coords.length - 1; i++) {
      const r = this._projSeg(p, coords[i], coords[i + 1]);
      if (r.dist < best.dist) {
        best = { idx: i, point: r.point, dist: r.dist };
      }
    }
    return best;
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
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeData = window.TRANSIT_DATA?.modes?.[mode] || window.TRANSIT_DATA?.modes?.pullman;
    const stops = (modeData?.stops && modeData.stops.length > 0) ? modeData.stops : [];
    if (!stops || stops.length === 0) return null;

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

  /* Nessun percorso disponibile: messaggio onesto + confronto Google Maps.
     Evita di disegnare corse fittizie in linea retta quando la rete non copre la tratta. */
  showNoRouteError(dest, refLatLng) {
    if (!this.panel) return;
    if (this.geoLayer) this.geoLayer.clearLayers();
    this.resetNavState();

    const destStop = (dest && dest.stop) ? dest.stop : dest;
    const destName = (dest && dest.name) || (destStop && destStop.name) || 'destinazione';
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeWord = mode === 'train' ? 'treno' : (mode === 'tram' ? 'tram' : (mode === 'flight' ? 'volo' : (mode === 'taxi' ? 'taxi' : 'pullman')));
    const gmapsUrl = this.buildGmapsTransitUrl(refLatLng, destStop);

    this.panel.innerHTML = `
      <div class="search-alert alert-warning" style="align-items:flex-start;">
        <i class="fa-solid fa-route" style="font-size:1.4rem;"></i>
        <div>
          <strong>Nessun collegamento in ${modeWord} trovato fino a ${destName}</strong>
          <p style="margin:6px 0 10px 0;">
            Nella nostra rete non risulta una linea che colleghi la tua zona a questa destinazione
            (di solito e' una tratta lunga o fuori dall'area coperta dai dati di linea).
            Controlla che la destinazione sia quella giusta, oppure verifica il percorso reale su Google Maps.
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${gmapsUrl ? `<a href="${gmapsUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm"><i class="fa-brands fa-google"></i> Vedi su Google Maps</a>` : ''}
            <button class="btn btn-outline btn-sm" onclick="window.geoLocator.clearDestination()"><i class="fa-solid fa-xmark"></i> Chiudi</button>
          </div>
        </div>
      </div>
    `;
    this.panel.classList.add("open");
  }
}

window.receiveUnityGPS = function(lat, lng) {
  const pos = { coords: { latitude: lat, longitude: lng, accuracy: 10 } };
  const err = { message: "Servizio GPS disabilitato o negato. Assicurati di aver attivato la Posizione (GPS) dalle impostazioni del telefono e riprova." };
  const isErr = (lat === 0 && lng === 0);

  // Canale TRACKING CONTINUO (navigatore): aggiornamenti ripetuti dal layer nativo.
  // Ha priorita' e non azzera _waitingForGps del primo fix.
  if (window._gpsTrackingActive && window.geoLocator && !isErr) {
    window.geoLocator.onLivePosition(pos);
    return;
  }

  if (window._waitingForGps === 'geo' && window.geoLocator) {
    if (isErr) window.geoLocator.onGeoError(err);
    else window.geoLocator.onPosition(pos);
  } 
  else if (window._waitingForGps === 'board' && window.liveBoard) {
    const btn = document.getElementById("btnCheckNearestDepartures");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Controlla Partenze dalla Mia Posizione';
    }
    if (isErr) {
      alert(err.message);
    } else {
      const allStops = typeof getStopsByRegion === 'function' ? getStopsByRegion('all') : [];
      if (!allStops || allStops.length === 0) {
        alert("Nessuna fermata trovata nel database.");
        return;
      }
      let bestStop = null;
      let minDistance = Infinity;
      for (let i = 0; i < allStops.length; i++) {
        const s = allStops[i];
        const dist = typeof calculateDistanceMeters === 'function' ? calculateDistanceMeters(lat, lng, s.lat, s.lng) : 999999;
        if (dist < minDistance) {
          minDistance = dist;
          bestStop = s;
        }
      }
      if (bestStop && minDistance <= 25000) {
        const boardSelect = document.getElementById("boardStopFilter");
        if (boardSelect) {
          boardSelect.value = bestStop.id;
          boardSelect.dispatchEvent(new Event("change"));
        }
        alert('Trovata fermata vicina: ' + bestStop.name + ' (a ' + Math.round(minDistance) + 'm)');
      } else {
        alert("Nessuna fermata trovata nel raggio di 25km.");
      }
    }
  }
  window._waitingForGps = null;
};

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




