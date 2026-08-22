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
        this.geoLayer = L.layerGroup().addTo(this.map);
      }
    }
    return this.map;
  }

  /* ==========================================================================
     GESTIONE INPUT & DROPDOWN DESTINAZIONI
     ========================================================================== */

  bindDestinationControls() {
    if (!this.destInput) return;

    // Focus -> apre il menu e popola le destinazioni
    this.destInput.addEventListener("focus", () => {
      this.populateDestDropdown(this.destInput.value.trim());
      this.openDropdown();
    });

    // Digitazione -> filtra in tempo reale
    this.destInput.addEventListener("input", () => {
      const q = this.destInput.value.trim();
      if (this.btnClearDest) {
        this.btnClearDest.style.display = q ? "flex" : "none";
      }
      this.populateDestDropdown(q);
      this.openDropdown();
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
     RACCOLTA ED ESTRAZIONE DESTINAZIONI PER OGNI MODALITÀ
     ========================================================================== */

  getAllDestinationsForActiveMode() {
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeData = window.TRANSIT_DATA?.modes?.[mode] || window.TRANSIT_DATA?.modes?.pullman;
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");

    const results = [];
    const seenKeys = new Set();

    const stops = (modeData?.stops && modeData.stops.length > 0) ? modeData.stops : [];
    const lines = (modeData?.lines && modeData.lines.length > 0) ? modeData.lines : [];

    // 1. Fermate, stazioni, aeroporti registrati
    stops.forEach(s => {
      if (!s || !s.id) return;
      const key = `stop_${s.id}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        let cat = 'Fermata';
        let icon = 'fa-location-dot';

        if (mode === 'flight') {
          cat = 'Aeroporto';
          icon = 'fa-plane-departure';
        } else if (mode === 'train') {
          cat = s.isMainHub ? 'Stazione AV / Principale' : 'Stazione';
          icon = 'fa-train';
        } else if (mode === 'tram') {
          cat = 'Fermata Tranviaria';
          icon = 'fa-train-tram';
        } else if (mode === 'taxi') {
          cat = 'Posteggio / Punto di Raccolta';
          icon = 'fa-taxi';
        } else {
          cat = s.isMainHub ? 'Autostazione / Hub' : 'Fermata Pullman';
          icon = s.isMainHub ? 'fa-bus-simple' : 'fa-location-dot';
        }

        results.push({
          id: s.id,
          uniqueKey: key,
          name: s.name,
          area: s.area || s.name.split(' - ')[0],
          region: s.region || currentRegion,
          localityType: s.localityType || (s.isMainHub ? 'hub' : 'fermata'),
          lat: s.lat,
          lng: s.lng,
          stop: s,
          type: 'stop',
          isMainHub: !!s.isMainHub,
          category: cat,
          icon: icon
        });
      }
    });

    // 2. Destinazioni indicate nei nomi delle Linee / Tratte
    lines.forEach(l => {
      if (!l || !l.name) return;
      const parts = l.name.split(' - ');
      parts.forEach(p => {
        const cleanName = p.trim().split(' (')[0];
        if (cleanName.length >= 3) {
          const key = `line_dest_${cleanName.toLowerCase()}`;
          if (!seenKeys.has(key)) {
            // Cerca se esiste una fermata associata
            const matchStop = stops.find(s => 
              (s.area && s.area.toLowerCase() === cleanName.toLowerCase()) ||
              s.name.toLowerCase().includes(cleanName.toLowerCase())
            );

            if (matchStop) {
              seenKeys.add(key);
              results.push({
                id: matchStop.id,
                uniqueKey: key,
                name: cleanName,
                area: matchStop.area || cleanName,
                region: matchStop.region || currentRegion,
                localityType: 'citta',
                lat: matchStop.lat,
                lng: matchStop.lng,
                stop: matchStop,
                type: 'city',
                isMainHub: true,
                category: mode === 'flight' ? 'Rotta Aerea Diretta' : (mode === 'train' ? 'Destinazione Ferroviaria' : 'Destinazione Linea'),
                icon: mode === 'flight' ? 'fa-plane' : (mode === 'train' ? 'fa-train-subway' : 'fa-route')
              });
            }
          }
        }
      });
    });

    // Ordina: prima gli Hub/Città principali, poi in ordine alfabetico
    return results.sort((a, b) => {
      if (a.isMainHub && !b.isMainHub) return -1;
      if (!a.isMainHub && b.isMainHub) return 1;
      return a.name.localeCompare(b.name, 'it');
    });
  }

  /* ==========================================================================
     POPOLAMENTO DROPDOWN DESTINAZIONI
     ========================================================================== */

  populateDestDropdown(filterQuery = "") {
    if (!this.destDropdownList) return;

    const allDests = this.getAllDestinationsForActiveMode();
    const query = filterQuery.toLowerCase().trim();

    let filtered = allDests;
    if (query) {
      filtered = allDests.filter(d => 
        d.name.toLowerCase().includes(query) ||
        (d.area && d.area.toLowerCase().includes(query)) ||
        (d.category && d.category.toLowerCase().includes(query))
      );
    }

    if (filtered.length === 0) {
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

    // 1. Trova tutte le linee che includono la destinazione
    const servingLines = allLines.filter(l => {
      const stopsArr = l.stopsIds || l.stops || [];
      if (stopsArr.includes(targetStopId)) return true;
      if (l.name && l.name.toLowerCase().includes(targetDest.name.toLowerCase())) return true;
      return false;
    });

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

      candidateDepartureStops = Array.from(candidateStopIds).map(id => allStops.find(s => s.id === id)).filter(Boolean);
    }

    // Fallback: se nessuna linea specifica è stata trovata, considera tutte le fermate
    if (candidateDepartureStops.length === 0) {
      candidateDepartureStops = allStops.filter(s => s.id !== targetStopId);
    }
    if (candidateDepartureStops.length === 0) {
      candidateDepartureStops = allStops;
    }

    // 2. Tra tutte le fermate che servono la destinazione, trova la PIÙ VICINA alla posizione di riferimento
    let bestDeparture = null;
    let minDistance = Infinity;

    candidateDepartureStops.forEach(stop => {
      const dist = this.haversine(referenceLatLng, [stop.lat, stop.lng]);
      if (dist < minDistance) {
        minDistance = dist;
        bestDeparture = stop;
      }
    });

    if (!bestDeparture) bestDeparture = candidateDepartureStops[0] || allStops[0];

    // Trova le linee che collegano la fermata di partenza alla destinazione
    let directConnectingLines = servingLines.filter(l => {
      const arr = l.stopsIds || l.stops || [];
      return arr.includes(bestDeparture.id) && arr.includes(targetStopId);
    });

    if (directConnectingLines.length === 0) {
      directConnectingLines = servingLines.length > 0 ? servingLines : (allLines.slice(0, 2));
    }

    const targetStopObj = allStops.find(s => s.id === targetStopId) || targetDest.stop || {
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

      // Disegna il percorso visivo sulla mappa
      await this.drawSmartRouteOnMap(routeInfo, refLatLng);

      // Renderizza il pannello con i dati del viaggio
      this.renderSmartRoutePanel(routeInfo, refLatLng);
    };

    if (typeof window.withAppLoader === 'function') {
      await window.withAppLoader(`Calcolo Itinerario per ${dest.name || 'Destinazione'}...`, "Individuazione fermata di salita ottimale e tracciato...", doRouting, 240);
    } else {
      await doRouting();
    }
  }

  /* ==========================================================================
     DISEGNO VETTORIALE SULLA MAPPA LEAFLET
     ========================================================================== */

  async drawSmartRouteOnMap(routeInfo, refLatLng) {
    const map = this.ensureMap();
    if (!map || !this.geoLayer) return;

    this.geoLayer.clearLayers();

    const dep = routeInfo.departureStop;
    const dest = routeInfo.destinationStop;
    const depLatLng = [dep.lat, dep.lng];
    const destLatLng = [dest.lat, dest.lng];

    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const isFlight = currentMode === 'flight';
    const isTrain = currentMode === 'train';
    const isTaxi = currentMode === 'taxi';

    const primaryColor = isFlight ? '#0284c7' : (isTrain ? '#dc2626' : (isTaxi ? '#10b981' : '#0284c7'));

    // 1. Marker Posizione Utente (se GPS presente)
    if (this.userLatLng) {
      const userIcon = L.divIcon({
        html: `<div class="user-gps-pulse-pin"><span class="gps-core-dot"></span></div>`,
        className: "user-gps-pin-wrapper",
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker(this.userLatLng, { icon: userIcon, zIndexOffset: 2000 })
        .bindPopup(`<strong>📍 La tua Posizione</strong><br><small>GPS rilevato</small>`)
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

      L.polyline(walkCoords, {
        color: "#64748b",
        weight: 5,
        opacity: 0.85,
        dashArray: "6, 8"
      }).bindTooltip("🚶 Tragitto a piedi verso la fermata di partenza", { sticky: true }).addTo(this.geoLayer);
    } else {
      this.walkSeconds = Math.round(this.haversine(refLatLng, depLatLng) / 1.35);
    }

    // 2. Marker Fermata di Partenza Consigliata
    const depIcon = L.divIcon({
      html: `<div class="serving-departure-pin" style="background:#16a34a; color:#fff; border:2px solid #ffffff; border-radius:50%; width:38px; height:38px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(22,163,74,0.6); font-size:1.1rem;"><i class="fa-solid fa-person-walking-arrow-right"></i></div>`,
      className: "serving-dep-pin-wrapper",
      iconSize: [38, 38],
      iconAnchor: [19, 38]
    });

    L.marker(depLatLng, { icon: depIcon, zIndexOffset: 1500 })
      .bindPopup(`
        <div style="min-width: 220px; padding: 4px;">
          <span style="background:#16a34a; color:#fff; padding:2px 8px; border-radius:4px; font-weight:800; font-size:0.75rem;">PARTENZA CONSIGLIATA</span>
          <h4 style="margin:6px 0 2px 0; font-size:1.05rem;">${dep.name}</h4>
          <p style="margin:0 0 6px 0; font-size:0.8rem; color:#64748b;">${dep.address || dep.area || ''}</p>
          <small style="color:#0284c7; font-weight:700;">Da qui partono i mezzi per ${dest.name}</small>
        </div>
      `)
      .addTo(this.geoLayer)
      .openPopup();

    // 3. Marker Destinazione Finale
    const destIcon = L.divIcon({
      html: `<div class="target-dest-checkered-pin" style="background:${primaryColor}; color:#ffffff; border:2px solid #ffffff; border-radius:50%; width:38px; height:38px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(2,132,199,0.6); font-size:1.15rem;"><i class="fa-solid fa-flag-checkered"></i></div>`,
      className: "target-dest-pin-wrapper",
      iconSize: [38, 38],
      iconAnchor: [19, 38]
    });

    L.marker(destLatLng, { icon: destIcon, zIndexOffset: 1600 })
      .bindPopup(`
        <div style="min-width: 220px; padding: 4px;">
          <span style="background:${primaryColor}; color:#fff; padding:2px 8px; border-radius:4px; font-weight:800; font-size:0.75rem;">DESTINAZIONE</span>
          <h4 style="margin:6px 0 2px 0; font-size:1.05rem;">${dest.name}</h4>
          <p style="margin:0; font-size:0.8rem; color:#64748b;">Arrivo previsto alla destinazione selezionata</p>
        </div>
      `)
      .addTo(this.geoLayer);

    // 4. Polilinea di connessione Diretta Partenza -> Destinazione
    const transitCoords = [depLatLng, destLatLng];
    L.polyline(transitCoords, {
      color: primaryColor,
      weight: 6,
      opacity: 0.9,
      dashArray: isFlight ? "8, 12" : (isTrain ? "10, 6" : null)
    }).bindTooltip(`<strong>Tratta Diretta</strong>: ${dep.name} &rarr; ${dest.name}`, { sticky: true }).addTo(this.geoLayer);

    // Inquadra la mappa sull'intero itinerario
    map.invalidateSize();
    const bounds = L.latLngBounds([depLatLng, destLatLng]);
    if (this.userLatLng) bounds.extend(this.userLatLng);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
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

    const distFromUserMeters = this.haversine(refLatLng, [dep.lat, dep.lng]);
    const distTxt = distFromUserMeters >= 1000 
      ? (distFromUserMeters / 1000).toFixed(2) + " km" 
      : Math.round(distFromUserMeters) + " m";
    const walkMin = Math.max(1, Math.round(distFromUserMeters / 80));

    const lineBadgesHtml = lines.slice(0, 3).map(l => `
      <span style="background:${l.color || '#0284c7'}; color:#fff; padding:3px 9px; border-radius:6px; font-weight:800; font-size:0.8rem; display:inline-flex; align-items:center; gap:4px;">
        <i class="fa-solid ${isFlight ? 'fa-plane' : (isTrain ? 'fa-train' : 'fa-bus')}"></i> ${l.code || l.name}
      </span>
    `).join(" ");

    this.panel.innerHTML = `
      <div class="geo-route-head" style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
        <div>
          <span style="background:rgba(22,163,74,0.15); color:#16a34a; border:1px solid #16a34a; font-weight:800; font-size:0.75rem; padding:3px 8px; border-radius:6px;">
            <i class="fa-solid fa-circle-check"></i> FERMATA CORRETTA PER LA TUA DESTINAZIONE
          </span>
          <h3 style="margin:6px 0 2px 0; font-size:1.2rem; color:var(--text-primary);">
            Per arrivare a <strong>${dest.name}</strong>
          </h3>
          <small class="text-muted">Itinerario calcolato in tempo reale con orari di partenza e linee dirette</small>
        </div>
        <button class="btn btn-sm btn-primary" onclick="window.geoLocator.goToLiveBoardTimetable()">
          <i class="fa-solid fa-table-list"></i> Tabellone Orari Completo
        </button>
      </div>

      <div class="geo-stats-grid">
        <div class="geo-stat-card" style="border-left:4px solid #16a34a;">
          <span class="geo-stat-label"><i class="fa-solid fa-person-walking-arrow-right text-success"></i> Fermata di Partenza Consigliata</span>
          <strong class="geo-stat-val text-success">${dep.name}</strong>
          <small class="text-muted">${dep.address || dep.area || 'Punto di salita utile'}</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-flag-checkered text-primary"></i> Destinazione Selezionata</span>
          <strong class="geo-stat-val text-primary">${dest.name}</strong>
          <small class="text-muted">Distanza in linea d'aria: ~${Math.round(routeInfo.distanceToDestKm || 1)} km</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-person-walking"></i> Distanza da Te alla Fermata</span>
          <strong class="geo-stat-val">${distTxt}</strong>
          <small class="text-muted">~${walkMin} min a piedi</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-route"></i> Linee / Mezzi da Prendere</span>
          <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">${lineBadgesHtml}</div>
          <small class="text-muted" style="margin-top:4px;">${lines[0]?.name || 'Collegamento Diretto'}</small>
        </div>
      </div>

      <div class="geo-departures-wrapper" style="margin-top:14px;">
        <div class="geo-departures-title" style="font-weight:800; font-size:0.95rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-clock text-primary"></i> Prossime partenze da <strong>${dep.name}</strong> verso <strong>${dest.name}</strong>
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
      // Se c'è già una destinazione scelta, calcola direttamente la fermata giusta
      await this.routeToDestination(this.selectedDestination);
    } else {
      // Se non è ancora stata scelta una destinazione, trova la fermata più vicina generica
      const defaultStop = this.findNearestStop(this.userLatLng);
      if (defaultStop) {
        this.routeToDestination({
          id: defaultStop.id,
          name: defaultStop.name,
          lat: defaultStop.lat,
          lng: defaultStop.lng,
          stop: defaultStop,
          category: 'Fermata più vicina'
        });
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
    let best = null, bestD = Infinity;
    const mode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeData = window.TRANSIT_DATA?.modes?.[mode] || window.TRANSIT_DATA?.modes?.pullman;
    const stops = (modeData?.stops && modeData.stops.length > 0) ? modeData.stops : [];
    if (!stops || stops.length === 0) return null;

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const d = this.haversine(latlng, [stop.lat, stop.lng]);
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
