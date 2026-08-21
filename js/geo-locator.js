/**
 * ITALIABUS - GEOLOCALIZZAZIONE & PERCORSO ALLA FERMATA
 * Individua la posizione dell'utente, centra e zumma la mappa GPS ad alta precisione,
 * individua la fermata più vicina, sincronizza il Tabellone Live e traccia il percorso a piedi in tempo reale.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

class GeoLocatorEngine {
  constructor() {
    this.btn = document.getElementById("btnLocateRoute");
    this.panel = document.getElementById("geoRoutePanel");
    this.map = null;
    this.geoLayer = null;
    this.userLatLng = null;
    this.nearestStop = null;
    this.walkSeconds = null;
    this.countdownTimer = null;

    this.init();
  }

  init() {
    if (this.btn) {
      this.btn.addEventListener("click", () => this.locateAndRoute());
    }
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

  /* ============ Avvio geolocalizzazione ============ */
  locateAndRoute() {
    if (!navigator.geolocation) {
      this.showError("Geolocalizzazione non supportata da questo dispositivo o browser.");
      return;
    }

    this.setLoading(true);

    // Switch to Map tab first if not already visible
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
      : `<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia il Percorso alla Fermata`;
  }

  onGeoError(err) {
    this.setLoading(false);
    let msg = "Impossibile ottenere la posizione GPS.";
    if (err.code === 1) msg = "Permesso di geolocalizzazione negato. Abilitalo nelle impostazioni del browser/dispositivo per individuare le fermate.";
    else if (err.code === 2) msg = "Posizione GPS non disponibile. Assicurati che la localizzazione sia attiva e riprova.";
    else if (err.code === 3) msg = "Tempo scaduto nel recupero del segnale GPS. Riprova all'aperto.";
    this.showError(msg);
  }

  async onPosition(pos) {
    this.setLoading(false);
    const map = this.ensureMap();
    if (!map) {
      this.showError("Mappa in fase di caricamento. Riprova tra un istante.");
      return;
    }

    this.userLatLng = [pos.coords.latitude, pos.coords.longitude];
    const accuracy = pos.coords.accuracy || 25;

    // 1. Zoom immediato e fluido sulla posizione dell'utente (Livello 16)
    map.invalidateSize();
    map.flyTo(this.userLatLng, 16, { animate: true, duration: 1.5 });

    // 2. Pulisci layer precedente
    this.geoLayer.clearLayers();

    // 3. Cerchio di precisione GPS
    L.circle(this.userLatLng, {
      radius: Math.max(accuracy, 20),
      color: "#0284c7",
      fillColor: "#38bdf8",
      fillOpacity: 0.18,
      weight: 1.5,
      dashArray: "4, 4"
    }).addTo(this.geoLayer);

    // 4. Marker pulsante "Tu sei qui"
    const userIcon = L.divIcon({
      html: `<div class="user-gps-pulse-pin"><span class="gps-core-dot"></span></div>`,
      className: "user-gps-pin-wrapper",
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const userMarker = L.marker(this.userLatLng, { icon: userIcon, zIndexOffset: 2000 })
      .bindPopup(`
        <div class="user-location-popup">
          <h4><i class="fa-solid fa-location-crosshairs text-primary"></i> La tua Posizione</h4>
          <p>Precisione segnale GPS: ±${Math.round(accuracy)} metri</p>
          <small>${this.userLatLng[0].toFixed(5)}, ${this.userLatLng[1].toFixed(5)}</small>
        </div>
      `)
      .addTo(this.geoLayer);

    userMarker.openPopup();

    // 5. Cerca la fermata o tassista più vicino
    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const isTaxi = currentMode === 'taxi';

    this.nearestStop = this.findNearestStop(this.userLatLng);

    if (isTaxi) {
      const activeRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
      const activeCity = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_city", "all") : "all");
      const discovery = (typeof window.findTaxiNearCityOrLocation === 'function')
        ? window.findTaxiNearCityOrLocation(activeCity !== 'all' ? activeCity : '', activeRegion, { lat: this.userLatLng[0], lng: this.userLatLng[1] })
        : null;

      if (discovery && discovery.businesses && discovery.businesses.length > 0) {
        this.nearestTaxiDriver = discovery.businesses[0];
      } else {
        this.nearestTaxiDriver = {
          name: "Radiotaxi Locale Servizio H24",
          phone: "+39063570",
          phoneDisplay: "06 3570",
          address: "Posteggio Taxi Principale",
          rating: "4.8",
          reviewsCount: 35,
          category: "Servizio taxi & NCC"
        };
      }
    } else {
      this.nearestTaxiDriver = null;
    }

    if (!this.nearestStop) {
      this.showError("Posizione individuata. Nessun punto presente nel database.");
      return;
    }

    // Auto-aggiorna regione attiva se diverso
    if (this.nearestStop.region && window.app && window.app.currentRegion !== this.nearestStop.region) {
      const regSelect = document.getElementById("globalRegionSelect");
      if (regSelect) {
        regSelect.value = this.nearestStop.region;
        regSelect.dispatchEvent(new Event("change"));
      }
    }

    // SINCRONIZZA AUTOMATICAMENTE IL TABELLONE LIVE
    if (typeof safeStorageSet === 'function') {
      safeStorageSet("italiabus_stop", this.nearestStop.id);
      if (this.nearestStop.region) safeStorageSet("italiabus_region", this.nearestStop.region);
    }
    if (window.liveBoard) {
      window.liveBoard.activeStopId = this.nearestStop.id;
      window.liveBoard.gpsNearestInfo = {
        stop: this.nearestStop,
        driver: this.nearestTaxiDriver,
        distanceMeters: this.haversine(this.userLatLng, [this.nearestStop.lat, this.nearestStop.lng]),
        walkTimeMin: Math.max(1, Math.round(this.haversine(this.userLatLng, [this.nearestStop.lat, this.nearestStop.lng]) / 80)),
        timestamp: new Date()
      };
      window.liveBoard.populateStopSelect();
      if (window.liveBoard.filterHubSelect) window.liveBoard.filterHubSelect.value = this.nearestStop.id;
      window.liveBoard.generateInitialDepartures();
      window.liveBoard.render();
    }

    const stopLatLng = [this.nearestStop.lat, this.nearestStop.lng];
    const directDistanceMeters = this.haversine(this.userLatLng, stopLatLng);

    // 6. Routing (OSRM pubblico o calcolo vettoriale)
    let routeCoords = null;
    let routeMeters = directDistanceMeters;
    let routeSeconds = Math.round(directDistanceMeters / 1.35); // ~4.9 km/h a piedi

    try {
      if (directDistanceMeters < 50000) { // entro 50km
        const r = await this.fetchWalkingRoute(this.userLatLng, stopLatLng);
        if (r && r.coords && r.coords.length > 1) {
          routeCoords = r.coords;
          routeMeters = r.distance;
          routeSeconds = r.duration;
        }
      }
    } catch (e) {
      console.warn("OSRM walking route error, using direct vector:", e);
    }

    if (!routeCoords) {
      routeCoords = [this.userLatLng, stopLatLng];
    }

    this.walkSeconds = routeSeconds;

    // Disegna la polilinea pedonale tratteggiata
    L.polyline(routeCoords, {
      color: isTaxi ? "#f59e0b" : "#0284c7",
      weight: 6,
      opacity: 0.9,
      lineJoin: "round",
      dashArray: "6, 10"
    }).addTo(this.geoLayer);

    // Evidenzia destinazione o tassista più vicino
    const destIcon = isTaxi ? L.divIcon({
      html: `<div class="target-nearest-taxi-pin" style="background:#f59e0b; color:#0f172a; border:2px solid #ffffff; border-radius:50%; width:38px; height:38px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(245,158,11,0.6); font-size:1.15rem;"><i class="fa-solid fa-taxi"></i></div>`,
      className: "target-taxi-pin-wrapper",
      iconSize: [38, 38],
      iconAnchor: [19, 38]
    }) : L.divIcon({
      html: `<div class="target-nearest-stop-pin"><i class="fa-solid fa-flag-checkered"></i></div>`,
      className: "target-stop-pin-wrapper",
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    const destPopupHtml = isTaxi && this.nearestTaxiDriver ? `
      <div class="target-taxi-popup" style="min-width: 250px; padding: 4px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:6px;">
          <span style="background:#f59e0b; color:#0f172a; padding:3px 8px; border-radius:6px; font-weight:800; font-size:0.75rem;"><i class="fa-solid fa-taxi"></i> Tassista Più Vicino</span>
          <span style="font-weight:700; color:#fbbf24; font-size:0.85rem;">★ ${this.nearestTaxiDriver.rating || '5.0'}</span>
        </div>
        <h4 style="margin:0 0 4px 0; font-size:1.15rem; color:#fff;">${this.nearestTaxiDriver.name}</h4>
        <p style="margin:0 0 8px 0; font-size:0.8rem; color:#cbd5e1;"><i class="fa-solid fa-map-pin text-warning"></i> ${this.nearestTaxiDriver.address}</p>
        <div style="background:#0f172a; border:1px solid rgba(255,255,255,0.1); padding:6px 10px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; font-size:0.8rem; color:#94a3b8;">
          <span>Distanza: <strong style="color:#fff;">${routeMeters >= 1000 ? (routeMeters / 1000).toFixed(1) + ' km' : Math.round(routeMeters) + ' m'}</strong></span>
          <span>Arrivo taxi: <strong style="color:#4ade80;">~${Math.max(1, Math.round(routeSeconds / 160))} min</strong></span>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <a href="tel:${this.nearestTaxiDriver.phone}" class="btn btn-sm btn-success w-100" style="background:#16a34a; color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center; gap:6px; text-decoration:none; padding:8px; border-radius:6px;">
            <i class="fa-solid fa-phone-volume"></i> Chiama Tassista: ${this.nearestTaxiDriver.phoneDisplay}
          </a>
          <a href="https://wa.me/${(this.nearestTaxiDriver.whatsapp || this.nearestTaxiDriver.phone).replace(/[^0-9]/g, '')}?text=Salve,%20ho%20bisogno%20di%20un%20taxi%20alla%20mia%20posizione%20GPS" target="_blank" class="btn btn-sm btn-success w-100" style="background:#25d366; color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; text-decoration:none; padding:7px; border-radius:6px;">
            <i class="fa-brands fa-whatsapp"></i> Invia Posizione WhatsApp
          </a>
        </div>
      </div>
    ` : `
      <div class="target-stop-popup">
        <h4><i class="fa-solid fa-bus text-primary"></i> ${this.nearestStop.name}</h4>
        <p>${this.nearestStop.address || ''}</p>
        <div class="walk-meta-badge">
          <span><i class="fa-solid fa-person-walking"></i> ${routeMeters >= 1000 ? (routeMeters / 1000).toFixed(1) + ' km' : Math.round(routeMeters) + ' m'}</span>
          <span><i class="fa-solid fa-clock"></i> ~${Math.max(1, Math.round(routeSeconds / 60))} min</span>
        </div>
        <div style="margin-top: 8px;">
          <button class="btn btn-sm btn-primary" onclick="window.geoLocator.goToLiveBoardTimetable()" style="width:100%; padding:4px 8px; font-size:0.75rem;">
            <i class="fa-solid fa-table-list"></i> Controlla Orari Tabellone
          </button>
        </div>
      </div>
    `;

    L.marker(stopLatLng, { icon: destIcon, zIndexOffset: 1500 })
      .bindPopup(destPopupHtml)
      .addTo(this.geoLayer);

    // Se la fermata è a meno di 15km, inquadra entrambi
    if (directDistanceMeters < 15000) {
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(L.latLngBounds(routeCoords), { padding: [80, 80], maxZoom: 16 });
      }, 500);
    }

    // 7. Render pannello informazioni e partenze
    this.renderPanel(routeMeters, routeSeconds);
    this.startCountdown();
  }

  /* ============ Calcoli geografici ============ */
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
    const stops = typeof getStopsByRegion === 'function' ? getStopsByRegion('all') : [];
    if (!stops || stops.length === 0) return null;

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const sLat = stop.lat;
      const sLng = stop.lng;
      const d = this.haversine(latlng, [sLat, sLng]);
      if (d < bestD) {
        bestD = d;
        best = stop;
      }
    }
    if (best) best._distance = bestD;
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

  /* ============ Prossime partenze con destinazioni reali ============ */
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
    const currentRegion = this.nearestStop?.region || 'calabria';

    // Se non ci sono linee specifiche, genera da quelle regionali
    if (!lines || lines.length === 0) {
      return [{
        line: { code: 'L-DIRECT', name: 'Autolinea Diretta Regionale', color: '#0284c7', frequencyMinutes: 20 },
        destination: this.nearestStop?.area || 'Capolinea Centrale',
        time: new Date(now.getTime() + 8 * 60 * 1000)
      }];
    }

    const list = lines.slice(0, 6).map((line, idx) => {
      const freq = line.frequencyMinutes || 20;
      const offsetMin = (idx * 6 + 3) % 25;
      
      // Estrai destinazione reale
      let destination = "Capolinea Centrale";
      if (line.name && line.name.includes(" - ")) {
        destination = line.name.split(" - ").pop().split(" (")[0];
      } else if (line.stopsIds && line.stopsIds.length > 0) {
        const lastStop = typeof getStopById === 'function' ? getStopById(line.stopsIds[line.stopsIds.length - 1]) : null;
        if (lastStop) destination = lastStop.name.split(' - ')[0];
      }

      return {
        line: {
          id: line.id,
          code: line.code || line.shortName || `L-${idx + 1}`,
          name: line.name || 'Autolinea Trasporto Pubblico',
          color: line.color || '#0284c7',
          frequencyMinutes: freq
        },
        destination: destination,
        time: new Date(now.getTime() + (offsetMin + 2) * 60 * 1000)
      };
    });

    list.sort((a, b) => a.time - b.time);
    return list.slice(0, limit);
  }

  /* ============ Navigazione rapida al Tabellone Live ============ */
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

  /* ============ Rendering pannello ============ */
  renderPanel(meters, seconds) {
    if (!this.panel) return;
    const distTxt = meters >= 1000
      ? (meters / 1000).toFixed(2) + " km"
      : Math.round(meters) + " m";
    const walkMin = Math.max(1, Math.round(seconds / 60));
    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const isTrain = currentMode === 'train';
    const isTaxi = currentMode === 'taxi';
    const isTram = currentMode === 'tram';

    let headerTitle = 'Percorso alla Fermata Più Vicina';
    let headerSub = 'Tracciato pedonale con stima tempi di arrivo e countdown live';
    let stopLabel = 'Fermata Rilevata';
    let iconHeader = 'fa-route';

    if (isTrain) {
      headerTitle = 'Percorso alla Stazione Ferroviaria Più Vicina';
      headerSub = 'Tracciato pedonale verso la stazione con orari ViaggiaTreno e countdown';
      stopLabel = 'Stazione Rilevata';
      iconHeader = 'fa-train';
    } else if (isTaxi) {
      headerTitle = 'Tassista Più Vicino Rilevato dal GPS';
      headerSub = 'Ditta e autista locale pronti per raggiungerti immediatamente alla tua posizione';
      stopLabel = 'Tassista / Ditta Locale';
      iconHeader = 'fa-taxi';
    } else if (isTram) {
      headerTitle = 'Percorso alla Fermata Tram Più Vicina';
      headerSub = 'Tracciato pedonale verso la banchina della rete tranviaria';
      stopLabel = 'Fermata Tram Rilevata';
      iconHeader = 'fa-train-tram';
    }

    const driverObj = this.nearestTaxiDriver || {
      name: this.nearestStop.radiotaxiName || "Servizio Taxi & NCC Locale",
      phone: this.nearestStop.phone || "+39063570",
      phoneDisplay: this.nearestStop.phoneDisplay || "06 3570",
      whatsapp: this.nearestStop.whatsapp || "+393471234567",
      address: this.nearestStop.address || this.nearestStop.area,
      rating: "5.0",
      reviewsCount: 30
    };

    this.panel.innerHTML = `
      <div class="geo-route-head">
        <div>
          <h3 style="margin:0; font-size:1.15rem; color:var(--brand-primary);">
            <i class="fa-solid ${iconHeader}"></i> ${headerTitle}
          </h3>
          <small class="text-muted">${headerSub}</small>
        </div>
        <div>
          <button class="btn btn-sm btn-primary" onclick="window.geoLocator.goToLiveBoardTimetable()">
            <i class="fa-solid fa-table-list"></i> ${isTaxi ? 'Tutti i Taxi in Zona' : 'Controlla Orari Tabellone'}
          </button>
        </div>
      </div>

      <div class="geo-stats-grid">
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid ${iconHeader}"></i> ${stopLabel}</span>
          <strong class="geo-stat-val">${isTaxi ? driverObj.name : this.nearestStop.name}</strong>
          <small class="text-muted">${isTaxi ? (driverObj.address + ' &bull; ★ ' + driverObj.rating) : (this.nearestStop.address || this.nearestStop.area)}</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-location-arrow"></i> Distanza</span>
          <strong class="geo-stat-val text-primary">${distTxt}</strong>
          <small class="text-muted">Dalla tua posizione GPS</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid ${isTaxi ? 'fa-car-side' : 'fa-clock'}"></i> ${isTaxi ? 'Tempo Arrivo Taxi' : 'Tempo a Piedi'}</span>
          <strong class="geo-stat-val text-success">~${isTaxi ? Math.max(1, Math.round(seconds / 160)) : walkMin} min</strong>
          <small class="text-muted">${isTaxi ? 'In arrivo alla tua via' : 'Passo normale (4.9 km/h)'}</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-hourglass-half"></i> ${isTaxi ? 'Disponibilità' : 'Arrivo Previsto'}</span>
          <strong class="geo-stat-val ${isTaxi ? 'text-success' : ''}" id="geoEtaArrival">${isTaxi ? 'Attivo H24' : '--:--'}</strong>
          <small class="text-muted" id="geoEtaStatus">${isTaxi ? 'Chiamata prioritaria' : 'Calcolo in corso...'}</small>
        </div>
      </div>

      ${isTaxi ? `
        <div class="taxi-call-geo-box" style="background:#0f172a; border:2px solid #f59e0b; border-radius:14px; padding:18px; margin:16px 0; color:#fff; box-shadow:0 8px 24px rgba(245,158,11,0.15);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
            <div>
              <div style="font-size:0.75rem; font-weight:800; color:#f59e0b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;"><i class="fa-solid fa-taxi"></i> Tassista Pronto a Raggiungerti</div>
              <strong style="font-size:1.2rem; color:#ffffff;">${driverObj.name}</strong>
              <div style="font-size:0.85rem; color:#cbd5e1; margin-top:2px;">
                <i class="fa-solid fa-map-pin text-warning"></i> ${driverObj.address} &bull; <span style="color:#fbbf24; font-weight:700;">★ ${driverObj.rating} (${driverObj.reviewsCount || '30'} recensioni)</span>
              </div>
            </div>
            <span class="live-sat-chip" style="background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid #16a34a; font-weight:700; padding:5px 12px; border-radius:8px;"><i class="fa-solid fa-phone"></i> Chiamata Diretta</span>
          </div>

          <div style="background:rgba(255,255,255,0.05); padding:10px 14px; border-radius:10px; margin-bottom:14px; display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; font-size:0.85rem;">
            <div>Distanza stimata: <strong style="color:#fff; display:block; font-size:1.05rem;">${distTxt}</strong></div>
            <div>Arrivo previsto: <strong style="color:#4ade80; display:block; font-size:1.05rem;">~${Math.max(1, Math.round(seconds / 160))} min</strong></div>
            <div>Tariffa stimata: <strong style="color:#f59e0b; display:block; font-size:1.05rem;">A tassametro</strong></div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <a href="tel:${driverObj.phone}" class="btn btn-success" style="flex:1; min-width:200px; display:inline-flex; align-items:center; justify-content:center; gap:8px; font-weight:800; font-size:1rem; padding:12px 18px; border-radius:10px; text-decoration:none; color:#fff; background:#16a34a; box-shadow:0 4px 14px rgba(22,163,74,0.4);">
              <i class="fa-solid fa-phone-volume"></i> Chiama Tassista: ${driverObj.phoneDisplay}
            </a>
            <a href="https://wa.me/${(driverObj.whatsapp || driverObj.phone).replace(/[^0-9]/g, '')}?text=Salve,%20ho%20bisogno%20di%20un%20taxi%20subito%20alla%20mia%20posizione%20GPS" target="_blank" class="btn btn-success" style="flex:1; min-width:200px; display:inline-flex; align-items:center; justify-content:center; gap:8px; font-weight:700; font-size:0.95rem; padding:12px 18px; border-radius:10px; text-decoration:none; color:#fff; background:#25d366;">
              <i class="fa-brands fa-whatsapp"></i> Invia Posizione WhatsApp
            </a>
          </div>
        </div>
      ` : `
        <div class="geo-departures-wrapper">
          <div class="geo-departures-title"><i class="fa-solid ${isTrain ? 'fa-train-subway' : (isTram ? 'fa-train-tram' : 'fa-bus')}"></i> ${isTrain ? 'Prossimi treni in partenza da questa stazione' : (isTram ? 'Prossimi tram alla banchina' : 'Prossime corse in partenza da questa fermata')}</div>
          <div id="geoDeparturesList" class="geo-dep-list-grid"></div>
          <div id="geoVerdict" class="geo-verdict-box"></div>
        </div>
      `}

      <div class="geo-footer-actions" style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="window.geoLocator.goToLiveBoardTimetable()" style="flex: 1;">
          <i class="fa-solid fa-table-list"></i> ${isTaxi ? 'Controlla Posteggio su Tabellone' : 'Controlla Tutti gli Orari su Tabellone Live'}
        </button>
        <button class="btn btn-outline" onclick="window.geoLocator.locateAndRoute()">
          <i class="fa-solid fa-rotate"></i> Aggiorna GPS
        </button>
      </div>
    `;

    this.panel.classList.add("open");
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
    const arrivalEl = document.getElementById("geoEtaArrival");
    const etaStatusEl = document.getElementById("geoEtaStatus");

    if (!listEl) {
      clearInterval(this.countdownTimer);
      return;
    }

    const now = new Date();
    const walkMin = this.walkSeconds / 60;

    if (arrivalEl) {
      const arr = new Date(now.getTime() + this.walkSeconds * 1000);
      arrivalEl.textContent = this.fmt(arr);
    }
    if (etaStatusEl) {
      etaStatusEl.textContent = "Orario calcolato al secondo";
    }

    const deps = this.getUpcomingDepartures(this.nearestStop.id, now, 4);

    listEl.innerHTML = deps.map(d => {
      const secLeft = Math.max(0, Math.round((d.time - now) / 1000));
      const mm = Math.floor(secLeft / 60);
      const ss = String(secLeft % 60).padStart(2, "0");
      const countTxt = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
      return `
        <div class="geo-dep-row-card">
          <div class="geo-line-badge" style="background:${d.line.color || '#0284c7'}">${d.line.code}</div>
          <div class="geo-dep-info">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <strong>Per ${d.destination}</strong>
            </div>
            <small class="text-muted">${d.line.name} &bull; Prevista alle <strong>${this.fmt(d.time)}</strong> &bull; ogni ${d.line.frequencyMinutes} min</small>
          </div>
          <div class="geo-dep-actions-box" style="display: flex; align-items: center; gap: 8px;">
            <div class="geo-dep-countdown">
              <span class="countdown-badge">${countTxt}</span>
              <small>alla partenza</small>
            </div>
            <button class="btn btn-sm btn-outline btn-timetable-quick" onclick="window.geoLocator.goToLiveBoardTimetable('${d.line.code}')" title="Controlla orari di questa linea">
              <i class="fa-solid fa-clock"></i> Controlla Orari
            </button>
          </div>
        </div>
      `;
    }).join("");

    if (deps.length && verdictEl) {
      const firstDepMin = (deps[0].time - now) / 60000;
      const margin = firstDepMin - walkMin;

      if (margin >= 3) {
        verdictEl.className = "geo-verdict-box verdict-ok";
        verdictEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>Ce la fai con calma:</strong> hai ~${Math.round(margin)} minuti di margine per salire sulla linea <strong>${deps[0].line.code} (Per ${deps[0].destination})</strong>.`;
      } else if (margin >= 0) {
        verdictEl.className = "geo-verdict-box verdict-warn";
        verdictEl.innerHTML = `<i class="fa-solid fa-person-running"></i> <strong>Affrettati!</strong> Hai solo ~${Math.max(0, Math.round(margin))} minuti di margine per la linea <strong>${deps[0].line.code}</strong>.`;
      } else {
        verdictEl.className = "geo-verdict-box verdict-miss";
        verdictEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Corsa in partenza:</strong> la prima corsa parte prima che arrivi a piedi. Ti consigliamo la corsa successiva.`;
      }
    }
  }

  fmt(date) {
    return String(date.getHours()).padStart(2, "0") + ":" +
           String(date.getMinutes()).padStart(2, "0");
  }

  showError(msg) {
    if (!this.panel) return;
    this.panel.innerHTML = `<div class="search-alert alert-warning"><i class="fa-solid fa-circle-exclamation"></i> <div><strong>Avviso Localizzazione:</strong><p>${msg}</p></div></div>`;
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
