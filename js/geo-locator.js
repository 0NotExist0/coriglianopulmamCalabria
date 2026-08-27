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
    this.destHubBar = document.getElementById("mapDestinationHubBar");
    this.btnToggleMapSearch = document.getElementById("btnToggleMapSearch");

    // Controlli Inserimento Posizione Manuale (aperto solo se il GPS viene negato)
    this.manualOriginBar = document.getElementById("mapManualOriginBar");
    this.manualOriginInput = document.getElementById("manualOriginInput");
    this.btnSetManualOrigin = document.getElementById("btnSetManualOrigin");
    this.btnCloseManualOrigin = document.getElementById("btnCloseManualOrigin");
    this.btnClearManualOrigin = document.getElementById("btnClearManualOrigin");
    this.manualOriginResultsList = document.getElementById("manualOriginResultsList");

    this.map = null;
    this.geoLayer = null;
    this.userLatLng = null;
    this.nearestStop = null;
    this.selectedDestination = null;
    this.activeRouteInfo = null;
    this.walkSeconds = null;
    this.countdownTimer = null;

    // --- Stato GPS & Posizione Manuale Fallback ---
    this.gpsDenied = false;              // true solo se il permesso GPS e' stato negato o fallito
    this.manualOriginAddress = null;     // stringa indirizzo manuale inserito
    this.manualOriginMarker = null;      // marker Leaflet per la partenza manuale

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

    // --- Opzioni di Viaggio & Filtri Mezzi (Solo Pullman vs Più Veloce vs Intermodale) ---
    this.itineraryFilter = 'all';    // 'all' | 'pullman' | 'fastest'
    this.currentItineraryOptions = []; // elenco opzioni calcolate per la destinazione attiva
    this.activeOptionIndex = 0;      // indice dell'opzione selezionata
    this.currentDest = null;         // destinazione corrente
    this.currentRefLatLng = null;    // punto di partenza di riferimento corrente

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
    this.bindManualOriginControls();

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

    // Tasto Invio -> seleziona il primo risultato filtrato e avvia la ricerca solo all'invio
    this.destInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const firstItem = this.destDropdownList?.querySelector(".dest-dropdown-item");
        if (firstItem && firstItem._destData) {
          this.selectDestination(firstItem._destData, false);
        }
        this.closeDropdown();
        this.locateAndRoute();
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
    if (this.panel) {
      this.panel.classList.remove("open");
      this.panel.classList.remove("minimized");
    }
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (window.transitMap && typeof window.transitMap.isolateRouteView === 'function') {
      window.transitMap.isolateRouteView(false);
    }
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

  /* ==========================================================================
     GESTIONE POSIZIONE MANUALE (FALLBACK QUANDO IL GPS VIENE NEGATO)
     ========================================================================== */

  bindManualOriginControls() {
    if (this.btnToggleMapSearch) {
      this.btnToggleMapSearch.addEventListener("click", () => {
        if (!this.destHubBar) this.destHubBar = document.getElementById("mapDestinationHubBar");
        if (this.destHubBar) {
          const isHidden = this.destHubBar.style.display === "none" || !this.destHubBar.style.display;
          this.destHubBar.style.display = isHidden ? "grid" : "none";
          if (isHidden && this.destInput) {
            this.destInput.focus();
          }
        }
      });
    }

    if (this.btnCloseManualOrigin) {
      this.btnCloseManualOrigin.addEventListener("click", () => {
        this.hideManualOriginPanel();
      });
    }

    if (this.btnClearManualOrigin) {
      this.btnClearManualOrigin.addEventListener("click", () => {
        if (this.manualOriginInput) {
          this.manualOriginInput.value = "";
          this.manualOriginInput.focus();
        }
        if (this.manualOriginResultsList) {
          this.manualOriginResultsList.style.display = "none";
          this.manualOriginResultsList.innerHTML = "";
        }
        this.btnClearManualOrigin.style.display = "none";
      });
    }

    if (this.manualOriginInput) {
      let debounceTimer = null;
      this.manualOriginInput.addEventListener("input", () => {
        const q = this.manualOriginInput.value.trim();
        if (this.btnClearManualOrigin) {
          this.btnClearManualOrigin.style.display = q ? "flex" : "none";
        }
        clearTimeout(debounceTimer);
        if (q.length >= 2) {
          debounceTimer = setTimeout(() => {
            this.renderManualOriginSuggestions(q);
          }, 150);
        } else {
          if (this.manualOriginResultsList) {
            this.manualOriginResultsList.style.display = "none";
            this.manualOriginResultsList.innerHTML = "";
          }
        }
      });

      this.manualOriginInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handleManualOriginSubmit();
        }
      });
    }

    if (this.btnSetManualOrigin) {
      this.btnSetManualOrigin.addEventListener("click", () => {
        this.handleManualOriginSubmit();
      });
    }
  }

  showManualOriginPanel(err = null) {
    if (!this.manualOriginBar) this.manualOriginBar = document.getElementById("mapManualOriginBar");
    if (this.manualOriginBar) {
      this.manualOriginBar.style.display = "block";
    }
    if (this.manualOriginInput) {
      this.manualOriginInput.focus();
    }
  }

  hideManualOriginPanel() {
    if (!this.manualOriginBar) this.manualOriginBar = document.getElementById("mapManualOriginBar");
    if (this.manualOriginBar) {
      this.manualOriginBar.style.display = "none";
    }
  }

  async renderManualOriginSuggestions(query) {
    if (!this.manualOriginResultsList) this.manualOriginResultsList = document.getElementById("manualOriginResultsList");
    if (!this.manualOriginResultsList) return;

    const list = this.manualOriginResultsList;
    const qLower = query.toLowerCase();

    // 1) Cerca prima tra le fermate locali
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    let allStops = (typeof getStopsByRegion === 'function' ? getStopsByRegion(currentRegion) : []) || [];
    if (typeof getStopsByRegion === 'function') {
      allStops = allStops.concat(getStopsByRegion('all') || []);
    }

    const matchedStops = allStops.filter(s => s.name && s.name.toLowerCase().includes(qLower)).slice(0, 5);

    let html = matchedStops.map(s => `
      <div class="manual-origin-item" onclick="window.geoLocator.applyManualOrigin(${s.lat_actual || s.lat}, ${s.lng_actual || s.lng}, '${s.name.replace(/'/g, "\\'")}')">
        <i class="fa-solid fa-bus text-primary"></i>
        <div>
          <strong>${s.name}</strong>
          <small class="text-muted" style="display:block;">Fermata Rete / Stazione</small>
        </div>
      </div>
    `).join('');

    // 2) Opzione di ricerca libera OpenStreetMap
    html += `
      <div class="manual-origin-item manual-origin-geocode-opt" onclick="window.geoLocator.handleManualOriginSubmit()">
        <i class="fa-solid fa-magnifying-glass-location text-success"></i>
        <div>
          <strong>Cerca "${query}" come indirizzo/città</strong>
          <small class="text-muted" style="display:block;">Geolocalizzazione indirizzo OpenStreetMap</small>
        </div>
      </div>
    `;

    list.innerHTML = html;
    list.style.display = "block";
  }

  async geocodeManualAddress(query) {
    if (!query || query.trim().length < 2) return null;
    const clean = query.trim().toLowerCase();

    // 1) Cerca prima tra le fermate e gli hub regionali
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    let allStops = (typeof getStopsByRegion === 'function' ? getStopsByRegion(currentRegion) : []) || [];
    if (typeof getStopsByRegion === 'function') {
      allStops = allStops.concat(getStopsByRegion('all') || []);
    }

    const matchedStop = allStops.find(s => s.name && s.name.toLowerCase().includes(clean));
    if (matchedStop) {
      return {
        lat: matchedStop.lat_actual || matchedStop.lat,
        lng: matchedStop.lng_actual || matchedStop.lng,
        name: matchedStop.name
      };
    }

    // 2) Geocoding Nominatim OpenStreetMap (CORS aperto per l'Italia)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=it&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'accept-language': 'it' } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            name: data[0].display_name.split(',')[0] || data[0].display_name
          };
        }
      }
    } catch (e) {
      console.warn("Geocoding manual address error:", e);
    }

    return null;
  }

  async handleManualOriginSubmit() {
    if (!this.manualOriginInput) return;
    const q = this.manualOriginInput.value.trim();
    if (!q) return;

    if (this.manualOriginResultsList) {
      this.manualOriginResultsList.style.display = "none";
    }

    if (this.btnSetManualOrigin) {
      this.btnSetManualOrigin.disabled = true;
      this.btnSetManualOrigin.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Localizzo...`;
    }

    const res = await this.geocodeManualAddress(q);
    if (this.btnSetManualOrigin) {
      this.btnSetManualOrigin.disabled = false;
      this.btnSetManualOrigin.innerHTML = `<i class="fa-solid fa-location-arrow"></i> <span>Imposta Partenza</span>`;
    }

    if (res && res.lat != null && res.lng != null) {
      this.applyManualOrigin(res.lat, res.lng, res.name || q);
    } else {
      this.showError(`Indirizzo "${q}" non trovato. Prova specificando la città o la fermata.`);
    }
  }

  applyManualOrigin(lat, lng, name) {
    this.gpsDenied = true; // Solo in questo caso (GPS negato) usiamo la posizione manuale
    this.userLatLng = [lat, lng];
    this.manualOriginAddress = name;

    const map = this.ensureMap();
    if (!map) return;

    if (this.manualOriginMarker && this.geoLayer) {
      this.geoLayer.removeLayer(this.manualOriginMarker);
    }

    const pinHtml = `
      <div class="user-manual-origin-pin" title="Punto di Partenza Impostato">
        <i class="fa-solid fa-location-dot"></i>
      </div>
    `;
    const icon = L.divIcon({
      html: pinHtml,
      className: 'user-manual-origin-pin-wrap',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    this.manualOriginMarker = L.marker([lat, lng], { icon, zIndexOffset: 2500 })
      .bindPopup(`<strong>📍 Partenza Impostata:</strong><br>${name}`)
      .addTo(this.geoLayer);

    map.flyTo([lat, lng], 15, { animate: true, duration: 1.2 });
    this.manualOriginMarker.openPopup();

    if (this.manualOriginResultsList) {
      this.manualOriginResultsList.style.display = "none";
    }

    // Se c'è già una destinazione scelta, calcola subito l'itinerario dalla partenza manuale
    if (this.selectedDestination) {
      this.routeToDestination(this.selectedDestination);
    } else {
      // Altrimenti trova la fermata di partenza più vicina alla posizione manuale inserita
      const defaultStop = this.findNearestStop(this.userLatLng);
      if (defaultStop) {
        this.routeToNearestDeparture(defaultStop);
      }
    }

    if (window.notificationManager) {
      window.notificationManager.send(
        `Partenza Impostata: ${name} 📍`,
        `Posizione manuale impostata con successo. Calcolo fermate e percorsi disponibili.`,
        { type: "info", icon: "fa-location-dot", tabTarget: "map", showToast: true, sendNative: false }
      );
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

  /* Raggruppa le fermate per COMUNE ufficiale (via LocalityNormalizer), memoizzato
     per modalità. Ogni gruppo tiene la fermata "rappresentativa" più sensata
     (hub/stazione) da usare come destinazione. */
  _comuneGroups(mode, allStops) {
    if (this._cg && this._cgMode === mode && this._cgCount === allStops.length) return this._cg;
    const LN = window.LocalityNormalizer;
    const STATION = /(stazione|terminal|autostazione|scalo|\bfs\b|aeroporto|capolinea|interscambio|hub)/i;
    const map = new Map();
    for (let i = 0; i < allStops.length; i++) {
      const s = allStops[i];
      let comune, prov, region, key;
      if (LN) { LN.assign(s); comune = s._comune; prov = s._prov || ''; region = s._comuneRegion || s.region; key = s._comuneKey; }
      else { comune = (s.area || s.name || '').split('(')[0].split(' - ')[0].trim(); prov = ''; region = s.region; key = (comune.toLowerCase() + '|' + region); }
      if (!comune) continue;
      let g = map.get(key);
      if (!g) { g = { key, comune, prov, region, hub: false, rep: null, stops: [] }; map.set(key, g); }
      g.stops.push(s);
      const isStation = STATION.test(s.name || '') || STATION.test(s.area || '');
      // rappresentante: preferisci hub, poi stazione/terminal, poi la prima fermata
      if (s.isMainHub) { g.hub = true; if (!g.rep || !g.repHub) { g.rep = s; g.repHub = true; } }
      else if (isStation && !g.repHub && !g.repStation) { g.rep = s; g.repStation = true; }
      else if (!g.rep) { g.rep = s; }
    }
    this._cg = map; this._cgMode = mode; this._cgCount = allStops.length;
    return map;
  }

  _destCatIcon(mode, isHub) {
    if (mode === 'flight') return { cat: 'Aeroporto Internazionale / Nazionale', icon: 'fa-plane-departure' };
    if (mode === 'train') return { cat: isHub ? 'Stazione AV / Principale' : 'Stazione Ferroviaria', icon: 'fa-train' };
    if (mode === 'tram') return { cat: 'Fermata Tranviaria', icon: 'fa-train-tram' };
    if (mode === 'taxi') return { cat: 'Posteggio Taxi / Hub', icon: 'fa-taxi' };
    return { cat: isHub ? '🚌 Autostazioni & Hub' : '🏙️ Città & Comuni', icon: isHub ? 'fa-bus-simple' : 'fa-location-dot' };
  }

  /* Categoria/icona per i risultati a livello di VIA / FERMATA (non comune). */
  _destCatIconVia(mode) {
    if (mode === 'flight') return { cat: '🛫 Scali & Terminal', icon: 'fa-plane' };
    if (mode === 'train') return { cat: '🚉 Stazioni & Fermate', icon: 'fa-train' };
    if (mode === 'tram') return { cat: '🚋 Fermate Tranviarie', icon: 'fa-train-tram' };
    if (mode === 'taxi') return { cat: '🚕 Posteggi & Vie', icon: 'fa-taxi' };
    return { cat: '📍 Vie & Fermate', icon: 'fa-location-dot' };
  }

  /* Etichetta leggibile di una fermata/via (senza "Fermata NNNN - " e senza il comune finale). */
  _stopLabel(s) {
    const STREET = /^(via|viale|v\.?le|piazza|p\.?zza|p\.?za|corso|c\.?so|largo|vico|vicolo|strada|s\.?da|localit|contrada|c\.?da|salita|traversa|rotonda|rotatoria|bivio|svincolo|piazzale|p\.?le|lungomare|stazione|terminal|autostazione)/i;
    // Se è tutto MAIUSCOLO (dati GTFS) lo rende leggibile in Maiuscolo/minuscolo.
    const pretty = (str) => /[a-zàèéìòùç]/.test(str) ? str
      : str.toLowerCase().replace(/([a-zàèéìòùç])([a-zàèéìòùç']*)/g, (m, a, b) => a.toUpperCase() + b);
    const addr = (s.address || '').trim();
    if (addr && STREET.test(addr)) return pretty(addr);
    let n = (s.name || '').replace(/^\s*fermata\s+\d+\s*[-–]\s*/i, '').trim();
    n = n.split(' - ')[0].trim();
    return pretty(n || addr || (s.name || '').trim() || 'Fermata');
  }

  searchDestinations(filterQuery = "", maxLimit = 35) {
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeData = window.TRANSIT_DATA?.modes?.[mode] || window.TRANSIT_DATA?.modes?.pullman;
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const allStops = (modeData?.stops && modeData.stops.length > 0) ? modeData.stops : [];
    const LN = window.LocalityNormalizer;
    const norm = (x) => LN ? LN.norm(x) : String(x || '').toLowerCase().trim();

    const q = (filterQuery || "").toLowerCase().trim();
    const qn = norm(q);

    const groups = this._comuneGroups(mode, allStops);

    const makeItem = (g) => {
      const rep = g.rep || g.stops[0];
      const { cat, icon } = this._destCatIcon(mode, g.hub);
      const regId = g.region || rep.region || currentRegion;
      return {
        id: rep.id,
        uniqueKey: `destc_${g.key}`,
        name: g.comune,                         // nome comune ufficiale
        stopName: rep.name,
        area: g.comune,
        prov: g.prov || '',
        region: regId,
        regionName: this.regionLabel(regId),
        baseName: norm(g.comune),
        ambiguous: false,
        lat: rep.lat,
        lng: rep.lng,
        isMainHub: g.hub,
        isStop: false,
        stopsCount: g.stops.length,
        category: cat,
        icon: icon,
        stop: rep
      };
    };

    // Voce a livello di VIA/FERMATA (indirizzo specifico dentro un comune).
    const makeStopItem = (s) => {
      if (LN) LN.assign(s);
      const comune = (LN && s._comune) || (s.area || '').split('(')[0].split(' - ')[0].trim();
      const prov = (LN && s._prov) || '';
      const regId = (LN && s._comuneRegion) || s.region || currentRegion;
      const { cat, icon } = this._destCatIconVia(mode);
      return {
        id: s.id,
        uniqueKey: `dests_${s.id}`,
        name: this._stopLabel(s),               // la via / fermata
        stopName: s.name,
        area: comune,                           // comune di appartenenza (contesto)
        prov: prov,
        region: regId,
        regionName: this.regionLabel(regId),
        baseName: norm(comune),
        ambiguous: false,
        lat: s.lat,
        lng: s.lng,
        isMainHub: !!s.isMainHub,
        isStop: true,
        category: cat,
        icon: icon,
        stop: s
      };
    };

    // Elenco iniziale (nessuna query): hub principali + comuni della regione attiva.
    if (!q) {
      const hubs = [], local = [];
      groups.forEach(g => {
        if (g.hub) hubs.push(g);
        else if (g.region === currentRegion) local.push(g);
      });
      hubs.sort((a, b) => b.stops.length - a.stops.length);
      local.sort((a, b) => a.comune.localeCompare(b.comune, 'it'));
      const out = hubs.slice(0, 12).concat(local).slice(0, maxLimit).map(makeItem);
      return this._markAmbiguity(out);
    }

    // 1) COMUNI/CITTÀ che corrispondono (prefisso > contiene > match su una fermata).
    const scored = [];
    groups.forEach(g => {
      const cn = norm(g.comune);
      let score = 0;
      if (cn === qn) score = 4;
      else if (cn.startsWith(qn)) score = 3;
      else if (cn.indexOf(qn) !== -1) score = 2;
      if (score > 0) scored.push({ g, score });
    });
    scored.sort((a, b) => {
      const arA = a.g.region === currentRegion ? 1 : 0;
      const arB = b.g.region === currentRegion ? 1 : 0;
      if (arA !== arB) return arB - arA;
      if (b.score !== a.score) return b.score - a.score;
      const hA = a.g.hub ? 1 : 0, hB = b.g.hub ? 1 : 0;
      if (hA !== hB) return hB - hA;
      return b.g.stops.length - a.g.stops.length;
    });
    const comuneItems = scored.slice(0, 10).map(x => makeItem(x.g));

    // 2) VIE/FERMATE specifiche che corrispondono al testo (regione attiva prima).
    //    Deduplica per via+comune così non escono 15 pali della stessa via.
    const viaItems = [];
    const seenVia = new Set();
    for (let pass = 0; pass < 2 && viaItems.length < 30; pass++) {
      for (let i = 0; i < allStops.length && viaItems.length < 30; i++) {
        const s = allStops[i];
        const inActive = (s.region === currentRegion);
        if ((pass === 0) !== inActive) continue;   // pass 0: regione attiva, pass 1: resto
        const hay = ((s.name || '') + ' ' + (s.area || '') + ' ' + (s.address || '')).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
        const it = makeStopItem(s);
        const key = norm(it.name) + '|' + norm(it.area);
        if (seenVia.has(key)) continue;
        seenVia.add(key);
        viaItems.push(it);
      }
    }

    return this._markAmbiguity(comuneItems.concat(viaItems));
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
          <small>Prova a cercare una città, una via o una fermata.</small>
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
        // Contesto: per una VIA/fermata mostra "Comune · PROV · Regione"; per un COMUNE
        // basta "PROV · Regione" (il nome è già il comune). Così gli omonimi si distinguono.
        let place;
        if (dest.isStop) {
          const comuneTxt = dest.area ? dest.area : '';
          place = [comuneTxt, dest.prov, regionName].filter(Boolean).join(' · ');
        } else {
          place = dest.prov ? `${dest.prov} · ${regionName}` : regionName;
        }
        const regionChip = `<span class="dest-item-region"><i class="fa-solid ${dest.isStop ? 'fa-location-dot' : 'fa-map-pin'}"></i> ${place}</span>`;
        const countTxt = (!dest.isStop && dest.stopsCount && dest.stopsCount > 1) ? ` <span class="dest-item-count">· ${dest.stopsCount} fermate</span>` : '';
        const tag = dest.isStop ? 'Fermata' : (dest.isMainHub ? 'Hub Diretto' : 'Comune');
        html += `
          <div class="dest-dropdown-item ${isSel ? 'active' : ''}" data-dest-key="${dest.uniqueKey}">
            <div class="dest-item-main">
              <div class="dest-item-icon"><i class="fa-solid ${dest.icon || 'fa-location-dot'}"></i></div>
              <div class="dest-item-text">
                <span class="dest-item-name">${dest.name}</span>
                <span class="dest-item-meta">${regionChip}${countTxt}</span>
              </div>
            </div>
            <span class="dest-item-tag">${tag}</span>
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

  selectDestination(dest, autoRoute = false) {
    if (!dest) return;
    this.selectedDestination = dest;
    if (this.destInput) this.destInput.value = dest.name;
    if (this.btnClearDest) this.btnClearDest.style.display = "flex";
    this.closeDropdown();

    if (autoRoute) {
      if (window.transitMap && typeof window.transitMap.isolateRouteView === 'function') {
        window.transitMap.isolateRouteView(true);
      }
      this.routeToDestination(dest);
    }
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
        else if (window.invokeUnity) window.invokeUnity('show_ad'); // fallback se web-ads.js non caricato
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

      this.currentDest = dest;
      this.currentRefLatLng = refLatLng;

      // Costruisce e cataloga tutte le opzioni di viaggio (Solo Pullman, Più Veloce, Intermodale, etc.)
      const options = await this.buildItineraryOptions(dest, refLatLng, this.itineraryFilter);
      if (!options || options.length === 0) {
        this.showNoRouteError(dest, refLatLng);
        return;
      }

      this.currentItineraryOptions = options;

      // Determina quale opzione selezionare in base al filtro attivo
      let targetIdx = 0;
      if (this.itineraryFilter === 'pullman') {
        const pIdx = options.findIndex(o => o.isPurePullman);
        if (pIdx !== -1) targetIdx = pIdx;
        else {
          const hIdx = options.findIndex(o => o.isPullmanHybrid || o.hasPullman);
          targetIdx = hIdx !== -1 ? hIdx : 0;
        }
      } else if (this.itineraryFilter === 'fastest') {
        const fIdx = options.findIndex(o => o.isFastest);
        targetIdx = fIdx !== -1 ? fIdx : 0;
      }

      this.activeOptionIndex = targetIdx;
      const chosen = options[targetIdx];

      this.setActiveItinerary(chosen.itinerary, refLatLng);

      // Migliora il primo tratto a piedi con la geometria pedonale reale (OSRM)
      await this.enhanceOriginWalkGeometry();

      // Disegna l'itinerario sulla mappa
      this.drawNavLegs(refLatLng);

      // Renderizza il pannello con selettore opzioni e indicazioni passo-passo
      this.renderItineraryPanel(refLatLng);

      // Notifica di sistema
      if (window.notificationManager) {
        const board = this.nearestStop;
        const extra = chosen.itinerary.transfers > 0
          ? `Percorso ${chosen.title} (${chosen.durationText}, ${chosen.transfersText}): segui le indicazioni passo-passo.`
          : `Percorso ${chosen.title} (${chosen.durationText}): sali a ${board ? board.name : 'fermata'}.`;
        window.notificationManager.send(
          `Itinerario per ${dest.name} 🧭`,
          extra,
          { type: "success", icon: "fa-route", tabTarget: "map", showToast: true, sendNative: false }
        );
      }
    };

    if (typeof window.withAppLoader === 'function') {
      await window.withAppLoader(`Calcolo Itinerario per ${dest.name || 'Destinazione'}...`, "Ricerca corse solo pullman, coincidenze e percorsi più veloci...", doRouting, 240);
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

  /* ==========================================================================
     COSTRUZIONE ITINERARI & OPZIONI MULTIPLE (Solo Pullman, Più Veloce, etc.)
     ========================================================================== */

  formatDuration(sec) {
    if (!sec || isNaN(sec) || sec <= 0) return '~30 min';
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    const hrs = Math.floor(m / 60);
    const mins = m % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  async buildItinerary(dest, refLatLng) {
    const options = await this.buildItineraryOptions(dest, refLatLng, this.itineraryFilter);
    if (!options || options.length === 0) return null;
    return options[this.activeOptionIndex]?.itinerary || options[0]?.itinerary;
  }

  async buildItineraryOptions(dest, refLatLng, preferredFilter = 'all') {
    const destStop = dest.stop || { id: dest.id, name: dest.name, lat: dest.lat, lng: dest.lng };
    const rawOptions = [];

    // Calcolo percorso in auto (OSRM driving con manovre, rotonde e consumi)
    let drivingRoute = null;
    const destLL = [destStop.lat_actual || destStop.lat, destStop.lng_actual || destStop.lng];
    if (destLL[0] != null && destLL[1] != null && refLatLng) {
      try {
        drivingRoute = await this.fetchDrivingRoute(refLatLng, destLL);
      } catch (e) {
        console.warn("fetchDrivingRoute error:", e);
      }
    }

    // 1) Fallback Locale Diretto (Pullman di linea locale / Calabria)
    const localFb = this._localDirectFallback(dest, refLatLng);
    if (localFb) {
      rawOptions.push(localFb);
    }

    // 2) Pianificatore Multi-hop Locale (JourneyPlanner RAPTOR con preferenza Pullman)
    if (window.journeyPlanner && destStop.id) {
      try {
        const jpPullman = await window.journeyPlanner.plan(refLatLng, destStop, { modeKey: 'pullman' });
        if (jpPullman && jpPullman.legs && jpPullman.rideCount >= 1) {
          rawOptions.push(jpPullman);
        }
      } catch (e) {
        console.warn("journeyPlanner pullman error:", e);
      }
    }

    // 3) Rete Pubblica Nazionale (Transitous / MOTIS - bus reali, treni, interscambi)
    if (window.transitousRouting && window.transitousRouting.available()) {
      try {
        const ttOptions = await window.transitousRouting.planOptions(refLatLng, destStop, {});
        if (ttOptions && ttOptions.length) {
          ttOptions.forEach(it => rawOptions.push(it));
        }
      } catch (e) {
        console.warn("transitous planOptions error:", e);
      }
    }

    // 4) Google Directions (se attivo)
    if (window.gmapsDirections && window.gmapsDirections.available()) {
      try {
        const gIt = await window.gmapsDirections.plan(refLatLng, destStop, {});
        if (gIt && gIt.legs && gIt.legs.length) rawOptions.push(gIt);
      } catch (e) {
        console.warn("gmapsDirections plan error:", e);
      }
    }

    // Se non ci sono opzioni di trasporto pubblico ma c'è l'auto, prosegui
    if (rawOptions.length === 0 && !drivingRoute) return [];

    // Deduplica percorsi in base alla sequenza di linee e fermate
    const deduplicated = [];
    const signatures = new Set();
    for (const it of rawOptions) {
      const rideLegs = (it.legs || []).filter(l => l.type === 'ride');
      if (rideLegs.length === 0 && !it.walkOnly) continue;
      const sig = rideLegs.map(l => (l.line ? (l.line.code || l.line.name) : '') + '_' + (l.boardName || '') + '_' + (l.alightName || '')).join('->');
      if (!signatures.has(sig)) {
        signatures.add(sig);
        deduplicated.push(it);
      }
    }

    const candidateList = deduplicated.length ? deduplicated : rawOptions;

    // Calcolo durata minima globale
    let minSec = Infinity;
    for (const it of candidateList) {
      const sec = it.totalSeconds || 999999;
      if (sec < minSec) minSec = sec;
    }

    // Identifica opzioni Solo Pullman (100% bus)
    const purePullmanList = candidateList.filter(it => {
      const rideLegs = (it.legs || []).filter(l => l.type === 'ride');
      return rideLegs.length > 0 && rideLegs.every(l => this.getTransitMode(l) === 'pullman');
    });

    // Identifica opzioni Intermodali con Pullman (es. Treno -> Pullman)
    const hybridPullmanList = candidateList.filter(it => {
      const rideLegs = (it.legs || []).filter(l => l.type === 'ride');
      const modes = rideLegs.map(l => this.getTransitMode(l));
      return modes.includes('pullman') && modes.some(m => m !== 'pullman');
    });

    const structuredOptions = [];

    // 1. GESTIONE OPZIONE PULLMAN (PURA o con COINCIDENZA)
    if (purePullmanList.length > 0) {
      purePullmanList.sort((a, b) => (a.totalSeconds || 1e9) - (b.totalSeconds || 1e9));
      const bestPullman = purePullmanList[0];
      const isAlsoFastest = bestPullman.totalSeconds <= minSec + 60;
      structuredOptions.push({
        id: 'opt_pullman_pure',
        title: 'Solo Pullman',
        badge: '100% Pullman',
        badgeClass: 'badge-pullman',
        icon: 'fa-bus',
        color: '#0284c7',
        isPurePullman: true,
        hasPullman: true,
        isPullmanHybrid: false,
        isFastest: isAlsoFastest,
        durationText: this.formatDuration(bestPullman.totalSeconds),
        transfersText: bestPullman.transfers === 0 ? 'Diretto (0 cambi)' : `${bestPullman.transfers} cambio${bestPullman.transfers > 1 ? 'i' : ''} bus`,
        itinerary: bestPullman,
        desc: isAlsoFastest ? 'Percorso diretto/solo bus, ottimale anche nei tempi.' : 'Tutto in pullman senza prendere treni.'
      });
    } else if (hybridPullmanList.length > 0) {
      hybridPullmanList.sort((a, b) => (a.totalSeconds || 1e9) - (b.totalSeconds || 1e9));
      const bestHybrid = hybridPullmanList[0];
      structuredOptions.push({
        id: 'opt_pullman_hybrid',
        title: 'Interscambio Pullman',
        badge: 'Treno + Pullman',
        badgeClass: 'badge-hybrid',
        icon: 'fa-right-left',
        color: '#d97706',
        isPurePullman: false,
        hasPullman: true,
        isPullmanHybrid: true,
        isFastest: bestHybrid.totalSeconds <= minSec + 60,
        durationText: this.formatDuration(bestHybrid.totalSeconds),
        transfersText: `${bestHybrid.transfers} cambi`,
        itinerary: bestHybrid,
        notice: 'Nessuna corsa 100% Pullman diretta per questa tratta: calcolato cambio con Treno per proseguire con il Pullman.',
        desc: 'Cambio con treno per raggiungere la linea pullman di destinazione.'
      });
    }

    // 2. GESTIONE OPZIONE PIÙ VELOCE (TEMPO MINIMO)
    candidateList.sort((a, b) => (a.totalSeconds || 1e9) - (b.totalSeconds || 1e9));
    const fastestIt = candidateList[0];
    const firstAlreadyFastest = structuredOptions.length > 0 && structuredOptions[0].itinerary === fastestIt;

    if (!firstAlreadyFastest && fastestIt) {
      const rideLegs = (fastestIt.legs || []).filter(l => l.type === 'ride');
      const modes = Array.from(new Set(rideLegs.map(l => this.getTransitMode(l))));
      const modeLabels = modes.map(m => this.getModeLabel(m)).join(' + ');
      const diffSec = (structuredOptions.length > 0 && structuredOptions[0].itinerary.totalSeconds)
        ? structuredOptions[0].itinerary.totalSeconds - fastestIt.totalSeconds
        : 0;
      const diffTxt = diffSec > 120 ? ` (risparmi ~${Math.round(diffSec / 60)} min)` : '';

      structuredOptions.push({
        id: 'opt_fastest',
        title: 'Più Veloce',
        badge: 'Tempo Minimo' + diffTxt,
        badgeClass: 'badge-fastest',
        icon: 'fa-bolt',
        color: '#16a34a',
        isPurePullman: modes.length === 1 && modes[0] === 'pullman',
        hasPullman: modes.includes('pullman'),
        isPullmanHybrid: modes.includes('pullman') && modes.length > 1,
        isFastest: true,
        durationText: this.formatDuration(fastestIt.totalSeconds),
        transfersText: fastestIt.transfers === 0 ? 'Diretto' : `${fastestIt.transfers} cambi (${modeLabels})`,
        itinerary: fastestIt,
        desc: `Arrivo più rapido a destinazione combinando ${modeLabels}.`
      });
    }

    // 3. OPZIONE AUTO / MACCHINA (con calcolo consumi, costi e HUD 3D rotonde)
    if (drivingRoute && drivingRoute.distance > 0) {
      const distKm = drivingRoute.distance / 1000;
      const liters = (distKm / 100) * 6.2; // 6.2 L / 100km consumo medio auto
      const costEur = liters * 1.82; // €1.82 / L
      const co2Kg = (distKm * 120) / 1000; // 120 g CO2 / km
      const isCarFasterThanTransit = drivingRoute.duration < minSec;

      const carItinerary = {
        isCar: true,
        mode: 'car',
        source: 'osrm_driving',
        totalSeconds: Math.round(drivingRoute.duration),
        totalMeters: Math.round(drivingRoute.distance),
        totalDistanceKm: distKm,
        consumptionLiters: liters,
        costEstimateEur: costEur,
        co2EstimateKg: co2Kg,
        roundaboutsCount: drivingRoute.roundaboutsCount || 0,
        legs: [
          {
            type: 'drive',
            mode: 'car',
            coords: drivingRoute.coords,
            meters: Math.round(drivingRoute.distance),
            seconds: Math.round(drivingRoute.duration),
            steps: drivingRoute.steps,
            fromName: this.manualOriginAddress || 'La tua posizione',
            toName: destStop.name || 'Destinazione',
            revealed: true
          }
        ],
        transfers: 0,
        rideCount: 1,
        totalWalkMeters: 0,
        totalRideMeters: Math.round(drivingRoute.distance),
        destinationStop: destStop
      };

      structuredOptions.push({
        id: 'opt_car',
        title: 'In Auto / Macchina',
        badge: 'Navigatore Auto 3D',
        badgeClass: 'badge-car',
        icon: 'fa-car-side',
        color: '#2563eb',
        isCar: true,
        isPurePullman: false,
        hasPullman: false,
        isPullmanHybrid: false,
        isFastest: isCarFasterThanTransit,
        durationText: this.formatDuration(drivingRoute.duration),
        transfersText: `${distKm.toFixed(1)} km &bull; ~${liters.toFixed(1)} L (€${costEur.toFixed(2)})`,
        itinerary: carItinerary,
        desc: `Navigazione auto con calcolo consumi, costi e HUD 3D per rotonde e svolte.`
      });
    }

    // 4. EVENTUALI ALTRE ALTERNATIVE (es. Treno FS o altri percorsi fino a 4 opzioni)
    for (const it of candidateList) {
      if (structuredOptions.length >= 5) break;
      const already = structuredOptions.some(o => o.itinerary === it);
      if (already) continue;

      const rideLegs = (it.legs || []).filter(l => l.type === 'ride');
      const modes = Array.from(new Set(rideLegs.map(l => this.getTransitMode(l))));
      const isTrainOnly = modes.length === 1 && modes[0] === 'train';
      const modeLabels = modes.map(m => this.getModeLabel(m)).join(' + ');

      structuredOptions.push({
        id: 'opt_alt_' + structuredOptions.length,
        title: isTrainOnly ? 'Solo Treno FS' : `Opzione ${modeLabels}`,
        badge: isTrainOnly ? 'Ferroviario' : 'Alternativa',
        badgeClass: 'badge-alt',
        icon: isTrainOnly ? 'fa-train' : 'fa-route',
        color: isTrainOnly ? '#dc2626' : '#64748b',
        isPurePullman: modes.length === 1 && modes[0] === 'pullman',
        hasPullman: modes.includes('pullman'),
        isPullmanHybrid: modes.includes('pullman') && modes.length > 1,
        isFastest: false,
        durationText: this.formatDuration(it.totalSeconds),
        transfersText: it.transfers === 0 ? 'Diretto' : `${it.transfers} cambi`,
        itinerary: it,
        desc: `Percorso alternativo (${modeLabels}).`
      });
    }

    return structuredOptions;
  }

  setItineraryFilter(filter) {
    this.itineraryFilter = filter;
    if (!this.currentItineraryOptions || this.currentItineraryOptions.length === 0) return;

    let targetIdx = 0;
    if (filter === 'pullman') {
      const pIdx = this.currentItineraryOptions.findIndex(o => o.isPurePullman);
      if (pIdx !== -1) targetIdx = pIdx;
      else {
        const hIdx = this.currentItineraryOptions.findIndex(o => o.isPullmanHybrid || o.hasPullman);
        targetIdx = hIdx !== -1 ? hIdx : 0;
      }
    } else if (filter === 'fastest') {
      const fIdx = this.currentItineraryOptions.findIndex(o => o.isFastest);
      targetIdx = fIdx !== -1 ? fIdx : 0;
    } else if (filter === 'car') {
      const cIdx = this.currentItineraryOptions.findIndex(o => o.isCar);
      targetIdx = cIdx !== -1 ? cIdx : 0;
    } else {
      targetIdx = 0;
    }

    this.selectItineraryOption(targetIdx);
  }

  selectItineraryOption(idx) {
    if (!this.currentItineraryOptions || !this.currentItineraryOptions[idx]) return;
    this.activeOptionIndex = idx;
    const opt = this.currentItineraryOptions[idx];
    const refLatLng = this.currentRefLatLng || this.userLatLng || [39.7, 16.5];

    this.setActiveItinerary(opt.itinerary, refLatLng);
    this.enhanceOriginWalkGeometry().then(() => {
      this.drawNavLegs(refLatLng);
      this.renderItineraryPanel(refLatLng);
      if (window.transitMap && this.navLegs) {
        window.transitMap._skipMoveEnd = true;
        this.fitWholeRoute();
        setTimeout(() => { if (window.transitMap) window.transitMap._skipMoveEnd = false; }, 1400);
      }
    });
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
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const platform = (line && (line.platform || line.binario || line.track)) || (mode === 'train' ? 'Binario 1 / 2 (verifica monitor FS)' : (mode === 'flight' ? 'Terminal Partenze / Gate' : (mode === 'tram' ? 'Banchina Tram' : (mode === 'taxi' ? 'Posteggio Taxi' : 'Banchina Bus'))));

    const legs = [
      { type: 'walk', isOrigin: true, fromLatLng: refLatLng, toStop: depStop, toName: depStop.name,
        coords: [refLatLng, depLL], meters: Math.round(walkMeters), seconds: Math.round(walkMeters / 1.35), elevGain: null },
      { type: 'ride', mode: mode, line: Object.assign({}, line, { mode: mode }), boardStop: depStop, alightStop: destObj,
        boardName: depStop.name, alightName: destObj.name, coords: busCoords,
        stopsCount: Math.max(1, busCoords.length - 1), meters: Math.round(rideMeters), platform: platform }
    ];
    const totalSeconds = Math.round((walkMeters / 1.35) + (rideMeters / 8.33));
    return {
      legs, transfers: 0, rideCount: 1,
      totalWalkMeters: Math.round(walkMeters), totalRideMeters: Math.round(rideMeters),
      totalSeconds: totalSeconds,
      rideStops: legs[1].stopsCount, destinationStop: destObj, servingLines: routeInfo.servingLines,
      isPurePullman: mode === 'pullman',
      hasPullman: mode === 'pullman',
      hasTrain: mode === 'train',
      source: 'localDirect'
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
      const isDrive = leg.type === 'drive';
      const isRide = leg.type === 'ride';
      const color = isDrive ? '#2563eb' : (isRide ? ((leg.line && leg.line.color) || '#0284c7') : (leg.isOrigin ? '#2563eb' : '#ea580c'));
      const shown = leg.revealed ? leg.coords : [];

      leg.glow = L.polyline(shown, {
        color: '#ffffff', weight: isDrive ? 14 : (isRide ? 12 : 11), opacity: 0.85, lineCap: 'round', lineJoin: 'round'
      }).addTo(this.geoLayer);

      if (isDrive) {
        const kmTxt = (leg.meters / 1000).toFixed(1);
        const minTxt = Math.max(1, Math.round(leg.seconds / 60));
        leg.polyline = L.polyline(shown, {
          color: '#2563eb', weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round', className: 'driving-route-polyline'
        }).bindTooltip(`🚗 <strong>Guida in Auto:</strong> ${kmTxt} km &bull; ~${minTxt} min`,
          { sticky: true, className: 'custom-map-tooltip' }).addTo(this.geoLayer);
      } else if (isRide) {
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

      // Scansione automatica Radar POI lungo il percorso (Benzinai, Autogrill, Autovelox)
      if (window.radarEngine && all.length >= 2) {
        window.radarEngine.scanPOIsAlongRoute(all).then(() => {
          const radarContainer = document.getElementById("geoRadarBordoWrap");
          if (radarContainer && window.radarEngine) {
            radarContainer.innerHTML = window.radarEngine.generateRadarItinerarySectionHtml();
          }
        });
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
    const destStop = this.activeItinerary && this.activeItinerary.destinationStop;

    if (this.activeItinerary && this.activeItinerary.isCar) {
      const driveLeg = legs[0];
      const steps = (driveLeg && driveLeg.steps) || [];
      steps.forEach((s) => {
        const man = s.maneuver || {};
        const isRoundabout = man.type === 'roundabout' || man.type === 'rotary' || man.type === 'roundabout turn';
        if (isRoundabout && man.location) {
          const exit = man.exit || 2;
          const rIcon = L.divIcon({
            html: `<div class="map-rotonda-3d-pin" title="Rotonda 3D: Prendi la ${exit}ª uscita"><span>${exit}</span></div>`,
            className: 'map-rotonda-pin-wrap',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          });
          const rm = L.marker(man.location, { icon: rIcon, zIndexOffset: 2800 })
            .bindPopup(`
              <div style="min-width:210px;padding:5px;">
                <span style="background:#10b981;color:#fff;padding:3px 8px;border-radius:4px;font-size:0.72rem;font-weight:800;display:inline-block;margin-bottom:4px;">
                  <i class="fa-solid fa-rotate-right"></i> ROTONDA 3D
                </span>
                <h4 style="margin:2px 0;font-size:0.95rem;color:#0f172a;font-weight:800;">Prendi la ${exit}ª uscita</h4>
                <div style="color:#0369a1;font-size:0.8rem;margin-top:2px;">Direzione: <strong>${s.name || 'Prossima via'}</strong></div>
              </div>
            `)
            .addTo(this.geoLayer);
          this.legMarkers.push(rm);
        }
      });

      if (destStop) {
        const dLL = [destStop.lat_actual || destStop.lat, destStop.lng_actual || destStop.lng];
        const dIcon = L.divIcon({
          html: `<div class="target-alt-marker-pulse" style="background:#2563eb;"><i class="fa-solid fa-flag-checkered"></i></div>`,
          className: 'target-marker-wrapper', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30]
        });
        this.destMarker = L.marker(dLL, { icon: dIcon, zIndexOffset: 2600 }).bindPopup(
          `<div style="min-width:200px;padding:4px;"><span style="background:#2563eb;color:#fff;padding:4px 10px;border-radius:6px;font-weight:800;font-size:0.76rem;"><i class="fa-solid fa-flag-checkered"></i> DESTINAZIONE AUTO</span><h4 style="margin:4px 0 2px;font-size:1.05rem;color:#0f172a;font-weight:800;">${destStop.name}</h4></div>`
        ).addTo(this.geoLayer);
        this.legMarkers.push(this.destMarker);
      }
      return;
    }

    const rideLegs = legs.filter(l => l.type === 'ride');

    rideLegs.forEach((leg, idx) => {
      const b = leg.boardStop;
      if (!b) return;
      const bLL = [b.lat_actual || b.lat, b.lng_actual || b.lng];
      const code = leg.line ? (leg.line.code || 'Mezzo') : 'Mezzo';
      const color = (leg.line && leg.line.color) || '#16a34a';
      const isFirst = idx === 0;
      const prevCode = (idx > 0 && rideLegs[idx - 1].line) ? (rideLegs[idx - 1].line.code || 'mezzo') : '';
      const transferNo = idx; // per idx>=1 e' il numero del cambio

      const curMode = this.getTransitMode(leg);
      const curIcon = this.getModeIcon(curMode);
      const curVerb = this.getModeVerb(curMode);
      const curTicket = this.getTicketAdvice(curMode);
      const curPlatform = leg.platform || this.getPlatformAdvice(leg, curMode);
      const curColor = this.getModeColor(curMode);

      let m;
      if (isFirst) {
        // Punto di SALITA (verde, pulsante)
        const pin = L.divIcon({
          html: `<div class="serving-departure-nav-pin" style="background:${curColor};color:#fff;border:3px solid #fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px ${curColor}bb,0 0 0 6px ${curColor}33;font-size:1.05rem;animation:pulse-nav-pin 2s infinite;"><i class="fa-solid ${curIcon}"></i></div>`,
          className: 'serving-dep-pin-wrapper', iconSize: [44, 44], iconAnchor: [22, 44]
        });
        m = L.marker(bLL, { icon: pin, zIndexOffset: 3000 }).bindPopup(
          `<div style="min-width:250px;padding:6px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;">
              <span style="background:#16a34a;color:#fff;padding:3px 8px;border-radius:5px;font-weight:800;font-size:0.72rem;"><i class="fa-solid fa-circle-check"></i> SALI QUI</span>
              <span style="background:${curColor};color:#fff;padding:3px 8px;border-radius:5px;font-weight:800;font-size:0.72rem;"><i class="fa-solid ${curIcon}"></i> ${this.getModeLabel(curMode).toUpperCase()}</span>
            </div>
            <h4 style="margin:2px 0 4px 0;font-size:1.05rem;color:#0f172a;font-weight:800;">${b.name}</h4>
            <p style="margin:0 0 6px 0;font-size:0.84rem;color:#0f172a;font-weight:700;">
              <i class="fa-solid ${curIcon}" style="color:${curColor}"></i> <strong>${curVerb}</strong>: ${code}${leg.line?.name ? ` <small>(${leg.line.name})</small>` : ''}
            </p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin-bottom:6px;font-size:0.78rem;">
              <div style="margin-bottom:4px;color:#0369a1;"><i class="fa-solid fa-signs-post"></i> <strong>Dove salire:</strong> ${curPlatform}</div>
              <div style="color:#166534;"><i class="fa-solid fa-ticket"></i> <strong>Biglietto:</strong> ${curTicket.title}</div>
            </div>
            <small style="color:#64748b;display:block;">Scendi a <strong>${leg.alightName || ''}</strong> (${leg.stopsCount || 1} fermate)</small>
          </div>`
        ).addTo(this.geoLayer);
        m.bindTooltip(`Sali (${this.getModeLabel(curMode)}): ${code}`, { permanent: true, direction: 'top', offset: [0, -40], className: 'geo-change-label geo-change-board' });
        this.depMarker = m;
      } else {
        // Punto di CAMBIO (arancione, con numero + etichetta permanente)
        const prevLeg = rideLegs[idx - 1];
        const prevMode = this.getTransitMode(prevLeg);
        const isModeChange = prevMode !== curMode;

        const pin = L.divIcon({
          html: `<div class="geo-transfer-pin" style="background:#ea580c;color:#fff;border:3px solid #fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(234,88,12,0.7),0 0 0 6px rgba(234,88,12,0.22);position:relative;"><i class="fa-solid fa-arrows-rotate"></i><span style="position:absolute;top:-7px;right:-7px;background:#0f172a;color:#fff;border-radius:50%;width:19px;height:19px;font-size:0.72rem;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;">${transferNo}</span></div>`,
          className: 'geo-transfer-pin-wrapper', iconSize: [40, 40], iconAnchor: [20, 40]
        });
        m = L.marker(bLL, { icon: pin, zIndexOffset: 3000 }).bindPopup(
          `<div style="min-width:260px;padding:6px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;">
              <span style="background:#ea580c;color:#fff;padding:3px 8px;border-radius:5px;font-weight:800;font-size:0.72rem;"><i class="fa-solid fa-arrows-rotate"></i> CAMBIO ${transferNo}</span>
              <span style="background:${curColor};color:#fff;padding:3px 8px;border-radius:5px;font-weight:800;font-size:0.72rem;"><i class="fa-solid ${curIcon}"></i> ${this.getModeLabel(curMode).toUpperCase()}</span>
            </div>
            ${isModeChange ? `
            <div style="background:#fef3c7;border:1px solid #fde68a;padding:5px 8px;border-radius:6px;margin-bottom:6px;color:#92400e;font-size:0.78rem;font-weight:800;">
              <i class="fa-solid fa-right-left"></i> Cambio Mezzo: da ${this.getModeLabel(prevMode)} a ${this.getModeLabel(curMode)}!
            </div>
            ` : ''}
            <h4 style="margin:2px 0 4px 0;font-size:1.02rem;color:#0f172a;font-weight:800;">${b.name}</h4>
            <p style="margin:0 0 3px 0;font-size:0.8rem;color:#64748b;"><i class="fa-solid fa-arrow-down text-danger"></i> Scendi da <strong>${prevCode}</strong> (${this.getModeLabel(prevMode)})</p>
            <p style="margin:0 0 6px 0;font-size:0.84rem;color:#0f172a;font-weight:700;">
              <i class="fa-solid ${curIcon}" style="color:${curColor}"></i> <strong>${curVerb}</strong>: ${code}
            </p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin-bottom:6px;font-size:0.78rem;">
              <div style="margin-bottom:4px;color:#0369a1;"><i class="fa-solid fa-signs-post"></i> <strong>Dove salire / Binario:</strong> ${curPlatform}</div>
              <div style="color:#166534;"><i class="fa-solid fa-ticket"></i> <strong>Biglietto necessario:</strong> ${curTicket.title}</div>
            </div>
            <small style="color:#64748b;display:block;">Scendi a <strong>${leg.alightName || ''}</strong> (${leg.stopsCount || 1} fermate)</small>
          </div>`
        ).addTo(this.geoLayer);
        m.bindTooltip(`Cambio ${transferNo}: ${this.getModeLabel(prevMode)} ➔ ${this.getModeLabel(curMode)} (${code})`, { permanent: true, direction: 'top', offset: [0, -36], className: 'geo-change-label geo-change-transfer' });
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
        const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
        const curIcon = this.getModeIcon(currentMode);
        const curVerb = this.getModeVerb(currentMode);
        const curColor = this.getModeColor(currentMode);
        const curTicket = this.getTicketAdvice(currentMode);
        const curPlatform = this.getPlatformAdvice({ boardName: s.name }, currentMode);
        const pin = L.divIcon({
          html: `<div class="serving-departure-nav-pin" style="background:${curColor};color:#fff;border:3px solid #fff;border-radius:50%;width:46px;height:46px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px ${curColor}cc,0 0 0 8px ${curColor}33;font-size:1.35rem;animation:pulse-nav-pin 2s infinite;"><i class="fa-solid ${curIcon}"></i></div>`,
          className: 'serving-dep-pin-wrapper', iconSize: [46, 46], iconAnchor: [23, 46]
        });
        this.depMarker = L.marker(sLL, { icon: pin, zIndexOffset: 3000 }).bindPopup(
          `<div style="min-width:240px;padding:6px;">
            <span style="background:${curColor};color:#fff;padding:3px 8px;border-radius:5px;font-weight:800;font-size:0.72rem;display:inline-block;margin-bottom:6px;"><i class="fa-solid fa-location-dot"></i> FERMATA PIÙ VICINA</span>
            <h4 style="margin:2px 0 4px;font-size:1.05rem;color:#0f172a;font-weight:800;">${s.name}</h4>
            <p style="margin:0 0 6px;font-size:0.84rem;color:#0f172a;font-weight:700;"><i class="fa-solid ${curIcon}" style="color:${curColor}"></i> ${curVerb}</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:0.78rem;">
              <div style="margin-bottom:3px;color:#0369a1;"><i class="fa-solid fa-signs-post"></i> <strong>Dove salire:</strong> ${curPlatform}</div>
              <div style="color:#166534;"><i class="fa-solid fa-ticket"></i> <strong>Biglietto:</strong> ${curTicket.title}</div>
            </div>
          </div>`
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
     METODI DI SUPPORTO MULTI-MODALE (PULLMAN, TRENI, TRAM, TAXI, AEREI)
     ========================================================================== */

  getTransitMode(leg) {
    if (!leg) return (typeof getActiveMode === 'function' ? getActiveMode() : 'pullman');
    if (leg.mode) return leg.mode;
    if (leg.line && leg.line.mode) return leg.line.mode;

    const code = ((leg.line && (leg.line.code || leg.line.name)) || '').toLowerCase();
    const name = ((leg.line && leg.line.name) || '').toLowerCase();
    const all = code + ' ' + name;
    if (/auto|car|macchina|guida/.test(all)) return 'car';
    if (/freccia|italo|treno|intercity|regionale|\br\b|\brv\b|fs\b|rfi|eurocity|rail/.test(all)) return 'train';
    if (/volo|flight|aereo|ryanair|ita\b|easyjet|air/.test(all)) return 'flight';
    if (/taxi|ncc|radiotaxi/.test(all)) return 'taxi';
    if (/tram|metro|metropolitana/.test(all)) return 'tram';
    return (typeof getActiveMode === 'function' ? getActiveMode() : 'pullman');
  }

  getModeLabel(mode) {
    const labels = { pullman: 'Pullman', train: 'Treno', flight: 'Aereo', taxi: 'Taxi', tram: 'Tram', car: 'Auto' };
    return labels[mode] || 'Pullman';
  }

  getModeVerb(mode) {
    const verbs = {
      pullman: 'Stai prendendo il Pullman',
      train: 'Stai prendendo il Treno',
      flight: 'Stai prendendo il Volo',
      taxi: 'Stai prendendo il Taxi',
      tram: 'Stai prendendo il Tram',
      car: 'Stai guidando in Auto'
    };
    return verbs[mode] || 'Stai prendendo il Mezzo';
  }

  getModeIcon(mode) {
    const icons = { pullman: 'fa-bus', train: 'fa-train', flight: 'fa-plane', taxi: 'fa-taxi', tram: 'fa-train-tram', car: 'fa-car' };
    return icons[mode] || 'fa-bus';
  }

  getModeColor(mode) {
    const colors = { pullman: '#0284c7', train: '#dc2626', flight: '#0284c7', taxi: '#d97706', tram: '#059669', car: '#2563eb' };
    return colors[mode] || '#0284c7';
  }

  getTicketAdvice(mode) {
    switch (mode) {
      case 'train':
        return {
          mode: 'train',
          title: 'Biglietto Ferroviario (Trenitalia / Italo)',
          badge: 'Biglietto Treno',
          desc: 'Biglietto Regionale FS / Frecce Trenitalia o Italo.',
          howToBuy: 'Acquistabile alle emettitrici automatiche in stazione, all\'app Trenitalia / Italo, sul sito FS o nelle tabaccherie convenzionate PUNTOLIS. Ricordati di convalidare prima di salire sul regionale.',
          icon: 'fa-train',
          color: '#dc2626'
        };
      case 'flight':
        return {
          mode: 'flight',
          title: 'Biglietto Aereo & Carta d\'Imbarco',
          badge: 'Biglietto Aereo',
          desc: 'Prenotazione del volo con check-in online completato.',
          howToBuy: 'Effettua il check-in online dall\'app o sito della compagnia aerea e salva la carta d\'imbarco QR sullo smartphone prima dei controlli di sicurezza.',
          icon: 'fa-plane-departure',
          color: '#0284c7'
        };
      case 'tram':
        return {
          mode: 'tram',
          title: 'Biglietto Rete Urbana Tram / Metro',
          badge: 'Biglietto Tram / Metro',
          desc: 'Biglietto orario per la rete urbana cittadina.',
          howToBuy: 'Acquistabile alle emettitrici in fermata, tabaccherie o tramite contactless tap & go direttamente ai varchi o a bordo.',
          icon: 'fa-train-tram',
          color: '#059669'
        };
      case 'taxi':
        return {
          mode: 'taxi',
          title: 'Tariffa Taxi a Tassametro',
          badge: 'Tariffa Taxi',
          desc: 'Corsa con calcolo a tassametro o tariffa fissa urbana.',
          howToBuy: 'Pagamento a fine corsa direttamente al tassista a bordo (contanti, carta di credito o POS bancomat).',
          icon: 'fa-taxi',
          color: '#d97706'
        };
      case 'pullman':
      default:
        return {
          mode: 'pullman',
          title: 'Biglietto Pullman / Autolinee TPL',
          badge: 'Biglietto Pullman',
          desc: 'Biglietto Corsa Singola o Extraurbano Regionale TPL.',
          howToBuy: 'Acquistabile dal Portafoglio Biglietti dell\'app ItaliaBus, a bordo dall\'autista, in tabaccheria o nelle edicole autorizzate.',
          icon: 'fa-ticket',
          color: '#0284c7'
        };
    }
  }

  getPlatformAdvice(leg, mode) {
    if (leg && leg.platform) {
      return leg.platform;
    }
    switch (mode) {
      case 'train':
        return 'Binario 1 / 2 FS (controlla i monitor partenze RFI in stazione)';
      case 'flight':
        return 'Terminal Partenze / Gate Imbarco (indicato sui monitor aeroportuali)';
      case 'tram':
        return 'Banchina Fermata Tram (in direzione indicata)';
      case 'taxi':
        return 'Posteggio Taxi Ufficiale / Piazzale esterno stazione';
      case 'pullman':
      default:
        return 'Banchina Bus / Corsia Fermata su strada';
    }
  }

  /* ==========================================================================
     PANNELLO ITINERARIO TRASCINABILE PASSO-PASSO
     ========================================================================== */

  renderItineraryPanel(refLatLng) {
    if (!this.panel || !this.activeItinerary) return;
    const it = this.activeItinerary;
    const legs = it.legs || [];
    const dest = it.destinationStop;

    const rideLegs = legs.filter(l => l.type === 'ride' || l.type === 'drive');
    const distinctModes = Array.from(new Set(legs.map(l => this.getTransitMode(l)).filter(m => m !== 'walk')));
    if (distinctModes.length === 0) distinctModes.push(it.isCar ? 'car' : 'pullman');
    const isMultiModal = distinctModes.length > 1;

    const steps = [];
    let lastRideMode = null;

    if (it.isCar) {
      // 🚗 MODALITÀ AUTO & NAVIGATORE 3D
      const driveLeg = legs[0] || {};
      const driveSteps = driveLeg.steps || [];

      for (let i = 0; i < driveSteps.length; i++) {
        const step = driveSteps[i];
        const man = step.maneuver || {};
        const isRoundabout = man.type === 'roundabout' || man.type === 'rotary' || man.type === 'roundabout turn';
        const isTurn = man.type === 'turn' || man.type === 'fork' || man.type === 'on ramp' || man.type === 'off ramp';
        const isArrive = man.type === 'arrive' || i === driveSteps.length - 1;
        const mins = Math.max(1, Math.round((step.duration || 60) / 60));
        const distTxt = step.distance >= 1000 ? (step.distance / 1000).toFixed(1) + ' km' : step.distance + ' m';
        const loc = man.location ? `${man.location[0]}, ${man.location[1]}` : 'null, null';

        if (isRoundabout) {
          const rotondaSvg = this.generateRoundabout3DSvg(man.exit || 2, man.modifier, step.name);
          steps.push(`
            <div class="geo-step-body geo-step-car-roundabout" onclick="window.geoLocator.focusStepLocation(${loc})" role="button" tabindex="0" title="Clicca per centrare la rotonda sulla mappa">
              ${rotondaSvg}
              <div class="geo-step-meta-row">
                <span><i class="fa-solid fa-arrows-left-right"></i> Distanza: <strong>${distTxt}</strong></span>
                <span><i class="fa-solid fa-clock"></i> ~${mins} min</span>
                <span class="geo-step-zoom-hint"><i class="fa-solid fa-magnifying-glass-plus"></i> Centra 3D</span>
              </div>
            </div>
          `);
        } else if (isTurn) {
          const turnSvg = this.generateTurn3DSvg(man.type, man.modifier, step.name);
          steps.push(`
            <div class="geo-step-body geo-step-car-turn" onclick="window.geoLocator.focusStepLocation(${loc})" role="button" tabindex="0" title="Clicca per centrare la svolta sulla mappa">
              ${turnSvg}
              <div class="geo-step-main-text" style="margin-top:6px;">
                Prosegui per <strong>${distTxt}</strong> (~${mins} min) su <strong>${step.name || 'Strada'}</strong>.
              </div>
            </div>
          `);
        } else if (isArrive) {
          steps.push(`
            <div class="geo-step-body" style="border-left: 3px solid #16a34a;">
              <div class="geo-step-main-text" style="color:#16a34a; font-weight:800;">
                <i class="fa-solid fa-flag-checkered text-success"></i> Arrivo a <strong>${dest ? dest.name : (step.name || 'Destinazione')}</strong> (${distTxt}).
              </div>
            </div>
          `);
        } else {
          steps.push(`
            <div class="geo-step-body">
              <div class="geo-step-main-text">
                <i class="fa-solid fa-arrow-up text-primary"></i> Continua dritto su <strong>${step.name || 'Strada principale'}</strong> per <strong>${distTxt}</strong> (~${mins} min).
              </div>
            </div>
          `);
        }
      }
    } else {
      // 🚌 MODALITÀ TRASPORTO PUBBLICO (Pullman, Treni, Tram, Taxi, Voli)
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (leg.type === 'walk') {
          let terrain = '';
          if (leg.elevGain != null && Math.abs(leg.elevGain) >= 5) {
            terrain = leg.elevGain < 0
              ? ` <span class="terrain-chip terrain-down"><i class="fa-solid fa-arrow-trend-down"></i> in discesa (${Math.abs(leg.elevGain)} m)</span>`
              : ` <span class="terrain-chip terrain-up"><i class="fa-solid fa-arrow-trend-up"></i> in salita (${leg.elevGain} m)</span>`;
          }
          const mins = Math.max(1, Math.round((leg.seconds || leg.meters / 1.35) / 60));
          const dirWord = leg.isOrigin ? 'Cammina' : 'Scendi e cammina';
          steps.push(`
            <div class="geo-step-body">
              <div class="geo-step-main-text">
                <i class="fa-solid fa-person-walking text-primary"></i> <strong>${dirWord} ${leg.meters} m</strong> (~${mins} min)${terrain} fino a <strong>${leg.toName}</strong>.
              </div>
            </div>
          `);
        } else {
          const legMode = this.getTransitMode(leg);
          const legIcon = this.getModeIcon(legMode);
          const legVerb = this.getModeVerb(legMode);
          const legColor = this.getModeColor(legMode);
          const legTicket = this.getTicketAdvice(legMode);
          const legPlatform = leg.platform || this.getPlatformAdvice(leg, legMode);
          const isModeChange = lastRideMode && lastRideMode !== legMode;
          const prevModeLabel = lastRideMode ? this.getModeLabel(lastRideMode) : null;
          lastRideMode = legMode;

          const code = leg.line ? (leg.line.code || leg.line.name || 'Mezzo') : 'Mezzo';
          const lname = leg.line && leg.line.name ? leg.line.name : '';
          const nstops = leg.stopsCount || 1;

          let changeBanner = '';
          if (isModeChange) {
            changeBanner = `
              <div class="geo-intermodal-alert">
                <i class="fa-solid fa-right-left"></i>
                <span><strong>CAMBIO MEZZO / INTERSCAMBIO:</strong> Stai passando da <strong>${prevModeLabel}</strong> a <strong>${this.getModeLabel(legMode)}</strong>!</span>
              </div>
            `;
          }

          steps.push(`
            <div class="geo-step-body">
              ${changeBanner}
              <div class="geo-step-mode-header">
                <span class="geo-step-mode-pill" style="background:${legColor}; color:#fff;">
                  <i class="fa-solid ${legIcon}"></i> ${legVerb.toUpperCase()}
                </span>
                <span class="geo-step-line-name" style="color:${legColor}; font-weight:800;">${code}</span>
              </div>
              <div class="geo-step-main-text" style="margin:6px 0;">
                Sali su <strong>${code}</strong>${lname ? ` <small>(${lname})</small>` : ''} e <strong>scendi a ${leg.alightName}</strong> <small>(${nstops} ferma${nstops === 1 ? 'ta' : 'te'})</small>.
              </div>
              <div class="geo-step-details-grid">
                <div class="geo-step-platform-box">
                  <i class="fa-solid fa-signs-post text-primary"></i>
                  <div>
                    <strong>Dove salire / Binario:</strong>
                    <span>${legPlatform} presso <em>${leg.boardName}</em></span>
                  </div>
                </div>
                <div class="geo-step-ticket-box">
                  <i class="fa-solid fa-ticket text-success"></i>
                  <div>
                    <strong>Biglietto richiesto:</strong>
                    <span>${legTicket.title}</span>
                    <small style="display:block; color:#64748b; margin-top:2px;">${legTicket.howToBuy}</small>
                  </div>
                </div>
              </div>
            </div>
          `);
        }
      }

      steps.push(`
        <div class="geo-step-body">
          <div class="geo-step-main-text" style="color:#16a34a; font-weight:800;">
            <i class="fa-solid fa-flag-checkered text-success"></i> Sei arrivato a <strong>${dest ? dest.name : 'destinazione'}</strong>.
          </div>
        </div>
      `);
    }

    const stepsHtml = steps.map((s, i) =>
      `<li class="geo-step-item"><span class="geo-step-num">${i + 1}</span>${s}</li>`
    ).join('');

    // Box riepilogativo Biglietti (solo per trasporto pubblico)
    let ticketsGuideBox = '';
    if (!it.isCar) {
      const ticketsGuideHtml = distinctModes.map(m => {
        const t = this.getTicketAdvice(m);
        return `
          <div class="geo-ticket-guide-item" style="border-left: 3px solid ${t.color};">
            <div class="geo-tgi-head">
              <span class="geo-tgi-badge" style="background:${t.color}; color:#fff;"><i class="fa-solid ${t.icon}"></i> ${t.badge}</span>
              <strong>${t.title}</strong>
            </div>
            <p class="geo-tgi-desc">${t.desc}</p>
            <div class="geo-tgi-buy"><i class="fa-solid fa-cart-shopping"></i> <strong>Come fare il biglietto:</strong> ${t.howToBuy}</div>
          </div>
        `;
      }).join('');

      ticketsGuideBox = `
        <div class="geo-tickets-guide-box">
          <div class="geo-tickets-guide-head">
            <div style="display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-ticket-simple" style="color:#0284c7; font-size:1.1rem;"></i>
              <strong>Guida Biglietti & Titoli di Viaggio</strong>
            </div>
            ${isMultiModal ? '<span class="geo-multi-badge">Biglietti Separati</span>' : ''}
          </div>
          ${isMultiModal ? `
            <div class="geo-tickets-multi-note">
              <i class="fa-solid fa-circle-info"></i>
              <span>Questo percorso prevede <strong>${distinctModes.map(m => this.getModeLabel(m)).join(' + ')}</strong>: assicurati di avere i rispettivi biglietti per ciascuna tratta prima di salire.</span>
            </div>
          ` : ''}
          <div class="geo-tickets-guide-list">
            ${ticketsGuideHtml}
          </div>
        </div>
      `;
    }

    // Dashboard consumi & costi per l'Auto
    let carDashboardBox = '';
    if (it.isCar) {
      carDashboardBox = `
        <div class="geo-car-stats-panel">
          <div class="geo-car-stats-head">
            <div style="display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-car-side" style="color:#2563eb; font-size:1.15rem;"></i>
              <strong>Computer di Bordo & Consumi Stimati</strong>
            </div>
            <span class="geo-car-badge-hud"><i class="fa-solid fa-cube"></i> HUD 3D Attivo</span>
          </div>
          <div class="geo-car-stats-grid">
            <div class="geo-car-stat-card">
              <span class="geo-csc-icon" style="color:#f59e0b;"><i class="fa-solid fa-gas-pump"></i></span>
              <div>
                <strong class="geo-csc-val">~${(it.consumptionLiters || 0).toFixed(1)} L</strong>
                <span class="geo-csc-lbl">Consumo Carburante</span>
              </div>
            </div>
            <div class="geo-car-stat-card">
              <span class="geo-csc-icon" style="color:#10b981;"><i class="fa-solid fa-euro-sign"></i></span>
              <div>
                <strong class="geo-csc-val">~€${(it.costEstimateEur || 0).toFixed(2)}</strong>
                <span class="geo-csc-lbl">Spesa Carburante</span>
              </div>
            </div>
            <div class="geo-car-stat-card">
              <span class="geo-csc-icon" style="color:#0284c7;"><i class="fa-solid fa-route"></i></span>
              <div>
                <strong class="geo-csc-val">${(it.totalDistanceKm || 0).toFixed(1)} km</strong>
                <span class="geo-csc-lbl">Distanza Totale</span>
              </div>
            </div>
            <div class="geo-car-stat-card">
              <span class="geo-csc-icon" style="color:#14b8a6;"><i class="fa-solid fa-leaf"></i></span>
              <div>
                <strong class="geo-csc-val">~${(it.co2EstimateKg || 0).toFixed(1)} kg</strong>
                <span class="geo-csc-lbl">Emissioni CO2</span>
              </div>
            </div>
          </div>
          <div class="geo-car-rotonde-note">
            <i class="fa-solid fa-rotate-right text-success"></i>
            <span><strong>${it.roundaboutsCount || 0} Rotonde</strong> sul percorso: visualizzatore 3D con traiettoria attiva, corsia da occupare e numero di uscite.</span>
          </div>
        </div>
      `;
    }

    const activeOpt = (this.currentItineraryOptions && this.currentItineraryOptions[this.activeOptionIndex]) || null;
    const hasOptions = this.currentItineraryOptions && this.currentItineraryOptions.length > 1;

    let optionsSelectorHtml = '';
    if (this.currentItineraryOptions && this.currentItineraryOptions.length > 0) {
      const filterPills = `
        <div class="geo-itinerary-filter-pills">
          <button type="button" class="geo-filter-pill ${this.itineraryFilter === 'pullman' ? 'active' : ''}" onclick="window.geoLocator.setItineraryFilter('pullman')">
            <i class="fa-solid fa-bus"></i> Solo Pullman
          </button>
          <button type="button" class="geo-filter-pill ${this.itineraryFilter === 'fastest' ? 'active' : ''}" onclick="window.geoLocator.setItineraryFilter('fastest')">
            <i class="fa-solid fa-bolt"></i> Più Veloce
          </button>
          <button type="button" class="geo-filter-pill ${this.itineraryFilter === 'car' ? 'active' : ''}" onclick="window.geoLocator.setItineraryFilter('car')">
            <i class="fa-solid fa-car-side"></i> In Auto (3D)
          </button>
          <button type="button" class="geo-filter-pill ${this.itineraryFilter === 'all' ? 'active' : ''}" onclick="window.geoLocator.setItineraryFilter('all')">
            <i class="fa-solid fa-layer-group"></i> Tutte (${this.currentItineraryOptions.length})
          </button>
        </div>
      `;

      const cardsHtml = this.currentItineraryOptions.map((opt, idx) => {
        const isSel = idx === this.activeOptionIndex;
        return `
          <div class="geo-route-option-card ${isSel ? 'selected' : ''}" onclick="window.geoLocator.selectItineraryOption(${idx})" role="button" tabindex="0" title="${opt.desc}">
            <div class="geo-opt-top">
              <span class="geo-opt-badge ${opt.badgeClass}"><i class="fa-solid ${opt.icon}"></i> ${opt.badge}</span>
              <strong class="geo-opt-duration"><i class="fa-solid fa-clock"></i> ${opt.durationText}</strong>
            </div>
            <div class="geo-opt-title">${opt.title}</div>
            <div class="geo-opt-sub"><i class="fa-solid fa-arrows-turn-right"></i> ${opt.transfersText}</div>
            ${isSel ? '<div class="geo-opt-selected-tag"><i class="fa-solid fa-circle-check"></i> Attivo sulla mappa</div>' : '<div class="geo-opt-select-prompt"><i class="fa-solid fa-arrow-pointer"></i> Clicca per scegliere</div>'}
          </div>
        `;
      }).join('');

      optionsSelectorHtml = `
        <div class="geo-options-wrapper">
          <div class="geo-options-header">
            <span class="geo-options-title"><i class="fa-solid fa-shuffle"></i> Opzioni e Percorsi Disponibili:</span>
          </div>
          ${filterPills}
          ${hasOptions ? `<div class="geo-options-carousel">${cardsHtml}</div>` : ''}
        </div>
      `;
    }

    let optionNoticeHtml = '';
    if (activeOpt && activeOpt.notice) {
      optionNoticeHtml = `
        <div class="geo-option-notice-alert">
          <i class="fa-solid fa-circle-info text-warning" style="font-size:1.1rem; flex-shrink:0;"></i>
          <div>
            <strong>Info Tragitto Pullman:</strong>
            <div>${activeOpt.notice}</div>
          </div>
        </div>
      `;
    }

    const transfersBadge = it.isCar
      ? `<span class="geo-transfers-badge geo-direct" style="background:#2563eb; color:#fff;"><i class="fa-solid fa-car"></i> Guida Diretta</span>`
      : (it.transfers > 0
        ? `<span class="geo-transfers-badge"><i class="fa-solid fa-arrows-turn-right"></i> ${it.transfers} cambio${it.transfers > 1 ? 'i' : ''}</span>`
        : `<span class="geo-transfers-badge geo-direct"><i class="fa-solid fa-bolt"></i> Diretto</span>`);

    const totalWalkTxt = it.totalWalkMeters >= 1000 ? (it.totalWalkMeters / 1000).toFixed(1) + ' km' : it.totalWalkMeters + ' m';
    const boardName = this.nearestStop ? this.nearestStop.name : '';
    const gmapsUrl = it.isCar ? this.buildGmapsCarUrl(refLatLng, dest) : this.buildGmapsTransitUrl(refLatLng, dest);
    const mainMode = it.isCar ? 'car' : (distinctModes[0] || 'pullman');
    const vehIcon = this.getModeIcon(mainMode);

    this.panel.innerHTML = `
      <div class="geo-panel-drag-header" id="geoPanelDragHeader">
        <div class="geo-drag-handle-pill" title="Trascina per spostare l'itinerario sulla mappa"><span></span></div>
        <div class="geo-panel-title-area">
          <div class="geo-panel-badge-row">
            <span class="geo-panel-top-badge"><i class="fa-solid ${it.isCar ? 'fa-car' : 'fa-route'}"></i> ${it.isCar ? 'NAVIGATORE AUTO' : 'ITINERARIO'}</span>
            ${transfersBadge}
            ${distinctModes.map(m => `<span class="geo-mode-pill-mini" style="background:${this.getModeColor(m)}; color:#fff;"><i class="fa-solid ${this.getModeIcon(m)}"></i> ${this.getModeLabel(m)}</span>`).join('')}
          </div>
          <h3 class="geo-panel-title">Verso <strong>${dest ? dest.name : 'Destinazione'}</strong></h3>
        </div>
        <div class="geo-panel-actions">
          <button type="button" class="btn-geo-panel-tool btn-geo-panel-minimize" id="btnMinMaxGeoPanel" title="Riduci/Espandi Itinerario">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <button type="button" class="btn-geo-panel-tool btn-geo-panel-close" id="btnCloseGeoPanel" title="Chiudi Itinerario e Ripristina Mappa">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="geo-panel-scroll-body" id="geoPanelScrollBody">
        ${optionsSelectorHtml}
        ${optionNoticeHtml}
        ${carDashboardBox}

        <div class="geo-summary-bar">
          ${it.isCar 
            ? `<small class="text-muted"><i class="fa-solid fa-car"></i> Guida in Auto &bull; ${(it.totalDistanceKm || 0).toFixed(1)} km &bull; <i class="fa-solid fa-clock"></i> ${this.formatDuration(it.totalSeconds)}</small>`
            : `<small class="text-muted"><i class="fa-solid ${vehIcon}"></i> ${it.rideCount} mezzo${it.rideCount === 1 ? '' : 'i'} &bull; <i class="fa-solid fa-person-walking"></i> ${totalWalkTxt} a piedi &bull; <i class="fa-solid fa-clock"></i> ${this.formatDuration(it.totalSeconds)}</small>`
          }
        </div>

        <ol class="geo-steps-list" id="geoStepsList">${stepsHtml}</ol>

        ${ticketsGuideBox}

        <div id="geoRadarBordoWrap">
          ${window.radarEngine ? window.radarEngine.generateRadarItinerarySectionHtml() : ''}
        </div>

        ${!it.isCar ? `
        <div class="geo-departures-wrapper" style="margin-top:14px;">
          <div class="geo-departures-title" style="font-weight:800; font-size:0.9rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-clock text-primary"></i> Prossime partenze da <strong>${boardName}</strong>
          </div>
          <div id="geoDeparturesList" class="geo-dep-list-grid"></div>
          <div id="geoVerdict" class="geo-verdict-box" style="margin-top:8px;"></div>
        </div>
        ` : ''}

        <div class="geo-footer-actions" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
          ${!it.isCar ? `
          <button class="btn btn-primary btn-sm" onclick="window.geoLocator.onVisualizzaOrari()" style="flex:1;">
            <i class="fa-solid fa-route"></i> Orari & Traccia Completa
          </button>
          ` : `
          <button class="btn btn-primary btn-sm" onclick="window.geoLocator.fitWholeRoute()" style="flex:1;">
            <i class="fa-solid fa-location-crosshairs"></i> Inizia Navigazione 3D
          </button>
          `}
          ${gmapsUrl ? `
          <a href="${gmapsUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-sm btn-gmaps-compare" title="Apri e confronta questo percorso su Google Maps">
            <i class="fa-brands fa-google"></i> Maps
          </a>` : ''}
          ${!it.isCar ? `
          <button class="btn btn-outline btn-sm" onclick="window.geoLocator.goToLiveBoardTimetable()">
            <i class="fa-solid fa-table-list"></i> Tabellone
          </button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="window.geoLocator.fitWholeRoute()" title="Centra l'intero percorso">
            <i class="fa-solid fa-arrows-to-eye"></i> Vedi Tutto
          </button>
        </div>
      </div>
    `;

    this.panel.classList.add("open");
    this.setupDraggablePanel();
    if (!it.isCar) {
      this.startCountdown();
    }
  }

  /* Deep-link a Google Maps con indicazioni in AUTO */
  buildGmapsCarUrl(refLatLng, destStop) {
    const origin = this.userLatLng || refLatLng;
    if (!origin || !destStop) return null;
    const dLat = destStop.lat_actual || destStop.lat;
    const dLng = destStop.lng_actual || destStop.lng;
    if (dLat == null || dLng == null) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${origin[0]},${origin[1]}&destination=${dLat},${dLng}&travelmode=driving`;
  }

  /* Deep-link a Google Maps con indicazioni in TRASPORTO PUBBLICO */
  buildGmapsTransitUrl(refLatLng, destStop) {
    const origin = this.userLatLng || refLatLng;
    if (!origin || !destStop) return null;
    const dLat = destStop.lat_actual || destStop.lat;
    const dLng = destStop.lng_actual || destStop.lng;
    if (dLat == null || dLng == null) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${origin[0]},${origin[1]}&destination=${dLat},${dLng}&travelmode=transit`;
  }

  /* ==========================================================================
     RENDERING DEL PANNELLO INFORMATIVO SMART ROUTE TRASCINABILE
     ========================================================================== */

  renderSmartRoutePanel(routeInfo, refLatLng) {
    if (!this.panel) return;

    const dep = routeInfo.departureStop;
    const dest = routeInfo.destinationStop;
    const lines = routeInfo.servingLines || [];
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const isFlight = mode === 'flight';
    const isTrain = mode === 'train';
    const isTaxi = mode === 'taxi';

    const modeVerb = this.getModeVerb(mode);
    const modeColor = this.getModeColor(mode);
    const modeIcon = this.getModeIcon(mode);
    const ticketAdvice = this.getTicketAdvice(mode);
    const platformAdvice = (lines[0] && (lines[0].platform || lines[0].binario || lines[0].track)) || this.getPlatformAdvice({ boardName: dep.name }, mode);

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
      : `Fermata Più Vicina: <strong>${dep.name}</strong>`;

    const hasDest = !!(dest && !routeInfo.isDirectNearest);
    const vehicleWord = isFlight ? 'del Volo' : (isTrain ? 'del Treno' : (isTaxi ? 'del Taxi' : (mode === 'tram' ? 'del Tram' : 'del Bus')));

    this.panel.innerHTML = `
      <div class="geo-panel-drag-header" id="geoPanelDragHeader">
        <div class="geo-drag-handle-pill" title="Trascina per spostare il pannello"><span></span></div>
        <div class="geo-panel-title-area">
          <div class="geo-panel-badge-row">
            <span class="geo-panel-top-badge"><i class="fa-solid fa-circle-check"></i> FERMATA CONSIGLIATA</span>
            <span class="geo-mode-pill-mini" style="background:${modeColor}; color:#fff;"><i class="fa-solid ${modeIcon}"></i> ${this.getModeLabel(mode).toUpperCase()}</span>
          </div>
          <h3 class="geo-panel-title">${headTitle}</h3>
        </div>
        <div class="geo-panel-actions">
          <button type="button" class="btn-geo-panel-tool btn-geo-panel-minimize" id="btnMinMaxGeoPanel" title="Riduci/Espandi">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <button type="button" class="btn-geo-panel-tool btn-geo-panel-close" id="btnCloseGeoPanel" title="Chiudi e Ripristina Mappa">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="geo-panel-scroll-body" id="geoPanelScrollBody">
        <div class="geo-mode-notice-banner" style="background:${modeColor}15; border:1px solid ${modeColor}40; color:${modeColor}; padding:8px 12px; border-radius:8px; margin-bottom:12px; font-size:0.86rem; font-weight:800; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid ${modeIcon}"></i>
          <span>${modeVerb.toUpperCase()}</span>
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

        <!-- Box Indicazioni Salita & Biglietto -->
        <div class="geo-step-details-grid" style="margin:12px 0;">
          <div class="geo-step-platform-box">
            <i class="fa-solid fa-signs-post text-primary"></i>
            <div>
              <strong>Dove salire / Binario:</strong>
              <span>${platformAdvice} presso <em>${dep.name}</em></span>
            </div>
          </div>
          <div class="geo-step-ticket-box">
            <i class="fa-solid fa-ticket text-success"></i>
            <div>
              <strong>Biglietto necessario:</strong>
              <span>${ticketAdvice.title}</span>
              <small style="display:block; color:#64748b; margin-top:2px;">${ticketAdvice.howToBuy}</small>
            </div>
          </div>
        </div>

        <div class="geo-departures-wrapper" style="margin-top:12px;">
          <div class="geo-departures-title" style="font-weight:800; font-size:0.9rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-clock text-primary"></i> Prossime partenze da <strong>${dep.name}</strong> ${dest && !routeInfo.isDirectNearest ? `verso <strong>${dest.name}</strong>` : ''}
          </div>
          <div id="geoDeparturesList" class="geo-dep-list-grid"></div>
          <div id="geoVerdict" class="geo-verdict-box" style="margin-top:8px;"></div>
        </div>

        <div class="geo-footer-actions" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
          ${hasDest ? `
          <button class="btn btn-primary btn-sm" onclick="window.geoLocator.onVisualizzaOrari()" style="flex:1;">
            <i class="fa-solid fa-route"></i> Orari & Traccia ${vehicleWord}
          </button>
          ` : `
          <button class="btn btn-primary btn-sm" onclick="window.geoLocator.goToLiveBoardTimetable()" style="flex:1;">
            <i class="fa-solid fa-ticket"></i> Tabellone Partenze
          </button>
          `}
          <button class="btn btn-outline btn-sm" onclick="window.geoLocator.goToLiveBoardTimetable()">
            <i class="fa-solid fa-table-list"></i> Tabellone Completo
          </button>
          <button class="btn btn-outline btn-sm" onclick="window.geoLocator.locateAndRoute()">
            <i class="fa-solid fa-location-crosshairs"></i> Rilocalizza
          </button>
        </div>
      </div>
    `;

    this.panel.classList.add("open");
    this.setupDraggablePanel();
    this.startCountdown();
  }

  /* ==========================================================================
     GEOLOCALIZZAZIONE NATIVA & TROVA FERMATA (CON ISOLAMENTO MAPPA A RICHIESTA)
     ========================================================================== */

  locateAndRoute() {
    // Interrompe un'eventuale navigazione precedente prima di ricalcolare
    this.stopLiveTracking();
    this.arrived = false;

    // Se l'utente ha inserito del testo nel campo ma non ha cliccato dal dropdown
    const q = this.destInput ? this.destInput.value.trim() : "";
    if (q && !this.selectedDestination) {
      const matches = this.searchDestDestinations ? this.searchDestDestinations(q, 1) : this.searchDestinations(q, 1);
      if (matches && matches.length > 0) {
        this.selectedDestination = matches[0];
      } else {
        const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
        const modeData = window.TRANSIT_DATA?.modes?.[currentMode] || window.TRANSIT_DATA?.modes?.pullman;
        const allStops = modeData?.stops || [];
        const found = allStops.find(s => s.name.toLowerCase().includes(q.toLowerCase()) || (s.area && s.area.toLowerCase().includes(q.toLowerCase())));
        if (found) {
          this.selectedDestination = {
            id: found.id,
            name: found.name,
            lat: found.lat_actual || found.lat,
            lng: found.lng_actual || found.lng,
            stop: found,
            category: 'Destinazione',
            isMainHub: !!found.isMainHub
          };
        }
      }
    }

    // Se la destinazione è presente, isola la mappa da tutto lasciando solo il percorso
    if (this.selectedDestination) {
      if (window.transitMap && typeof window.transitMap.isolateRouteView === 'function') {
        window.transitMap.isolateRouteView(true);
      }
    } else {
      // Se non c'è una destinazione inserita dall'input, mantieni la mappa standard
      if (window.transitMap && typeof window.transitMap.isolateRouteView === 'function') {
        window.transitMap.isolateRouteView(false);
      }
    }

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
    this.gpsDenied = true;
    let msg = "Impossibile ottenere la posizione GPS.";
    if (err && err.code === 1) {
      msg = "Permesso di geolocalizzazione negato. Inserisci la tua posizione di partenza nel campo in cima alla mappa per trovare la fermata più vicina.";
    } else if (err && err.code === 2) {
      msg = "Posizione GPS non disponibile. Inserisci la tua posizione di partenza nel campo in cima alla mappa.";
    } else if (err && err.code === 3) {
      msg = "Tempo scaduto nel recupero del segnale GPS. Inserisci la tua posizione di partenza nel campo in cima alla mappa.";
    }

    // Mostra il pannello di inserimento posizione manuale SOLO perche' il GPS e' stato negato
    this.showManualOriginPanel(err);
    this.showError(msg);
  }

  async onPosition(pos) {
    this.setLoading(false);
    this.gpsDenied = false;
    // Se il GPS e' consentito, chiudi in automatico il pannello di input manuale
    this.hideManualOriginPanel();

    const map = this.ensureMap();
    if (!map) return;

    this.userLatLng = [pos.coords.latitude, pos.coords.longitude];
    this.arrived = false;

    if (this.selectedDestination) {
      if (window.transitMap && typeof window.transitMap.isolateRouteView === 'function') {
        window.transitMap.isolateRouteView(true);
      }
      // Se c'è già una destinazione scelta, calcola direttamente la fermata di partenza giusta
      await this.routeToDestination(this.selectedDestination);
    } else {
      if (window.transitMap && typeof window.transitMap.isolateRouteView === 'function') {
        window.transitMap.isolateRouteView(false);
      }
      // Se non è stata digitata una destinazione, trova direttamente la fermata più vicina
      const defaultStop = this.findNearestStop(this.userLatLng);
      if (defaultStop) {
        await this.routeToNearestDeparture(defaultStop);
      }
    }

    // Avvia il tracciamento GPS continuo (navigatore)
    this.startLiveTracking();
  }

  /* ==========================================================================
     SISTEMA TRASCINAMENTO PANNELLO ITINERARIO VINCOLATO AI BORDI
     ========================================================================== */

  setupDraggablePanel() {
    if (!this.panel) return;

    // Reset initial styles when newly opened
    if (!this.panel.dataset.positioned) {
      this.panel.dataset.positioned = "true";
      this.panel.style.left = "16px";
      this.panel.style.bottom = "16px";
      this.panel.style.top = "auto";
      this.panel.style.right = "auto";
    }

    const btnMinMax = this.panel.querySelector("#btnMinMaxGeoPanel");
    if (btnMinMax) {
      btnMinMax.onclick = (e) => {
        e.stopPropagation();
        this.toggleMinimizePanel();
      };
    }

    const btnClose = this.panel.querySelector("#btnCloseGeoPanel");
    if (btnClose) {
      btnClose.onclick = (e) => {
        e.stopPropagation();
        this.clearDestination();
      };
    }

    const dragHeader = this.panel.querySelector("#geoPanelDragHeader");
    if (!dragHeader || dragHeader._dragBound) return;
    dragHeader._dragBound = true;

    const wrapper = document.querySelector('.transit-map-wrapper') || document.body;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    const getPointerPos = (e) => {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    };

    const onDragStart = (e) => {
      if (e.target.closest("button") || e.target.closest("a") || e.target.closest("input")) return;

      const p = getPointerPos(e);
      startX = p.x;
      startY = p.y;

      const wrapperRect = wrapper.getBoundingClientRect();
      const panelRect = this.panel.getBoundingClientRect();

      initialLeft = panelRect.left - wrapperRect.left;
      initialTop = panelRect.top - wrapperRect.top;

      this.panel.style.bottom = "auto";
      this.panel.style.right = "auto";
      this.panel.style.left = `${initialLeft}px`;
      this.panel.style.top = `${initialTop}px`;

      isDragging = true;
      this.panel.classList.add("dragging");

      if (e.type === 'touchstart') {
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('touchcancel', onDragEnd);
      } else {
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
      }
    };

    const onDragMove = (e) => {
      if (!isDragging) return;
      if (e.cancelable && e.type === 'touchmove') e.preventDefault();

      const p = getPointerPos(e);
      const dx = p.x - startX;
      const dy = p.y - startY;

      const wrapperRect = wrapper.getBoundingClientRect();
      const panelRect = this.panel.getBoundingClientRect();

      const pad = 10;
      const minLeft = pad;
      const maxLeft = Math.max(pad, wrapperRect.width - panelRect.width - pad);
      const minTop = pad;
      const maxTop = Math.max(pad, wrapperRect.height - panelRect.height - pad);

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      // Vincolo rigido ai bordi della mappa ("attaccato ai bordi")
      newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
      newTop = Math.max(minTop, Math.min(maxTop, newTop));

      this.panel.style.left = `${newLeft}px`;
      this.panel.style.top = `${newTop}px`;
    };

    const onDragEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      this.panel.classList.remove("dragging");

      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('touchmove', onDragMove);
      document.removeEventListener('touchend', onDragEnd);
      document.removeEventListener('touchcancel', onDragEnd);

      // Snap magnetico ai bordi entro 24px
      const wrapperRect = wrapper.getBoundingClientRect();
      const panelRect = this.panel.getBoundingClientRect();
      const pad = 12;
      let left = panelRect.left - wrapperRect.left;
      let top = panelRect.top - wrapperRect.top;

      if (left < pad + 24) left = pad;
      else if (left > wrapperRect.width - panelRect.width - pad - 24) left = wrapperRect.width - panelRect.width - pad;

      if (top < pad + 24) top = pad;
      else if (top > wrapperRect.height - panelRect.height - pad - 24) top = wrapperRect.height - panelRect.height - pad;

      this.panel.style.left = `${Math.max(pad, left)}px`;
      this.panel.style.top = `${Math.max(pad, top)}px`;
    };

    dragHeader.addEventListener('mousedown', onDragStart);
    dragHeader.addEventListener('touchstart', onDragStart, { passive: false });
  }

  toggleMinimizePanel() {
    if (!this.panel) return;
    this.panel.classList.toggle("minimized");
    const icon = this.panel.querySelector("#btnMinMaxGeoPanel i");
    if (icon) {
      if (this.panel.classList.contains("minimized")) {
        icon.className = "fa-solid fa-chevron-up";
      } else {
        icon.className = "fa-solid fa-chevron-down";
      }
    }
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

    // Rilevamento Limiti di Velocità & Avvisi Radar di Prossimità
    if (window.radarEngine && this.userLatLng) {
      window.radarEngine.detectCurrentSpeedLimit(this.userLatLng);
    }
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
    // Aggancia i controlli camera ALLA MAPPA (non al wrapper che contiene anche i
    // pulsanti in alto): cosi' il pannello resta sopra la mappa e non si sovrappone
    // ai controlli su schermi piccoli.
    const wrapper = document.getElementById('leafletTransitMap') || document.querySelector('.transit-map-wrapper');
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
    // Evita che trascinare/scrollare sul pannello muova la mappa sottostante.
    if (window.L && L.DomEvent) {
      try { L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el); } catch (e) {}
    }
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
     NAVIGATORE AUTO & VISUALIZZATORE 3D ROTONDE E SVOLTE
     ========================================================================== */

  async fetchDrivingRoute(from, to) {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true&annotations=true`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.routes || !data.routes.length) return null;
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      const rawSteps = (route.legs && route.legs[0] && route.legs[0].steps) || [];
      let roundaboutsCount = 0;

      const processedSteps = rawSteps.map(s => {
        const man = s.maneuver || {};
        const isRoundabout = man.type === 'roundabout' || man.type === 'rotary' || man.type === 'roundabout turn';
        if (isRoundabout) roundaboutsCount++;
        return {
          name: s.name || (isRoundabout ? 'Rotonda di svincolo' : 'Strada principale'),
          distance: Math.round(s.distance || 0),
          duration: Math.round(s.duration || 0),
          maneuver: {
            type: man.type || 'turn',
            modifier: man.modifier || 'straight',
            exit: man.exit || (isRoundabout ? 2 : 1),
            location: man.location ? [man.location[1], man.location[0]] : null
          },
          coords: s.geometry && s.geometry.coordinates ? s.geometry.coordinates.map(c => [c[1], c[0]]) : null
        };
      });

      return {
        coords,
        distance: route.distance,
        duration: route.duration,
        steps: processedSteps,
        roundaboutsCount
      };
    } catch (e) {
      clearTimeout(timer);
      console.warn("fetchDrivingRoute error:", e);
      return null;
    }
  }

  generateRoundabout3DSvg(exitNumber, modifier, stepName) {
    const exit = parseInt(exitNumber, 10) || 2;
    
    let pathD = "";
    let exitAngleText = "2ª Uscita (Prosegui Dritto)";
    let laneAdvice = "Occupa la corsia centrale / destra";

    if (exit === 1) {
      pathD = "M 160 195 Q 160 145 195 130 Q 235 125 255 105 L 290 105";
      exitAngleText = "1ª Uscita (A Destra)";
      laneAdvice = "Resta sulla corsia esterna destra prima di entrare";
    } else if (exit === 2) {
      pathD = "M 160 195 Q 160 145 210 130 Q 240 100 200 65 Q 175 50 160 40 L 160 15";
      exitAngleText = "2ª Uscita (Prosegui Dritto)";
      laneAdvice = "Occupa la corsia centrale / destra e mantieni la traiettoria";
    } else if (exit === 3) {
      pathD = "M 160 195 Q 160 145 210 130 Q 240 95 190 60 Q 140 45 100 70 Q 75 90 65 105 L 30 105";
      exitAngleText = "3ª Uscita (A Sinistra)";
      laneAdvice = "Entra dalla corsia interna/sinistra, poi disimpegnati a destra prima dell'uscita 3";
    } else {
      pathD = "M 160 195 Q 160 145 210 130 Q 240 95 190 60 Q 130 45 90 75 Q 70 105 95 135 Q 120 150 135 165 L 140 195";
      exitAngleText = `${exit}ª Uscita (Inversione)`;
      laneAdvice = "Gira intorno all'anello interno e segnala con freccia a destra prima di uscire";
    }

    return `
      <div class="geo-roundabout-3d-card">
        <div class="geo-rotonda-hud-header">
          <div class="geo-rotonda-hud-badge">
            <i class="fa-solid fa-rotate-right fa-spin" style="--fa-animation-duration: 9s;"></i>
            <strong>ROTONDA 3D &bull; ${exitAngleText.toUpperCase()}</strong>
          </div>
          <span class="geo-rotonda-hud-target">${stepName || 'Uscita'}</span>
        </div>

        <div class="geo-rotonda-svg-wrap">
          <svg viewBox="0 0 320 220" class="geo-rotonda-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="roadGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#334155" />
                <stop offset="100%" stop-color="#1e293b" />
              </linearGradient>
              <linearGradient id="activeTrackGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stop-color="#38bdf8" />
                <stop offset="60%" stop-color="#10b981" />
                <stop offset="100%" stop-color="#22c55e" />
              </linearGradient>
              <filter id="glow3D" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <marker id="arrowCar" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#22c55e" />
              </marker>
            </defs>

            <!-- Ombra 3D anello rotonda -->
            <ellipse cx="160" cy="115" rx="82" ry="46" fill="#0f172a" opacity="0.6" />

            <!-- Bracci stradali 3D -->
            <path d="M 144 195 L 144 150 L 176 150 L 176 195 Z" fill="url(#roadGrad)" stroke="#475569" stroke-width="1.5" />
            <path d="M 235 94 L 290 94 L 290 118 L 235 118 Z" fill="url(#roadGrad)" stroke="#475569" stroke-width="1.5" />
            <path d="M 144 15 L 144 65 L 176 65 L 176 15 Z" fill="url(#roadGrad)" stroke="#475569" stroke-width="1.5" />
            <path d="M 30 94 L 85 94 L 85 118 L 30 118 Z" fill="url(#roadGrad)" stroke="#475569" stroke-width="1.5" />

            <!-- Anello asfalto -->
            <ellipse cx="160" cy="105" rx="80" ry="45" fill="url(#roadGrad)" stroke="#64748b" stroke-width="2" />
            <ellipse cx="160" cy="105" rx="58" ry="32" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6,6" opacity="0.7" />

            <!-- Isola centrale in rilievo 3D -->
            <ellipse cx="160" cy="109" rx="38" ry="21" fill="#065f46" />
            <ellipse cx="160" cy="105" rx="36" ry="19" fill="#059669" stroke="#10b981" stroke-width="1.5" />
            <ellipse cx="160" cy="103" rx="20" ry="10" fill="#34d399" opacity="0.3" />

            <!-- Frecce bianche circolazione -->
            <path d="M 195 130 Q 215 110 200 85" fill="none" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.6" />
            <path d="M 125 80 Q 105 100 120 125" fill="none" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.6" />

            <!-- Badge numeri uscite -->
            <g class="geo-exit-badge ${exit === 1 ? 'active-exit' : ''}">
              <circle cx="270" cy="106" r="11" fill="${exit === 1 ? '#10b981' : '#334155'}" stroke="#ffffff" stroke-width="1.5" />
              <text x="270" y="110" font-size="11" font-weight="900" text-anchor="middle" fill="#ffffff">1</text>
            </g>
            <g class="geo-exit-badge ${exit === 2 ? 'active-exit' : ''}">
              <circle cx="160" cy="28" r="11" fill="${exit === 2 ? '#10b981' : '#334155'}" stroke="#ffffff" stroke-width="1.5" />
              <text x="160" y="32" font-size="11" font-weight="900" text-anchor="middle" fill="#ffffff">2</text>
            </g>
            <g class="geo-exit-badge ${exit === 3 ? 'active-exit' : ''}">
              <circle cx="50" cy="106" r="11" fill="${exit === 3 ? '#10b981' : '#334155'}" stroke="#ffffff" stroke-width="1.5" />
              <text x="50" y="110" font-size="11" font-weight="900" text-anchor="middle" fill="#ffffff">3</text>
            </g>

            <!-- Traiettoria attiva con bagliore -->
            <path d="${pathD}" fill="none" stroke="#047857" stroke-width="10" opacity="0.4" filter="url(#glow3D)" stroke-linecap="round" />
            <path d="${pathD}" fill="none" stroke="url(#activeTrackGrad)" stroke-width="5" stroke-linecap="round" marker-end="url(#arrowCar)" filter="url(#glow3D)" class="geo-active-rotonda-line" />

            <!-- Ingresso auto -->
            <circle cx="160" cy="195" r="5" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
          </svg>
        </div>

        <div class="geo-rotonda-hud-footer">
          <div class="geo-lane-guide">
            <i class="fa-solid fa-road text-success"></i>
            <span><strong>Corsia consigliata:</strong> ${laneAdvice}</span>
          </div>
          <div class="geo-exit-instruction">
            <i class="fa-solid fa-arrow-turn-up text-primary"></i>
            <span>Conta le uscite: <strong>Esci alla ${exit}ª</strong></span>
          </div>
        </div>
      </div>
    `;
  }

  generateTurn3DSvg(type, modifier, stepName) {
    const isRight = modifier && modifier.includes('right');
    const isLeft = modifier && modifier.includes('left');
    const isSharp = modifier && modifier.includes('sharp');
    const isSlight = modifier && modifier.includes('slight');
    const isFork = type === 'fork';

    let title = "Svolta";
    let icon = "fa-turn-up";

    if (isRight) {
      title = isSharp ? "Svolta Secca a Destra" : (isSlight ? "Tieni la Destra" : "Svolta a Destra");
      icon = isSharp ? "fa-arrow-turn-down" : "fa-arrow-turn-up";
    } else if (isLeft) {
      title = isSharp ? "Svolta Secca a Sinistra" : (isSlight ? "Tieni la Sinistra" : "Svolta a Sinistra");
      icon = isSharp ? "fa-arrow-turn-down" : "fa-arrow-turn-up";
    } else if (isFork) {
      title = isRight ? "Al Bivio tieni la Destra" : "Al Bivio tieni la Sinistra";
      icon = "fa-code-fork";
    }

    return `
      <div class="geo-turn-3d-pill">
        <div class="geo-turn-3d-left">
          <i class="fa-solid ${icon} text-primary"></i>
          <div>
            <strong>${title}</strong>
            <small style="display:block; color:#64748b;">${stepName || 'Segui la strada'}</small>
          </div>
        </div>
      </div>
    `;
  }

  focusStepLocation(lat, lng) {
    if (lat == null || lng == null) return;
    const map = this.ensureMap();
    if (!map) return;
    map.flyTo([lat, lng], 17, { animate: true, duration: 1.2 });
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
    this.panel.innerHTML = `
      <div class="geo-panel-drag-header" id="geoPanelDragHeader">
        <div class="geo-drag-handle-pill"><span></span></div>
        <div class="geo-panel-title-area">
          <h3 class="geo-panel-title text-warning" style="font-size:1rem; margin:0;"><i class="fa-solid fa-circle-exclamation"></i> Avviso Itinerario</h3>
        </div>
        <div class="geo-panel-actions">
          <button type="button" class="btn-geo-panel-tool btn-geo-panel-close" id="btnCloseGeoPanel" title="Chiudi">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
      <div class="geo-panel-scroll-body" id="geoPanelScrollBody">
        <div class="search-alert alert-warning" style="margin:0;"><i class="fa-solid fa-circle-exclamation"></i> <div><strong>Avviso:</strong><p style="margin:4px 0 0 0;">${msg}</p></div></div>
      </div>
    `;
    this.panel.classList.add("open");
    this.setupDraggablePanel();
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
      <div class="geo-panel-drag-header" id="geoPanelDragHeader">
        <div class="geo-drag-handle-pill"><span></span></div>
        <div class="geo-panel-title-area">
          <h3 class="geo-panel-title text-warning" style="font-size:0.95rem; margin:0;"><i class="fa-solid fa-triangle-exclamation"></i> Tratta Non Diretta</h3>
        </div>
        <div class="geo-panel-actions">
          <button type="button" class="btn-geo-panel-tool btn-geo-panel-close" id="btnCloseGeoPanel" title="Chiudi e Ripristina Mappa">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
      <div class="geo-panel-scroll-body" id="geoPanelScrollBody">
        <div class="search-alert alert-warning" style="align-items:flex-start; margin:0;">
          <i class="fa-solid fa-route" style="font-size:1.4rem;"></i>
          <div>
            <strong>Nessun collegamento in ${modeWord} trovato fino a ${destName}</strong>
            <p style="margin:6px 0 10px 0; font-size:0.85rem;">
              Nella nostra rete non risulta una linea che colleghi la tua zona a questa destinazione.
              Verifica la destinazione o consulta Google Maps.
            </p>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${gmapsUrl ? `<a href="${gmapsUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm"><i class="fa-brands fa-google"></i> Vedi su Google Maps</a>` : ''}
              <button class="btn btn-outline btn-sm" onclick="window.geoLocator.clearDestination()"><i class="fa-solid fa-xmark"></i> Chiudi</button>
            </div>
          </div>
        </div>
      </div>
    `;
    this.panel.classList.add("open");
    this.setupDraggablePanel();
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




