/**
 * ITALIABUS - INTERACTIVE LIVE MAP ENGINE (LEAFLET.JS)
 * Mappa satellitare/vettoriale georeferenziata,
 * con tracciati delle linee, fermate interattive e pullman in movimento in tempo reale.
 */

class TransitMapEngine {
  constructor() {
    this.mapEl = document.getElementById("leafletTransitMap");
    this.map = null;
    this.stopMarkersLayer = null;
    this.routeLinesLayer = null;
    this.liveBusesLayer = null;
    this.activeFilter = "all"; 
    this.activeBuses = [];
    this.animationTimer = null;
    this.isRouteIsolated = false;

    this.init();
  }

  init() {
    if (!this.mapEl || typeof L === 'undefined') return;
    try {
      this.setupMap();
      this.drawRoutePolylines();
      this.placeStopMarkers();
      this.spawnLiveBuses();
      this.bindMapControls();
    } catch (e) {
      console.warn("Leaflet Map init error:", e);
    }

    document.addEventListener('regionChanged', (e) => {
      if (!this.map || typeof L === 'undefined') return;
      const isMapActive = document.getElementById("section-map")?.classList.contains("active");
      if (!isMapActive) {
        this.needsRegionRefresh = true;
        this.lastRegionDetail = e.detail;
        return;
      }
      this.refreshMapForRegion(e.detail);
    });

    document.addEventListener('transportModeChanged', (e) => {
      if (!this.map || typeof L === 'undefined') return;
      const isMapActive = document.getElementById("section-map")?.classList.contains("active");
      if (!isMapActive) {
        this.needsModeRefresh = true;
        this.lastModeDetail = e.detail;
        return;
      }
      this.refreshMapForMode(e.detail);
    });
  }

  refreshMapForRegion(detail) {
    if (!this.map || typeof L === 'undefined') return;
    try {
      const regionId = detail?.regionId || (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
      const stopId = detail?.stopId || (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_stop", "") : "");
      
      let targetStop = stopId ? getStopById(stopId) : null;
      if (!targetStop) {
        const regionStops = getStopsByRegion(regionId);
        targetStop = regionStops.find(s => s.isMainHub) || regionStops[0];
      }

      if (targetStop && this.map) {
        this.map.flyTo([targetStop.lat_actual || targetStop.lat, targetStop.lng_actual || targetStop.lng], 12, { duration: 1.0 });
      } else {
        const region = getRegionById(regionId);
        if (region && this.map) {
          this.map.flyTo(region.mapCenter, region.mapZoom, { duration: 1.0 });
        }
      }
      this.drawRoutePolylines();
      this.placeStopMarkers();
      this.spawnLiveBuses();
      this.bindMapControls();
    } catch (err) {
      console.warn("Leaflet Map region change error:", err);
    }
  }

  refreshMapForMode(detail) {
    if (!this.map || typeof L === 'undefined') return;
    try {
      const mode = detail?.mode || (typeof getActiveMode === "function" ? getActiveMode() : "pullman");
      const stopId = detail?.stopId || (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_stop", "") : "");
      const currentRegion = detail?.regionId || (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");

      this.drawRoutePolylines();
      this.placeStopMarkers();
      this.spawnLiveBuses();
      this.bindMapControls();

      // Trova la fermata/stazione target per la modalità attiva
      let targetStop = stopId ? getStopById(stopId) : null;
      if (!targetStop) {
        const regionStops = getStopsByRegion(currentRegion);
        targetStop = regionStops.find(s => s.isMainHub) || regionStops[0];
      }
      if (!targetStop && mode !== 'pullman') {
        const allStops = getStopsByRegion('all');
        targetStop = allStops.find(s => s.isMainHub) || allStops[0];
      }

      if (targetStop && this.map) {
        this.map.flyTo([targetStop.lat_actual || targetStop.lat, targetStop.lng_actual || targetStop.lng], 12, { duration: 0.8 });
      } else {
        const region = getRegionById(currentRegion);
        if (region && this.map) {
          this.map.flyTo(region.mapCenter, region.mapZoom, { duration: 0.8 });
        }
      }
    } catch (err) {
      console.warn("Leaflet Map mode change error:", err);
    }
  }

  setupMap() {
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const region = getRegionById(currentRegion);
    const center = region ? region.mapCenter : [42.5, 12.5]; 
    const zoom = region ? region.mapZoom : 6;

    this.map = L.map('leafletTransitMap', {
      center: center,
      zoom: zoom,
      zoomControl: true,
      scrollWheelZoom: true
    });

    // Basemap GRATUITI senza API key (i tile CARTO ora richiedono una chiave).
    // L'utente sceglie la modalità dal selettore in alto a sinistra sulla mappa.
    const osmAttr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    const esriAttr = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>';
    const _bm = {
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc', maxZoom: 19, attribution: osmAttr }),
      imagery: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: esriAttr }),
      esriLabels: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: '' }),
      lightGray: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16, attribution: esriAttr }),
      topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc', maxZoom: 17, attribution: osmAttr + ' &copy; <a href="https://opentopomap.org/">OpenTopoMap</a> (CC-BY-SA)' }),
      darkGray: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16, attribution: esriAttr })
    };
    // Satellite = immagini + etichette (nomi città/strade) sopra.
    const satellite = L.layerGroup([_bm.imagery, _bm.esriLabels]);
    this._baseMaps = {
      '🗺️ Mappa': _bm.osm,
      '🛰️ Satellite': satellite,
      '🛣️ Strade': _bm.lightGray,
      '⛰️ Rilievo': _bm.topo,
      '🌙 Scuro': _bm.darkGray
    };
    const savedBase = (typeof safeStorageGet === 'function') ? safeStorageGet('italiabus_basemap', '🗺️ Mappa') : '🗺️ Mappa';
    (this._baseMaps[savedBase] || _bm.osm).addTo(this.map);
    L.control.layers(this._baseMaps, null, { position: 'topleft', collapsed: true }).addTo(this.map);
    this.map.on('baselayerchange', (e) => {
      if (typeof safeStorageSet === 'function') safeStorageSet('italiabus_basemap', e.name);
    });

    this.routeLinesLayer = L.featureGroup().addTo(this.map);
    this.stopMarkersLayer = L.featureGroup().addTo(this.map);
    this.liveBusesLayer = L.featureGroup().addTo(this.map);
    this.highlightedRouteLayer = L.featureGroup().addTo(this.map);
    this.walkingRouteLayer = L.featureGroup().addTo(this.map);
    this.userLocationLayer = L.featureGroup().addTo(this.map);

    if (window.radarEngine) {
      window.radarEngine.setMap(this.map);
    }

    // Controllo GPS nativo sulla mappa
    const LocateControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control-gps-btn');
        btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
        btn.title = 'Trova la mia posizione GPS e zumma';
        btn.setAttribute('aria-label', 'Trova la mia posizione GPS');
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.stop(e);
          if (window.geoLocator) {
            window.geoLocator.locateAndRoute();
          } else {
            this.locateUser();
          }
        });
        return btn;
      }
    });
    this.map.addControl(new LocateControl());

    // Aggiorna le fermate visibili SOLO quando serve davvero (cambio zoom o
    // spostamento oltre l'area gia' caricata). NON ricostruire i marker ad ogni
    // micro-movimento/tocco: farlo faceva "saltare" i marker e impediva al tap
    // di aprire il popup della fermata.
    this._moveEndTimer = null;
    this._skipMoveEnd = false;
    this._renderedZoom = null;
    this._renderedBounds = null;
    this._dragging = false;
    this._stopsHidden = false;

    this.map.on('popupopen', () => {
      this._skipMoveEnd = true;
    });
    this.map.on('popupclose', () => {
      setTimeout(() => {
        this._skipMoveEnd = false;
      }, 400);
    });

    // Non ricostruire mentre l'utente sta trascinando la mappa
    this.map.on('dragstart', () => { this._dragging = true; });
    this.map.on('dragend', () => { this._dragging = false; });
    this.map.on('moveend', () => {
      if (!this.map || this._skipMoveEnd || this.isRouteIsolated) return;
      clearTimeout(this._moveEndTimer);
      this._moveEndTimer = setTimeout(() => {
        if (this._skipMoveEnd || this._dragging || this.isRouteIsolated) return;
        if (this._shouldReplaceStops()) {
          this.placeStopMarkers();
        }
      }, 350);
    });
  }

  // Decide se le fermate vanno ridisegnate: solo se e' cambiato lo zoom oppure
  // la vista e' uscita dall'area (con margine) gia' renderizzata.
  _shouldReplaceStops() {
    if (!this.map || this.isRouteIsolated) return false;
    if (this._renderedZoom == null || !this._renderedBounds) return true;
    if (this.map.getZoom() !== this._renderedZoom) return true;
    return !this._renderedBounds.contains(this.map.getBounds());
  }

  locateUser() {
    if (!navigator.geolocation) {
      alert("Geolocalizzazione non supportata dal tuo dispositivo/browser.");
      return;
    }
    if (!this.map) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || 30;
        this.map.invalidateSize();
        this.map.flyTo([lat, lng], 16, { animate: true, duration: 1.5 });
        if (this.userLocationLayer) {
          this.userLocationLayer.clearLayers();
          L.circle([lat, lng], { radius: Math.max(accuracy, 20), color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 0.2 }).addTo(this.userLocationLayer);
          const icon = L.divIcon({
            html: '<div class="user-gps-pulse-pin"><span class="gps-core-dot"></span></div>',
            className: 'user-gps-pin-wrapper',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          L.marker([lat, lng], { icon: icon, zIndexOffset: 2000 })
            .bindPopup('<strong>📍 La tua Posizione Attuale</strong><br><small>GPS: ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</small>')
            .addTo(this.userLocationLayer)
            .openPopup();
        }
      },
      (err) => {
        if (window.geoLocator) {
          window.geoLocator.onGeoError(err);
        } else {
          alert("Impossibile ottenere la posizione: " + (err.message || "Permesso negato o GPS non disponibile."));
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  }

  drawRoutePolylines() {
    if (!this.routeLinesLayer) return;
    this.routeLinesLayer.clearLayers();
    if (this.isRouteIsolated) return;

    const currentMode = typeof getActiveMode === "function" ? getActiveMode() : "pullman";
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    let lines = getLinesByRegion(currentRegion);
    if ((!lines || lines.length === 0) && currentMode !== 'pullman') {
      lines = getLinesByRegion('all');
    }
    if (!lines) return;

    // Crea un lookup index per le coordinate delle fermate O(1)
    const modeData = window.TRANSIT_DATA?.modes?.[currentMode] || window.TRANSIT_DATA?.modes?.pullman;
    const allStops = modeData?.stops || [];
    const stopCoordMap = new Map();
    for (let i = 0; i < allStops.length; i++) {
      const s = allStops[i];
      stopCoordMap.set(s.id, [s.lat_actual || s.lat, s.lng_actual || s.lng]);
    }

    // Renderizza le linee principali per garantire 60fps
    lines.forEach(line => {
      const stopsArr = line.stopsIds || line.stops || [];
      const latlngs = [];
      for (let i = 0; i < stopsArr.length; i++) {
        const c = stopCoordMap.get(stopsArr[i]);
        if (c) latlngs.push(c);
      }

      if (latlngs.length >= 2) {
        const isTrain = currentMode === 'train' || line.type === 'av';
        const polyline = L.polyline(latlngs, {
          color: line.color || (isTrain ? '#dc2626' : '#0284c7'),
          weight: isTrain ? 5 : 4,
          opacity: 0.85,
          smoothFactor: 1.5,
          lineJoin: 'round',
          dashArray: line.type === 'suburban' ? '6, 8' : (isTrain ? '8, 4' : null)
        });

        polyline.bindTooltip(`<strong>${line.code}</strong> - ${line.name}`, {
          sticky: true,
          className: 'custom-map-tooltip'
        });

        this.routeLinesLayer.addLayer(polyline);
      }
    });
  }

  placeStopMarkers() {
    if (!this.stopMarkersLayer || !this.map) return;
    this.stopMarkersLayer.clearLayers();
    // Percorso isolato (visualizza orari): non ridisegnare tutte le fermate
    if (this.isRouteIsolated) return;
    // Se le fermate sono nascoste dall'utente, non ridisegnarle (nemmeno al moveend)
    if (this._stopsHidden) return;

    const currentMode = typeof getActiveMode === "function" ? getActiveMode() : "pullman";
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const modeData = window.TRANSIT_DATA?.modes?.[currentMode] || window.TRANSIT_DATA?.modes?.pullman;
    const allStops = modeData?.stops || [];
    if (!allStops || allStops.length === 0) return;

    let displayStops = [];

    if (currentMode !== 'pullman') {
      // Per treni, aerei, tram, taxi: visualizza tutte le stazioni/aeroporti/posteggi registrati
      displayStops = allStops;
    } else {
      const zoom = this.map.getZoom();
      // Carica un'area piu' ampia di quella visibile (margine 40%): cosi' i
      // piccoli spostamenti e i tocchi non richiedono un ridisegno dei marker.
      const bounds = this.map.getBounds().pad(0.4);
      const regionStops = (typeof getStopsByRegion === 'function') ? getStopsByRegion(currentRegion) : allStops;
      const searchPool = (regionStops && regionStops.length > 0) ? regionStops : allStops;

      if (zoom >= 11 && bounds) {
        // Mostra tutte le fermate visibili nell'area inquadrata (fino a 250 fermate)
        for (let i = 0; i < searchPool.length; i++) {
          const s = searchPool[i];
          const lat = s.lat_actual || s.lat;
          const lng = s.lng_actual || s.lng;
          if (lat && lng && bounds.contains([lat, lng])) {
            displayStops.push(s);
            if (displayStops.length >= 250) break;
          }
        }
        // Se poche fermate nel bounds (es. inquadratura tra confini), aggiungi hub
        if (displayStops.length < 30) {
          const hubs = searchPool.filter(s => s.isMainHub || s.isTemporary);
          hubs.forEach(h => {
            if (!displayStops.includes(h)) displayStops.push(h);
          });
        }
      } else {
        // Vista ampia: mostra tutti gli hub, fermate provvisorie e un campione uniforme di fermate regionali
        const hubs = searchPool.filter(s => s.isMainHub || s.isTemporary);
        const regular = searchPool.filter(s => !s.isMainHub && !s.isTemporary);
        const step = Math.max(1, Math.floor(regular.length / 140));
        const sampled = [];
        for (let i = 0; i < regular.length; i += step) {
          sampled.push(regular[i]);
          if (sampled.length >= 140) break;
        }
        displayStops = hubs.concat(sampled);
      }
    }

    if (!displayStops || displayStops.length === 0) {
      displayStops = allStops.slice(0, 80);
    }

    // Ordina e filtra per garantire che le Stazioni Bus e i Terminal abbiano sempre priorità assoluta
    const isBusStation = (s) => !!(s.isMainHub || (s.name && (s.name.includes("Terminal") || s.name.includes("Autostazione") || s.name.includes("Stazione FS") || s.name.includes("Scalo"))));

    // Assicura che le stazioni siano sempre all'inizio dell'array
    displayStops.sort((a, b) => {
      const aHub = isBusStation(a) ? 1 : 0;
      const bHub = isBusStation(b) ? 1 : 0;
      return bHub - aHub;
    });

    displayStops.forEach(stop => {
      const isStation = isBusStation(stop);
      const isUrban = stop.category === "urban";
      const isTemp = !!stop.isTemporary;
      const isTempActive = isTemp && stop.temporaryStatus === 'active';
      const isTempInactive = isTemp && stop.temporaryStatus !== 'active';
      const lat = stop.lat_actual || stop.lat;
      const lng = stop.lng_actual || stop.lng;
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      let iconClass = 'fa-location-dot';
      let markerClass = 'custom-stop-marker';

      if (currentMode === 'flight') {
        markerClass += ' marker-flight';
        iconClass = 'fa-plane-departure';
      } else if (currentMode === 'train') {
        markerClass += ' marker-train';
        iconClass = isStation ? 'fa-train-subway' : 'fa-train';
      } else if (currentMode === 'tram') {
        markerClass += ' marker-tram';
        iconClass = 'fa-train-tram';
      } else if (currentMode === 'taxi') {
        markerClass += ' marker-taxi';
        iconClass = 'fa-taxi';
      } else {
        if (isStation) {
          markerClass += ' marker-station-hub';
          iconClass = 'fa-bus-simple';
        } else {
          markerClass += isUrban ? ' marker-urban' : ' marker-regional';
          iconClass = 'fa-location-dot';
        }
      }

      if (isTemp) {
        markerClass += isTempActive ? ' marker-temporary-active' : ' marker-temporary-inactive';
        iconClass = isTempActive ? 'fa-triangle-exclamation' : 'fa-person-digging';
      }

      const iconHtml = `
        <div class="${markerClass}" title="${stop.name}">
          <i class="fa-solid ${iconClass}"></i>
        </div>
      `;

      const markerSize = isStation ? [34, 34] : (isTemp ? [32, 32] : [26, 26]);
      const markerAnchor = isStation ? [17, 17] : (isTemp ? [16, 16] : [13, 13]);
      const popupAnchor = isStation ? [0, -17] : (isTemp ? [0, -16] : [0, -13]);

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'stop-marker-wrapper',
        iconSize: markerSize,
        iconAnchor: markerAnchor,
        popupAnchor: popupAnchor
      });

      const marker = L.marker([lat, lng], {
        icon: customIcon,
        zIndexOffset: isStation ? 1500 : (isTemp ? 1200 : 500)
      });

      // Generazione Popup nativo Leaflet con callback lazy e autoPan: false per stabilita assoluta
      marker.bindPopup(() => {
        return this.buildStopPopupHtml(stop, currentMode, isTemp, isTempActive, isTempInactive);
      }, {
        maxWidth: 360,
        minWidth: 280,
        className: 'transit-popup',
        autoPan: false
      });

      this.stopMarkersLayer.addLayer(marker);
    });

    // Memorizza lo stato di rendering per evitare ricostruzioni inutili (vedi _shouldReplaceStops)
    if (this.map) {
      this._renderedZoom = this.map.getZoom();
      this._renderedBounds = this.map.getBounds().pad(0.4);
    }
  }

  buildStopPopupHtml(stop, currentMode, isTemp, isTempActive, isTempInactive) {
    const altData = isTemp ? (typeof window.getAlternativeActiveStop === 'function' ? window.getAlternativeActiveStop(stop.id) : null) : null;
    const modeData = window.TRANSIT_DATA?.modes?.[currentMode] || window.TRANSIT_DATA?.modes?.pullman;
    const allLines = modeData?.lines || [];
    
    // Trova le linee che transitano per questa fermata
    let servingLines = allLines.filter(l => (l.stopsIds || l.stops || []).includes(stop.id));
    if (servingLines.length === 0) {
      servingLines = allLines.filter(l => l.region === stop.region || (l.area && l.area === stop.area)).slice(0, 4);
    }
    if (servingLines.length === 0) {
      servingLines = allLines.slice(0, 3);
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Costruisci le schede dei pullman con destinazioni e prossimi orari
    const linesCardsHtml = servingLines.slice(0, 4).map(l => {
      const stopsArr = l.stopsIds || l.stops || [];
      const destStopId = stopsArr.length > 0 ? stopsArr[stopsArr.length - 1] : null;
      let destName = destStopId && typeof getStopById === 'function' ? getStopById(destStopId)?.name : null;
      if (!destName || destName === stop.name) {
        if (l.name && l.name.includes("➔")) {
          destName = l.name.split("➔").pop().trim();
        } else if (l.name && l.name.includes(" - ")) {
          destName = l.name.split(" - ").pop().trim();
        } else {
          destName = l.name;
        }
      }

      // Pulisci prefissi "Fermata 12345 - "
      if (destName && /^Fermata\s+\d+\s*-\s*/i.test(destName)) {
        destName = destName.replace(/^Fermata\s+\d+\s*-\s*/i, "");
      }

      // Orari programmati
      let rawSchedule = l.schedule?.weekday || ["06:30", "07:15", "08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00"];
      let nextTimeStr = null;
      let minDiff = Infinity;

      for (let t of rawSchedule) {
        const parts = t.split(":");
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m)) continue;
        const tMin = h * 60 + m;
        const diff = tMin - currentMinutes;
        if (diff > 0 && diff < minDiff) {
          minDiff = diff;
          nextTimeStr = t;
        }
      }

      if (!nextTimeStr) {
        nextTimeStr = rawSchedule[0];
      }

      const nextBadge = minDiff !== Infinity && minDiff <= 60
        ? `<span style="background:#16a34a; color:#fff; padding:2px 6px; border-radius:4px; font-weight:800; font-size:0.72rem;"><i class="fa-solid fa-clock"></i> ${nextTimeStr} (tra ${minDiff} min)</span>`
        : `<span style="background:#0284c7; color:#fff; padding:2px 6px; border-radius:4px; font-weight:800; font-size:0.72rem;"><i class="fa-regular fa-clock"></i> Prossimo: ${nextTimeStr}</span>`;

      return `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:7px 9px; margin-bottom:6px; border-left:4px solid ${l.color || '#0284c7'};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; flex-wrap:wrap; gap:4px;">
            <strong style="color:${l.color || '#0284c7'}; font-size:0.86rem; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-solid ${currentMode === 'flight' ? 'fa-plane' : (currentMode === 'train' ? 'fa-train' : 'fa-bus')}"></i>
              ${l.code || l.name}
            </strong>
            ${nextBadge}
          </div>
          <div style="font-size:0.8rem; color:#0f172a; margin-bottom:2px; font-weight:600;">
            <span style="color:#64748b; font-weight:400;">Destinazione:</span> ${destName}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; color:#64748b;">
            <span><i class="fa-solid fa-building"></i> ${l.operator || 'Servizio TPL'}</span>
            <span><i class="fa-solid fa-clock-rotate-left"></i> ${rawSchedule.slice(0, 3).join(', ')}...</span>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="map-popup-card ${isTemp ? 'popup-card-temporary' : ''}" style="max-height:360px; overflow-y:auto;">
        <div class="map-popup-head" style="margin-bottom:8px;">
          <div class="popup-top-badges">
            <span class="popup-badge">${stop.area || 'Rete'}</span>
            ${isTemp ? (isTempActive ? 
              '<span class="popup-badge-temp-active"><i class="fa-solid fa-triangle-exclamation"></i> Provvisoria ATTIVA</span>' : 
              '<span class="popup-badge-temp-inactive"><i class="fa-solid fa-ban"></i> Chiusa per Lavori</span>'
            ) : ''}
            <span class="popup-code-badge"><i class="fa-solid fa-barcode"></i> ${stop.code || stop.stopCode || 'Transit Code'}</span>
          </div>
          <h4 style="margin:6px 0 2px 0; font-size:1.08rem; color:#0f172a; font-weight:800; ${isTempInactive ? 'text-decoration: line-through; opacity: 0.85;' : ''}">${stop.name}</h4>
          <p class="popup-addr" style="margin:0 0 6px 0; font-size:0.78rem; color:#64748b;"><i class="fa-solid fa-map-pin"></i> ${stop.address || 'Posizione Georeferenziata'}</p>
        </div>

        ${isTemp ? `
          <div class="temporary-alert-box ${isTempActive ? 'alert-active' : 'alert-inactive'}">
            <div class="temp-alert-title">
              <i class="fa-solid ${isTempActive ? 'fa-circle-check text-success' : 'fa-triangle-exclamation text-danger'}"></i>
              <strong>${isTempActive ? 'Fermata Provvisoria ATTIVA' : 'Fermata Provvisoria NON ATTIVA / Sospesa'}</strong>
            </div>
            <p class="temp-alert-reason"><i class="fa-solid fa-wrench"></i> ${stop.temporaryReason || 'Cantiere stradale o variazione di percorso'}</p>
            <small class="temp-alert-valid"><i class="fa-regular fa-clock"></i> Validità: <strong>${stop.temporaryValidUntil || 'Fino a termine lavori'}</strong></small>
          </div>
        ` : ''}

        <div style="margin-top:6px; margin-bottom:8px;">
          <span style="font-weight:800; font-size:0.8rem; color:#334155; display:block; margin-bottom:6px;">
            <i class="fa-solid fa-route text-primary"></i> ${currentMode === 'flight' ? 'Voli e Destinazioni in Partenza:' : (currentMode === 'train' ? 'Treni e Destinazioni in Transito:' : 'Pullman in Transito e Orari:')}
          </span>
          <div class="popup-lines-list">
            ${linesCardsHtml}
          </div>
        </div>

        <div class="map-popup-gmaps-links" style="display:flex; gap:6px; margin-bottom:8px;">
          <a href="${stop.gmapsUrl || ('https://www.google.com/maps/search/?api=1&query=' + (stop.lat_actual || stop.lat) + ',' + (stop.lng_actual || stop.lng))}" target="_blank" rel="noopener" class="btn-popup-gmaps" style="flex:1; text-align:center; padding:5px 8px; font-size:0.75rem;" title="Visualizza su Google Maps">
            <i class="fa-brands fa-google"></i> Maps
          </a>
          <a href="${stop.streetViewUrl || ('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + (stop.lat_actual || stop.lat) + ',' + (stop.lng_actual || stop.lng))}" target="_blank" rel="noopener" class="btn-popup-gmaps" style="flex:1; text-align:center; padding:5px 8px; font-size:0.75rem;" title="Visualizza Street View a 360°">
            <i class="fa-solid fa-street-view"></i> Street View
          </a>
        </div>

        <div class="map-popup-actions" style="display: flex; flex-direction: column; gap: 6px;">
          <button class="btn btn-xs btn-primary w-100" style="padding:7px 10px; font-size:0.82rem;" onclick="if(window.liveBoard){ window.liveBoard.switchToStop('${isTempInactive && altData && altData.alternativeStop ? altData.alternativeStop.id : stop.id}'); } window.app.switchTab('live-board');">
            <i class="fa-solid ${currentMode === 'flight' ? 'fa-plane-departure' : (currentMode === 'taxi' ? 'fa-taxi' : (currentMode === 'train' ? 'fa-train' : 'fa-table-list'))}"></i> ${currentMode === 'flight' ? 'Tabellone Voli Completo' : (currentMode === 'taxi' ? 'Dettagli Posteggio & Tariffe' : (currentMode === 'train' ? 'Tabellone Stazione FS' : 'Tabellone Orari Completo'))}
          </button>
        </div>
      </div>
    `;
  }

  spawnLiveBuses() {
    this.activeBuses = [];
    if (!this.liveBusesLayer) return;
    this.liveBusesLayer.clearLayers();
    if (this.isRouteIsolated) return;

    const currentMode = typeof getActiveMode === "function" ? getActiveMode() : "pullman";
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    let lines = getLinesByRegion(currentRegion);
    if ((!lines || lines.length === 0) && currentMode !== 'pullman') {
      lines = getLinesByRegion('all');
    }
    if (!lines || lines.length === 0) return;

    // Seleziona fino a 12 veicoli live per evitare sovraccarico di animazione
    const activeLines = lines.slice(0, 12);

    activeLines.forEach((line, idx) => {
      const sIds = line.stopsIds || line.stops || [];
      const stops = sIds.map(sId => getStopById(sId)).filter(Boolean);
      if (stops.length < 2) return;

      const isTrain = currentMode === "train" || line.type === "av";
      const isTram = currentMode === "tram" || line.type === "tram";
      const isTaxi = currentMode === "taxi" || line.type === "taxi";
      
      let baseSpeed = Math.floor(Math.random() * 25) + 30;
      if (isTrain) {
        baseSpeed = line.type === "av" ? (Math.floor(Math.random() * 35) + 265) : (Math.floor(Math.random() * 30) + 120);
      } else if (isTram) {
        baseSpeed = Math.floor(Math.random() * 15) + 20;
      } else if (isTaxi) {
        baseSpeed = Math.floor(Math.random() * 20) + 35;
      }

      const busState = {
        id: `${isTrain ? 'TRAIN' : (isTram ? 'TRAM' : (isTaxi ? 'TAXI' : 'BUS'))}_${line.id}_${idx}`,
        line: line,
        stops: stops,
        currentSegmentIdx: 0,
        progress: Math.random(), 
        speedKmh: baseSpeed, 
        isTrain: isTrain,
        isTram: isTram,
        isTaxi: isTaxi,
        marker: null
      };

      const startLat = stops[0].lat_actual || stops[0].lat;
      const startLng = stops[0].lng_actual || stops[0].lng;

      let vehicleIconClass = 'fa-bus';
      let vehicleMarkerClass = 'custom-bus-marker';
      if (currentMode === 'flight') {
        vehicleIconClass = 'fa-plane';
        vehicleMarkerClass += ' custom-flight-marker';
      } else if (isTrain) {
        vehicleIconClass = line.type === 'av' ? 'fa-train-subway' : 'fa-train';
        vehicleMarkerClass += ' custom-train-marker';
      } else if (isTram) {
        vehicleIconClass = 'fa-train-tram';
        vehicleMarkerClass += ' custom-tram-marker';
      } else if (isTaxi) {
        vehicleIconClass = 'fa-taxi';
        vehicleMarkerClass += ' custom-taxi-marker';
      }

      const busIconHtml = `
        <div class="${vehicleMarkerClass}" style="background-color: ${line.color}; box-shadow: 0 0 10px ${line.color}80;">
          <i class="fa-solid ${vehicleIconClass}"></i>
          <span class="bus-badge-num">${line.code}</span>
        </div>
      `;

      const busIcon = L.divIcon({
        html: busIconHtml,
        className: 'bus-marker-wrapper',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      busState.marker = L.marker([startLat, startLng], { icon: busIcon }).addTo(this.liveBusesLayer);
      
      this.updateBusTooltip(busState);
      this.activeBuses.push(busState);
    });

    if (this.animationTimer) clearInterval(this.animationTimer);
    this.animationTimer = setInterval(() => this.animateBusesStep(), 2500);
  }

  animateBusesStep() {
    // Non eseguire l'animazione se la scheda mappa non è visibile o la pagina è nascosta o il percorso è isolato
    if (document.hidden || this.isRouteIsolated) return;
    const isMapActive = document.getElementById("section-map")?.classList.contains("active");
    if (!isMapActive) return;

    for (let i = 0; i < this.activeBuses.length; i++) {
      const bus = this.activeBuses[i];
      bus.progress += 0.08;

      if (bus.progress >= 1.0) {
        bus.progress = 0;
        bus.currentSegmentIdx = (bus.currentSegmentIdx + 1) % (bus.stops.length - 1);
      }

      const fromStop = bus.stops[bus.currentSegmentIdx];
      const toStop = bus.stops[bus.currentSegmentIdx + 1];
      if (!fromStop || !toStop) continue;

      const fromLat = fromStop.lat_actual || fromStop.lat;
      const fromLng = fromStop.lng_actual || fromStop.lng;
      const toLat = toStop.lat_actual || toStop.lat;
      const toLng = toStop.lng_actual || toStop.lng;

      const curLat = fromLat + (toLat - fromLat) * bus.progress;
      const curLng = fromLng + (toLng - fromLng) * bus.progress;

      if (bus.marker) {
        bus.marker.setLatLng([curLat, curLng]);
      }
    }
  }

  updateBusTooltip(bus) {
    const nextStop = bus.stops[bus.currentSegmentIdx + 1] || bus.stops[0];
    const speed = bus.speedKmh + Math.floor(Math.random() * 5) - 2;
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const isTrain = bus.isTrain;
    const sourceInfo = isTrain ? { agency: "ViaggiaTreno / RFI", type: "ViaggiaTreno Live" } : (window.realtimeTransit ? window.realtimeTransit.getActiveSourceForRegion(currentRegion) : { agency: "GTFS-RT / Transit.land", type: "GPS Live" });

    bus.marker.bindTooltip(`
      <div class="bus-live-tooltip">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="color: ${bus.line.color}; font-size: 0.95rem;">${bus.line.code}: ${bus.line.name}</strong>
        </div>
        <div style="margin-bottom: 4px;">
          <span class="live-sat-chip" style="font-size: 0.65rem; padding: 2px 6px;"><i class="fa-solid fa-satellite"></i> ${sourceInfo.type}</span>
        </div>
        <span class="text-muted"><i class="fa-solid fa-gauge-high"></i> Velocità: <strong>${speed} km/h</strong></span><br>
        <span><i class="fa-solid fa-arrow-right"></i> Prossima Stazione: <strong>${nextStop.name.split(' (')[0]}</strong></span>
      </div>
    `, {
      direction: 'top',
      offset: [0, -18],
      className: 'live-bus-map-tooltip'
    });
  }

  zoomIn() {
    if (this.map) {
      this.map.zoomIn();
    }
  }

  zoomOut() {
    if (this.map) {
      this.map.zoomOut();
    }
  }

  resetView() {
    if (!this.map) return;
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const r = getRegionById(currentRegion);
    if (r) {
      this.map.flyTo(r.mapCenter, r.mapZoom, { duration: 1.2 });
    } else {
      this.map.flyTo([42.5, 12.5], 6, { duration: 1.2 });
    }
  }

  /* Nasconde o mostra i marker delle fermate sulla mappa */
  toggleStops() {
    this._stopsHidden = !this._stopsHidden;
    if (this._stopsHidden) {
      if (this.stopMarkersLayer) this.stopMarkersLayer.clearLayers();
    } else {
      this.placeStopMarkers();
    }
    this.bindMapControls(); // aggiorna l'etichetta del pulsante
  }

  bindMapControls() {
    const container = document.getElementById("mapQuickButtonsContainer");
    if (!container) return;
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const currentMode = typeof getActiveMode === "function" ? getActiveMode() : "pullman";
    
    let allStops = getStopsByRegion(currentRegion);
    if ((!allStops || allStops.length === 0) && currentMode !== 'pullman') {
      allStops = getStopsByRegion('all');
    }
    const hubStops = allStops.filter(s => s.isMainHub);
    const displayStops = hubStops.length > 0 ? hubStops : allStops;
    
    container.innerHTML = '';

    // 1. Label
    const label = document.createElement('span');
    label.className = 'text-muted';
    label.style.cssText = 'font-size: 0.8rem; font-weight: 700; align-self: center;';
    label.textContent = 'Zoom & Controlli:';
    container.appendChild(label);

    // 2. Pulsanti Zoom + e Zoom -
    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.className = 'map-btn-pill btn-zoom-in';
    zoomInBtn.innerHTML = `<i class="fa-solid fa-plus text-primary"></i> Zoom +`;
    zoomInBtn.title = "Ingrandisci la visuale della mappa";
    zoomInBtn.addEventListener('click', () => this.zoomIn());
    container.appendChild(zoomInBtn);

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.className = 'map-btn-pill btn-zoom-out';
    zoomOutBtn.innerHTML = `<i class="fa-solid fa-minus text-primary"></i> Zoom -`;
    zoomOutBtn.title = "Rimpicciolisci la visuale della mappa";
    zoomOutBtn.addEventListener('click', () => this.zoomOut());
    container.appendChild(zoomOutBtn);

    // 3. Pulsante Panoramica / Centra
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'map-btn-pill btn-reset-zoom';
    resetBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate text-primary"></i> Centra`;
    resetBtn.title = "Riporta la mappa alla visuale completa della regione";
    resetBtn.addEventListener('click', () => this.resetView());
    container.appendChild(resetBtn);

    // 3b. Pulsante Nascondi / Mostra fermate
    const stopsBtn = document.createElement('button');
    stopsBtn.type = 'button';
    stopsBtn.className = 'map-btn-pill btn-toggle-stops';
    stopsBtn.innerHTML = this._stopsHidden
      ? `<i class="fa-solid fa-eye text-primary"></i> Mostra fermate`
      : `<i class="fa-solid fa-eye-slash text-primary"></i> Nascondi fermate`;
    stopsBtn.title = this._stopsHidden ? "Mostra di nuovo le fermate sulla mappa" : "Nascondi le fermate dalla mappa";
    stopsBtn.addEventListener('click', () => this.toggleStops());
    container.appendChild(stopsBtn);

    // 4. GPS My Location Button
    const gpsBtn = document.createElement('button');
    gpsBtn.type = 'button';
    gpsBtn.className = 'map-btn-pill btn-pill-gps-active';
    gpsBtn.innerHTML = `<i class="fa-solid fa-location-crosshairs text-primary"></i> GPS`;
    gpsBtn.title = "Centra e trova fermate alla tua posizione GPS";
    gpsBtn.addEventListener('click', () => {
      if (window.geoLocator) {
        window.geoLocator.locateAndRoute();
      } else {
        this.locateUser();
      }
    });
    container.appendChild(gpsBtn);

    // 5. Hub principali univoci per la modalità attiva
    const modeIcon = currentMode === 'flight' ? '✈️' : (currentMode === 'train' ? '🚆' : (currentMode === 'tram' ? '🚋' : (currentMode === 'taxi' ? '🚕' : '🚏')));
    const seenNames = new Set();
    const uniqueStops = [];
    for (let i = 0; i < displayStops.length; i++) {
      const s = displayStops[i];
      const shortName = s.name.split(' (')[0].split(' - ')[0];
      if (!seenNames.has(shortName) && s.lat && s.lng) {
        seenNames.add(shortName);
        uniqueStops.push({ stop: s, shortName });
        if (uniqueStops.length >= 3) break;
      }
    }

    uniqueStops.forEach(({ stop, shortName }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-btn-pill';
      btn.textContent = `${modeIcon} ${shortName}`;
      btn.title = `Zumma su ${stop.name}`;
      btn.addEventListener('click', () => {
        if (this.map && stop.lat && stop.lng) {
          this.map.flyTo([stop.lat, stop.lng], 15, { duration: 1.2 });
        }
      });
      container.appendChild(btn);
    });
  }

  highlightLineRoute(lineId, dep = null, customColor = null) {
    if (!this.map || !this.highlightedRouteLayer) return;

    // Reset highlighted layer
    this.highlightedRouteLayer.clearLayers();

    // Trova la linea
    const line = typeof getLineById === 'function' ? getLineById(lineId) : null;
    let stops = [];

    if (line && line.stopsIds && line.stopsIds.length > 0) {
      stops = line.stopsIds.map(sId => getStopById(sId)).filter(Boolean);
    }

    // Se non trovata o con meno di 2 fermate, usa i dati di partenza/destinazione
    if (stops.length < 2 && dep) {
      const origStop = (typeof getStopById === 'function' ? getStopById(dep.originId || (dep.origin && dep.origin.id)) : null) || {
        name: dep.origin?.name || "Partenza",
        lat: dep.origin?.lat || 41.9,
        lng: dep.origin?.lng || 12.5,
        address: dep.origin?.address || "Origine"
      };
      const destStop = (typeof getStopById === 'function' ? getStopById(dep.destId || (dep.destination && dep.destination.id)) : null) || {
        name: dep.destination || "Arrivo",
        lat: (origStop.lat + 0.08),
        lng: (origStop.lng + 0.08),
        address: "Destinazione Corsa"
      };
      stops = [origStop, destStop];
    }

    if (stops.length < 2) return;

    const latlngs = stops.map(s => [s.lat_actual || s.lat, s.lng_actual || s.lng]);
    const routeStrokeColor = customColor || (line && line.color) || '#0284c7';

    // Traccia polilinea con effetto Glow retroilluminato e linea principale
    const glowLine = L.polyline(latlngs, {
      color: '#ffffff',
      weight: 12,
      opacity: 0.9,
      lineJoin: 'round'
    });

    const mainLine = L.polyline(latlngs, {
      color: routeStrokeColor,
      weight: 6,
      opacity: 1,
      lineJoin: 'round'
    });

    this.highlightedRouteLayer.addLayer(glowLine);
    this.highlightedRouteLayer.addLayer(mainLine);

    // Aggiungi marker numerati per ogni fermata del percorso
    stops.forEach((st, idx) => {
      const isStart = idx === 0;
      const isEnd = idx === stops.length - 1;
      const markerClass = isStart ? 'route-pin-start' : (isEnd ? 'route-pin-end' : 'route-pin-mid');
      const pinBgStyle = (!isStart && !isEnd) ? `style="background:${routeStrokeColor}"` : '';
      
      const pinHtml = `
        <div class="route-step-pin ${markerClass}" ${pinBgStyle}>
          <span>${idx + 1}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        html: pinHtml,
        className: 'route-step-pin-wrapper',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
      });

      const pinMarker = L.marker([st.lat_actual || st.lat, st.lng_actual || st.lng], { icon: customIcon });

      pinMarker.bindPopup(`
        <div class="map-popup-card">
          <div class="map-popup-head">
            <span class="popup-badge" style="background:${routeStrokeColor}20; color:${routeStrokeColor}; border:1px solid ${routeStrokeColor}60;">${isStart ? '🟢 Partenza Corsa' : (isEnd ? '🔴 Capolinea / Arrivo' : `Fermata ${idx + 1} di ${stops.length}`)}</span>
            <h4>${st.name}</h4>
            <p class="popup-addr"><i class="fa-solid fa-map-pin"></i> ${st.address || ''}</p>
          </div>
          <a href="${st.gmapsUrl || `https://www.google.com/maps/search/?api=1&query=${st.lat},${st.lng}`}" target="_blank" rel="noopener" class="btn-popup-gmaps">
            <i class="fa-brands fa-google"></i> Apri su Google Maps
          </a>
        </div>
      `);

      this.highlightedRouteLayer.addLayer(pinMarker);
    });

    // Zoom fluido per inquadrare perfettamente l'intero tracciato
    try {
      const bounds = mainLine.getBounds();
      if (bounds.isValid()) {
        this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      }
    } catch (e) {
      console.warn("fitBounds error:", e);
    }

    // Mostra Banner Informativo Flottante sulla Mappa
    this.renderRouteFloatingBanner(line, dep, stops, routeStrokeColor);
  }

  renderRouteFloatingBanner(line, dep, stops, customColor = null) {
    let banner = document.getElementById("activeRouteFloatingBanner");
    if (!banner) {
      const mapWrapper = document.querySelector(".transit-map-wrapper");
      if (!mapWrapper) return;
      banner = document.createElement("div");
      banner.id = "activeRouteFloatingBanner";
      banner.className = "map-floating-route-banner";
      mapWrapper.appendChild(banner);
    }

    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeVerbs = {
      pullman: 'Stai prendendo il Pullman',
      train: 'Stai prendendo il Treno',
      flight: 'Stai prendendo il Volo',
      taxi: 'Stai prendendo il Taxi',
      tram: 'Stai prendendo il Tram'
    };
    const ticketAdvice = {
      pullman: 'Biglietto Autolinee TPL (a bordo, tabacchi o app)',
      train: 'Biglietto FS Trenitalia / Italo (in stazione o app)',
      flight: 'Carta d\'imbarco con check-in online',
      taxi: 'Tariffa tassametro (pagamento a bordo)',
      tram: 'Biglietto orario rete urbana'
    };
    const modeIcons = { pullman: 'fa-bus', train: 'fa-train', flight: 'fa-plane', taxi: 'fa-taxi', tram: 'fa-train-tram' };

    const bannerColor = customColor || line?.color || '#0284c7';
    const lineCode = line?.code || dep?.lineCode || "Corsa";
    const lineName = line?.name || dep?.lineName || "Tracciato Selezionato";
    const destName = dep?.destination || (stops[stops.length - 1]?.name) || "Destinazione";
    const schedTime = dep ? `${String(dep.scheduledTime.getHours()).padStart(2, '0')}:${String(dep.scheduledTime.getMinutes()).padStart(2, '0')}` : "--:--";
    const platform = dep?.platform || (currentMode === 'train' ? 'Binario 1 / 2 FS (verifica tabellone)' : 'Banchina Bus Standard');
    const verb = modeVerbs[currentMode] || 'Stai prendendo il Mezzo';
    const ticketTxt = ticketAdvice[currentMode] || 'Biglietto di viaggio';
    const icon = modeIcons[currentMode] || 'fa-bus';

    banner.innerHTML = `
      <div class="route-banner-header">
        <div class="route-banner-tag" style="background:${bannerColor}">
          <i class="fa-solid ${icon}"></i>
          <strong>${lineCode}</strong>
        </div>
        <div class="route-banner-info">
          <h4>${lineName} &bull; <small style="color:${bannerColor}; font-weight:800;">${verb.toUpperCase()}</small></h4>
          <p><i class="fa-solid fa-flag-checkered"></i> Per <strong>${destName}</strong> &bull; Orario: <strong>${schedTime}</strong> &bull; <i class="fa-solid fa-signs-post"></i> <strong>${platform}</strong></p>
          <small style="color:var(--text-muted, #64748b); display:block; margin-top:2px;"><i class="fa-solid fa-ticket text-success"></i> <strong>Biglietto:</strong> ${ticketTxt}</small>
        </div>
        <button class="btn-close-route-banner" onclick="window.transitMap.clearHighlightedRoute()" title="Chiudi dettaglio percorso">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="route-banner-stops-flow">
        <span class="stops-flow-count"><i class="fa-solid fa-list-check"></i> ${stops.length} fermate sul percorso:</span>
        <div class="stops-flow-pills">
          ${stops.map((s, i) => `<span class="flow-pill ${i === 0 ? 'flow-start' : (i === stops.length - 1 ? 'flow-end' : '')}">${i + 1}. ${s.name.split(' - ')[0]}</span>`).join('<i class="fa-solid fa-arrow-right flow-arrow"></i>')}
        </div>
      </div>
    `;

    banner.classList.add("active");
  }

  drawWalkingRoute(fromStopId, toStopId) {
    if (!this.map) return;
    if (!this.walkingRouteLayer) {
      this.walkingRouteLayer = L.featureGroup().addTo(this.map);
    }
    this.walkingRouteLayer.clearLayers();

    const fromStop = typeof getStopById === 'function' ? getStopById(fromStopId) : null;
    const toStop = typeof getStopById === 'function' ? getStopById(toStopId) : null;
    if (!fromStop || !toStop) return;

    const latlngs = [
      [fromStop.lat_actual || fromStop.lat, fromStop.lng_actual || fromStop.lng],
      [toStop.lat_actual || toStop.lat, toStop.lng_actual || toStop.lng]
    ];

    // Tracciato pedonale arancione fluorescente
    const walkLine = L.polyline(latlngs, {
      color: '#ea580c',
      weight: 6,
      dashArray: '8, 8',
      opacity: 0.95,
      className: 'walking-route-polyline'
    });

    const dist = typeof calculateDistanceMeters === 'function' ? calculateDistanceMeters(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng) : 250;
    const walkMin = Math.max(1, Math.round(dist / 80));

    walkLine.bindTooltip(`
      <div class="walk-tooltip-box">
        <strong><i class="fa-solid fa-person-walking"></i> Percorso Pedonale di Raccordo</strong>
        <div>${dist}m &bull; ${walkMin} min a piedi</div>
        <small>Dalla fermata provvisoria alla fermata ufficiale attiva</small>
      </div>
    `, { permanent: true, direction: 'center', className: 'custom-walk-tooltip' });

    this.walkingRouteLayer.addLayer(walkLine);

    // Marker punto di arrivo con effetto visivo
    const targetMarker = L.marker(latlngs[1], {
      icon: L.divIcon({
        html: `<div class="target-alt-marker-pulse"><i class="fa-solid fa-flag-checkered"></i></div>`,
        className: 'target-marker-wrapper',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })
    });
    this.walkingRouteLayer.addLayer(targetMarker);

    this.map.invalidateSize();
    this.map.fitBounds(walkLine.getBounds(), { padding: [80, 80], maxZoom: 16 });
  }

  clearWalkingRoute() {
    if (this.walkingRouteLayer) {
      this.walkingRouteLayer.clearLayers();
    }
  }

  clearHighlightedRoute() {
    if (this.highlightedRouteLayer) {
      this.highlightedRouteLayer.clearLayers();
    }
    if (this.walkingRouteLayer) {
      this.walkingRouteLayer.clearLayers();
    }
    const banner = document.getElementById("activeRouteFloatingBanner");
    if (banner) {
      banner.classList.remove("active");
    }
  }

  /* Modalità Percorso Isolato: pulisce completamente la mappa da tutte le linee,
     fermate e bus di sfondo, per mantenere UNICAMENTE il percorso tracciato attivo */
  isolateRouteView(isolate = true) {
    this.isRouteIsolated = !!isolate;
    if (this.isRouteIsolated) {
      if (this.stopMarkersLayer) this.stopMarkersLayer.clearLayers();
      if (this.routeLinesLayer) this.routeLinesLayer.clearLayers();
      if (this.liveBusesLayer) this.liveBusesLayer.clearLayers();
      if (this.highlightedRouteLayer) this.highlightedRouteLayer.clearLayers();
      if (this.walkingRouteLayer) this.walkingRouteLayer.clearLayers();
      if (this.animationTimer) {
        clearInterval(this.animationTimer);
        this.animationTimer = null;
      }
      const quickBtns = document.getElementById("mapQuickButtonsContainer");
      if (quickBtns) quickBtns.style.opacity = "0.45";
    } else {
      const quickBtns = document.getElementById("mapQuickButtonsContainer");
      if (quickBtns) quickBtns.style.opacity = "1";
      this.drawRoutePolylines();
      this.placeStopMarkers();
      this.spawnLiveBuses();
    }
  }
}

// Inizializza globalmente in modo sicuro
function initTransitMapEngine() {
  if (!window.transitMap) {
    window.transitMap = new TransitMapEngine();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTransitMapEngine);
} else {
  initTransitMapEngine();
}
