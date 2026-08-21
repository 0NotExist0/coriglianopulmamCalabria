/**
 * ITALIABUS - GEOLOCALIZZAZIONE & PERCORSO ALLA FERMATA
 * Dalla posizione dell'utente traccia sulla mappa la strada fino alla fermata
 * più vicina, con tempo a piedi stimato e conto alla rovescia in tempo reale
 * della prossima partenza/arrivo del pullman.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

class GeoLocatorEngine {
  constructor() {
    this.btn = document.getElementById("btnLocateRoute");
    this.panel = document.getElementById("geoRoutePanel");
    this.map = null;
    this.geoLayer = null;         // marker utente + destinazione + percorso
    this.userLatLng = null;
    this.nearestStop = null;
    this.walkSeconds = null;
    this.countdownTimer = null;

    this.init();
  }

  init() {
    if (!this.btn) return;
    this.btn.addEventListener("click", () => this.locateAndRoute());
  }

  ensureMap() {
    if (this.map) return this.map;
    if (window.transitMap && window.transitMap.map && typeof L !== 'undefined') {
      this.map = window.transitMap.map;
      this.geoLayer = L.layerGroup().addTo(this.map);
    }
    return this.map;
  }

  /* ============ Avvio geolocalizzazione ============ */
  locateAndRoute() {
    if (!navigator.geolocation) {
      this.showError("Geolocalizzazione non supportata da questo dispositivo/browser.");
      return;
    }

    this.setLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => this.onPosition(pos),
      (err) => this.onGeoError(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  setLoading(on) {
    if (!this.btn) return;
    this.btn.disabled = on;
    this.btn.innerHTML = on
      ? `<i class="fa-solid fa-spinner fa-spin"></i> Individuo la tua posizione...`
      : `<i class="fa-solid fa-location-crosshairs"></i> Localizzami & Traccia il Percorso alla Fermata`;
  }

  onGeoError(err) {
    this.setLoading(false);
    let msg = "Impossibile ottenere la posizione.";
    if (err.code === 1) msg = "Permesso di geolocalizzazione negato. Abilitalo nelle impostazioni del browser per tracciare il percorso.";
    else if (err.code === 2) msg = "Posizione non disponibile in questo momento. Riprova all'aperto o con il GPS attivo.";
    else if (err.code === 3) msg = "Tempo scaduto nel recupero della posizione. Riprova.";
    this.showError(msg);
  }

  async onPosition(pos) {
    this.setLoading(false);
    if (!this.ensureMap()) {
      this.showError("Mappa non pronta. Riprova tra un istante.");
      return;
    }

    this.userLatLng = [pos.coords.latitude, pos.coords.longitude];
    this.nearestStop = this.findNearestStop(this.userLatLng);

    if (!this.nearestStop) {
      this.showError("Nessuna fermata trovata nelle vicinanze.");
      return;
    }

    // Pulisci layer precedente
    this.geoLayer.clearLayers();

    // Marker "Tu sei qui"
    const userIcon = L.divIcon({
      html: `<div class="user-location-marker"></div>`,
      className: "user-location-wrapper",
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    L.marker(this.userLatLng, { icon: userIcon, zIndexOffset: 1000 })
      .bindTooltip("📍 Tu sei qui", { direction: "top", offset: [0, -12] })
      .addTo(this.geoLayer);

    const stopLatLng = [
      this.nearestStop.lat_actual || this.nearestStop.lat,
      this.nearestStop.lng_actual || this.nearestStop.lng
    ];

    // Prova il routing stradale reale (a piedi), altrimenti linea diretta
    let routeCoords = null;
    let routeMeters = null;
    let routeSeconds = null;
    try {
      const r = await this.fetchWalkingRoute(this.userLatLng, stopLatLng);
      if (r) {
        routeCoords = r.coords;
        routeMeters = r.distance;
        routeSeconds = r.duration;
      }
    } catch (e) { /* fallback sotto */ }

    if (!routeCoords) {
      routeCoords = [this.userLatLng, stopLatLng];
      routeMeters = this.haversine(this.userLatLng, stopLatLng);
      routeSeconds = (routeMeters / 1.35); // ~4.9 km/h a piedi
    }

    this.walkSeconds = routeSeconds;

    // Disegna il percorso con il colore del tema attivo
    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--brand-primary").trim() || "#e8590c";

    L.polyline(routeCoords, {
      color: themeColor,
      weight: 6,
      opacity: 0.9,
      lineJoin: "round",
      lineCap: "round",
      dashArray: "1, 12"
    }).addTo(this.geoLayer);

    // Evidenzia la fermata di destinazione
    L.circleMarker(stopLatLng, {
      radius: 11,
      color: "#ffffff",
      weight: 3,
      fillColor: themeColor,
      fillOpacity: 1
    }).bindTooltip(`🏁 ${this.nearestStop.name}`, { direction: "top", offset: [0, -10] })
      .addTo(this.geoLayer);

    // Inquadra utente + fermata
    const bounds = L.latLngBounds(routeCoords);
    setTimeout(() => {
      this.map.invalidateSize();
      this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }, 150);

    // Render pannello + avvio countdown
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
    TRANSIT_DATA.stops.forEach(stop => {
      const sLat = stop.lat_actual || stop.lat;
      const sLng = stop.lng_actual || stop.lng;
      const d = this.haversine(latlng, [sLat, sLng]);
      if (d < bestD) { bestD = d; best = stop; }
    });
    if (best) best._distance = bestD;
    return best;
  }

  /* Routing pedonale reale via OSRM pubblico (con timeout e fallback) */
  async fetchWalkingRoute(from, to) {
    const url = `https://router.project-osrm.org/route/v1/foot/` +
      `${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.routes || !data.routes.length) return null;
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // [lng,lat]->[lat,lng]
      return { coords, distance: route.distance, duration: route.duration };
    } catch (e) {
      clearTimeout(timer);
      return null;
    }
  }

  /* ============ Prossime partenze dalla fermata ============ */
  linesServingStop(stopId) {
    return TRANSIT_DATA.lines.filter(l => l.stopsIds.includes(stopId));
  }

  parseTimeToday(hhmm, base) {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  }

  // Prossima corsa realistica di una linea in base alla frequenza
  nextDepartureForLine(line, now) {
    const first = this.parseTimeToday(line.firstDeparture, now);
    let last = this.parseTimeToday(line.lastDeparture, now);
    // Servizio che supera la mezzanotte (es. navetta mare fino 01:30)
    if (last <= first) last = new Date(last.getTime() + 24 * 3600 * 1000);

    const freqMs = line.frequencyMinutes * 60 * 1000;

    if (now < first) return first;
    if (now > last) {
      // Servizio terminato: prima corsa di domani
      return new Date(first.getTime() + 24 * 3600 * 1000);
    }
    const elapsed = now.getTime() - first.getTime();
    const slots = Math.ceil(elapsed / freqMs);
    let next = new Date(first.getTime() + slots * freqMs);
    if (next.getTime() <= now.getTime()) next = new Date(next.getTime() + freqMs);
    return next;
  }

  getUpcomingDepartures(stopId, now, limit = 3) {
    const lines = this.linesServingStop(stopId);
    const list = lines.map(line => ({
      line,
      time: this.nextDepartureForLine(line, now)
    }));
    list.sort((a, b) => a.time - b.time);
    return list.slice(0, limit);
  }

  /* ============ Rendering pannello ============ */
  renderPanel(meters, seconds) {
    const distTxt = meters >= 1000
      ? (meters / 1000).toFixed(2) + " km"
      : Math.round(meters) + " m";
    const walkMin = Math.max(1, Math.round(seconds / 60));

    this.panel.innerHTML = `
      <div class="geo-route-head">
        <i class="fa-solid fa-route"></i> Percorso verso la fermata più vicina
      </div>

      <div class="geo-stats-grid">
        <div class="geo-stat">
          <span class="lbl"><i class="fa-solid fa-map-pin"></i> Fermata</span>
          <span class="val" style="font-size:1rem">${this.nearestStop.name}</span>
        </div>
        <div class="geo-stat">
          <span class="lbl"><i class="fa-solid fa-person-walking"></i> Distanza</span>
          <span class="val accent">${distTxt}</span>
        </div>
        <div class="geo-stat">
          <span class="lbl"><i class="fa-solid fa-clock"></i> Tempo a piedi</span>
          <span class="val success">~${walkMin} min</span>
        </div>
        <div class="geo-stat">
          <span class="lbl"><i class="fa-solid fa-hourglass-half"></i> Arrivo previsto</span>
          <span class="val" id="geoEtaArrival" style="font-size:1rem">--:--</span>
        </div>
      </div>

      <div class="geo-departures-title"><i class="fa-solid fa-bus"></i> Prossime partenze da questa fermata</div>
      <div id="geoDeparturesList"></div>
      <div id="geoVerdict"></div>
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
    if (!listEl) { clearInterval(this.countdownTimer); return; }

    const now = new Date();
    const walkMin = this.walkSeconds / 60;

    // Orario stimato di arrivo dell'utente alla fermata
    if (arrivalEl) {
      const arr = new Date(now.getTime() + this.walkSeconds * 1000);
      arrivalEl.textContent = this.fmt(arr);
    }

    const deps = this.getUpcomingDepartures(this.nearestStop.id, now, 3);

    listEl.innerHTML = deps.map(d => {
      const secLeft = Math.max(0, Math.round((d.time - now) / 1000));
      const mm = Math.floor(secLeft / 60);
      const ss = String(secLeft % 60).padStart(2, "0");
      const countTxt = mm > 0 ? `${mm}<small>min ${ss}s</small>` : `${ss}s<small>alla partenza</small>`;
      return `
        <div class="geo-dep-row">
          <span class="geo-dep-line" style="background:${d.line.color}">${d.line.code}</span>
          <span class="geo-dep-info">
            <span class="geo-dep-dest">${d.line.name}</span>
            <span class="geo-dep-sub">Parte alle ${this.fmt(d.time)} · ogni ${d.line.frequencyMinutes} min</span>
          </span>
          <span class="geo-dep-count">${countTxt}</span>
        </div>
      `;
    }).join("");

    // Verdetto: fai in tempo a prendere la prossima corsa?
    if (deps.length && verdictEl) {
      const firstDepMin = (deps[0].time - now) / 60000;
      const margin = firstDepMin - walkMin;

      if (margin >= 3) {
        verdictEl.className = "geo-verdict ok";
        verdictEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Ce la fai con calma: ~${Math.round(margin)} min di margine sulla ${deps[0].line.code}.`;
      } else if (margin >= 0) {
        verdictEl.className = "geo-verdict run";
        verdictEl.innerHTML = `<i class="fa-solid fa-person-running"></i> Affrettati! Margine di ~${Math.max(0, Math.round(margin))} min per la ${deps[0].line.code}.`;
      } else {
        // Cerca la prima corsa che si riesce ancora a prendere
        const catchable = deps.find(d => ((d.time - now) / 60000) >= walkMin);
        verdictEl.className = "geo-verdict miss";
        if (catchable) {
          verdictEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Non prendi la ${deps[0].line.code}: punta alla ${catchable.line.code} delle ${this.fmt(catchable.time)}.`;
        } else {
          verdictEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Le corse mostrate partono prima del tuo arrivo: valuta un'altra fermata.`;
        }
      }
    }
  }

  fmt(date) {
    return String(date.getHours()).padStart(2, "0") + ":" +
           String(date.getMinutes()).padStart(2, "0");
  }

  showError(msg) {
    if (!this.panel) return;
    this.panel.innerHTML = `<div class="geo-error"><i class="fa-solid fa-circle-exclamation"></i> ${msg}</div>`;
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
