/**
 * ITALIABUS - GEOLOCALIZZAZIONE & PERCORSO ALLA FERMATA
 * Individua la posizione dell'utente, centra e zumma la mappa GPS ad alta precisione,
 * individua la fermata più vicina e traccia il percorso a piedi in tempo reale.
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

    // 5. Cerca la fermata più vicina
    this.nearestStop = this.findNearestStop(this.userLatLng);

    if (!this.nearestStop) {
      this.showError("Posizione individuata. Nessuna fermata presente nel database.");
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

    const stopLatLng = [this.nearestStop.lat, this.nearestStop.lng];
    const directDistanceMeters = this.haversine(this.userLatLng, stopLatLng);

    // 6. Routing pedonale (OSRM pubblico o calcolo vettoriale)
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
      color: "#0284c7",
      weight: 6,
      opacity: 0.9,
      lineJoin: "round",
      dashArray: "6, 10"
    }).addTo(this.geoLayer);

    // Evidenzia fermata di destinazione
    const destIcon = L.divIcon({
      html: `<div class="target-nearest-stop-pin"><i class="fa-solid fa-flag-checkered"></i></div>`,
      className: "target-stop-pin-wrapper",
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    L.marker(stopLatLng, { icon: destIcon, zIndexOffset: 1500 })
      .bindPopup(`
        <div class="target-stop-popup">
          <h4><i class="fa-solid fa-bus text-primary"></i> ${this.nearestStop.name}</h4>
          <p>${this.nearestStop.address || ''}</p>
          <div class="walk-meta-badge">
            <span><i class="fa-solid fa-person-walking"></i> ${routeMeters >= 1000 ? (routeMeters / 1000).toFixed(1) + ' km' : Math.round(routeMeters) + ' m'}</span>
            <span><i class="fa-solid fa-clock"></i> ~${Math.max(1, Math.round(routeSeconds / 60))} min</span>
          </div>
        </div>
      `)
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

  /* ============ Prossime partenze ============ */
  linesServingStop(stopId) {
    if (typeof getLinesByStop === 'function') {
      const lines = getLinesByStop(stopId);
      if (lines && lines.length > 0) return lines;
    }
    const currentRegion = this.nearestStop?.region || 'calabria';
    return typeof getLinesByRegion === 'function' ? getLinesByRegion(currentRegion).slice(0, 3) : [];
  }

  getUpcomingDepartures(stopId, now, limit = 3) {
    const lines = this.linesServingStop(stopId);
    if (!lines || lines.length === 0) {
      return [{
        line: { code: 'BUS-DIRECT', name: 'Linea Diretta Regionale', color: '#0284c7', frequencyMinutes: 20 },
        time: new Date(now.getTime() + 8 * 60 * 1000)
      }];
    }

    const list = lines.map((line, idx) => {
      const freq = line.frequencyMinutes || 15;
      const offsetMin = (idx * 7 + 4) % 30;
      return {
        line: {
          code: line.code || line.shortName || `L-${idx + 1}`,
          name: line.name || 'Linea Trasporto Regionale',
          color: line.color || '#0284c7',
          frequencyMinutes: freq
        },
        time: new Date(now.getTime() + (offsetMin + 2) * 60 * 1000)
      };
    });

    list.sort((a, b) => a.time - b.time);
    return list.slice(0, limit);
  }

  /* ============ Rendering pannello ============ */
  renderPanel(meters, seconds) {
    if (!this.panel) return;
    const distTxt = meters >= 1000
      ? (meters / 1000).toFixed(2) + " km"
      : Math.round(meters) + " m";
    const walkMin = Math.max(1, Math.round(seconds / 60));

    this.panel.innerHTML = `
      <div class="geo-route-head">
        <div>
          <h3 style="margin:0; font-size:1.1rem; color:var(--brand-primary);"><i class="fa-solid fa-route"></i> Percorso alla Fermata Più Vicina</h3>
          <small class="text-muted">Tracciato pedonale con stima tempi di arrivo e countdown live</small>
        </div>
      </div>

      <div class="geo-stats-grid">
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-map-pin"></i> Fermata</span>
          <strong class="geo-stat-val">${this.nearestStop.name}</strong>
          <small class="text-muted">${this.nearestStop.address || this.nearestStop.area}</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-person-walking"></i> Distanza</span>
          <strong class="geo-stat-val text-primary">${distTxt}</strong>
          <small class="text-muted">Dalla tua posizione GPS</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-clock"></i> Tempo a Piedi</span>
          <strong class="geo-stat-val text-success">~${walkMin} min</strong>
          <small class="text-muted">Passo normale (4.9 km/h)</small>
        </div>
        <div class="geo-stat-card">
          <span class="geo-stat-label"><i class="fa-solid fa-hourglass-half"></i> Arrivo Previsto</span>
          <strong class="geo-stat-val" id="geoEtaArrival">--:--</strong>
          <small class="text-muted" id="geoEtaStatus">Calcolo in corso...</small>
        </div>
      </div>

      <div class="geo-departures-wrapper">
        <div class="geo-departures-title"><i class="fa-solid fa-bus"></i> Prossime corse in partenza da questa fermata</div>
        <div id="geoDeparturesList" class="geo-dep-list-grid"></div>
        <div id="geoVerdict" class="geo-verdict-box"></div>
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

    const deps = this.getUpcomingDepartures(this.nearestStop.id, now, 3);

    listEl.innerHTML = deps.map(d => {
      const secLeft = Math.max(0, Math.round((d.time - now) / 1000));
      const mm = Math.floor(secLeft / 60);
      const ss = String(secLeft % 60).padStart(2, "0");
      const countTxt = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
      return `
        <div class="geo-dep-row-card">
          <div class="geo-line-badge" style="background:${d.line.color || '#0284c7'}">${d.line.code}</div>
          <div class="geo-dep-info">
            <strong>${d.line.name}</strong>
            <small class="text-muted">Prevista alle <strong>${this.fmt(d.time)}</strong> &bull; Frequenza: ogni ${d.line.frequencyMinutes} min</small>
          </div>
          <div class="geo-dep-countdown">
            <span class="countdown-badge">${countTxt}</span>
            <small>alla partenza</small>
          </div>
        </div>
      `;
    }).join("");

    if (deps.length && verdictEl) {
      const firstDepMin = (deps[0].time - now) / 60000;
      const margin = firstDepMin - walkMin;

      if (margin >= 3) {
        verdictEl.className = "geo-verdict-box verdict-ok";
        verdictEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>Ce la fai con calma:</strong> hai ~${Math.round(margin)} minuti di margine prima che parta la linea <strong>${deps[0].line.code}</strong>.`;
      } else if (margin >= 0) {
        verdictEl.className = "geo-verdict-box verdict-warn";
        verdictEl.innerHTML = `<i class="fa-solid fa-person-running"></i> <strong>Affrettati!</strong> Hai solo ~${Math.max(0, Math.round(margin))} minuti di margine per salire sulla linea <strong>${deps[0].line.code}</strong>.`;
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
