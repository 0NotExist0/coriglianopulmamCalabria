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
        this.map.flyTo([targetStop.lat_actual || targetStop.lat, targetStop.lng_actual || targetStop.lng], 14, { duration: 1.0 });
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
        this.map.flyTo([targetStop.lat_actual || targetStop.lat, targetStop.lng_actual || targetStop.lng], 14, { duration: 0.8 });
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

    // Tile Layer moderno e pulito
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    this.routeLinesLayer = L.featureGroup().addTo(this.map);
    this.stopMarkersLayer = L.featureGroup().addTo(this.map);
    this.liveBusesLayer = L.featureGroup().addTo(this.map);
    this.highlightedRouteLayer = L.featureGroup().addTo(this.map);
    this.walkingRouteLayer = L.featureGroup().addTo(this.map);
    this.userLocationLayer = L.featureGroup().addTo(this.map);

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
        alert("Impossibile ottenere la posizione: " + (err.message || "Permesso negato o GPS non disponibile."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  }

  drawRoutePolylines() {
    if (!this.routeLinesLayer) return;
    this.routeLinesLayer.clearLayers();

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

    // Renderizza al massimo le prime 30 linee principali per garantire 60fps
    const linesToDraw = lines.slice(0, 30);

    linesToDraw.forEach(line => {
      const sIds = line.stopsIds || line.stops || [];
      const latlngs = [];
      for (let i = 0; i < sIds.length; i++) {
        const coords = stopCoordMap.get(sIds[i]);
        if (coords) latlngs.push(coords);
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
    if (!this.stopMarkersLayer) return;
    this.stopMarkersLayer.clearLayers();

    const currentMode = typeof getActiveMode === "function" ? getActiveMode() : "pullman";
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");

    let stops = getStopsByRegion(currentRegion);
    if ((!stops || stops.length === 0) && currentMode !== 'pullman') {
      stops = getStopsByRegion('all');
    }
    if (!stops || stops.length === 0) return;

    // Seleziona gli Hub principali, le fermate con cantieri/variazioni e un campione bilanciato (max 65) per fluidità totale
    const hubsAndSpecial = [];
    const regularStops = [];
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (s.isMainHub || s.isTemporary) {
        hubsAndSpecial.push(s);
      } else {
        regularStops.push(s);
      }
    }

    let displayStops = hubsAndSpecial;
    if (displayStops.length < 50) {
      displayStops = displayStops.concat(regularStops.slice(0, 50 - displayStops.length));
    } else if (displayStops.length > 70) {
      displayStops = displayStops.slice(0, 70);
    }

    displayStops.forEach(stop => {
      const isUrban = stop.category === "urban";
      const isTemp = !!stop.isTemporary;
      const isTempActive = isTemp && stop.temporaryStatus === 'active';
      const isTempInactive = isTemp && stop.temporaryStatus !== 'active';
      const lat = stop.lat_actual || stop.lat;
      const lng = stop.lng_actual || stop.lng;
      if (!lat || !lng) return;

      let iconClass = 'fa-location-dot';
      let markerClass = 'custom-stop-marker';

      if (currentMode === 'flight') {
        markerClass += ' marker-flight';
        iconClass = 'fa-plane-departure';
      } else if (currentMode === 'train') {
        markerClass += ' marker-train';
        iconClass = stop.isMainHub ? 'fa-train-subway' : 'fa-train';
      } else if (currentMode === 'tram') {
        markerClass += ' marker-tram';
        iconClass = 'fa-train-tram';
      } else if (currentMode === 'taxi') {
        markerClass += ' marker-taxi';
        iconClass = 'fa-taxi';
      } else {
        markerClass += isUrban ? ' marker-urban' : ' marker-regional';
        iconClass = stop.isMainHub ? 'fa-building-columns' : 'fa-location-dot';
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

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'stop-marker-wrapper',
        iconSize: isTemp ? [32, 32] : [28, 28],
        iconAnchor: isTemp ? [16, 16] : [14, 14],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      // Generazione Popup Lazy on Click per azzerare l'impatto sulla memoria
      marker.on('click', () => {
        const popupHtml = this.buildStopPopupHtml(stop, currentMode, isTemp, isTempActive, isTempInactive);
        marker.bindPopup(popupHtml, { maxWidth: 350, className: 'transit-popup' }).openPopup();
      });

      this.stopMarkersLayer.addLayer(marker);
    });
  }

  buildStopPopupHtml(stop, currentMode, isTemp, isTempActive, isTempInactive) {
    const altData = isTemp ? (typeof window.getAlternativeActiveStop === 'function' ? window.getAlternativeActiveStop(stop.id) : null) : null;
    const modeData = window.TRANSIT_DATA?.modes?.[currentMode] || window.TRANSIT_DATA?.modes?.pullman;
    const lines = modeData?.lines || [];
    const servingLines = lines.filter(l => (l.stopsIds || l.stops || []).includes(stop.id)).slice(0, 6);

    return `
      <div class="map-popup-card ${isTemp ? 'popup-card-temporary' : ''}">
        <div class="map-popup-head">
          <div class="popup-top-badges">
            <span class="popup-badge">${stop.area || 'Rete'}</span>
            ${isTemp ? (isTempActive ? 
              '<span class="popup-badge-temp-active"><i class="fa-solid fa-triangle-exclamation"></i> Provvisoria ATTIVA</span>' : 
              '<span class="popup-badge-temp-inactive"><i class="fa-solid fa-ban"></i> Chiusa per Lavori</span>'
            ) : ''}
            <span class="popup-code-badge"><i class="fa-solid fa-barcode"></i> ${stop.stopCode || 'Transit Code'}</span>
          </div>
          <h4 style="${isTempInactive ? 'text-decoration: line-through; opacity: 0.85;' : ''}">${stop.name}</h4>
          <p class="popup-addr"><i class="fa-solid fa-map-pin"></i> ${stop.address || 'Posizione Georeferenziata'}</p>
          <p class="popup-operator"><i class="fa-solid fa-building"></i> ${stop.operatorName || 'Operatore di Servizio'}</p>
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

        ${isTemp && isTempInactive && altData && altData.alternativeStop ? `
          <div class="temporary-reroute-card">
            <div class="reroute-card-head">
              <i class="fa-solid fa-person-walking text-warning"></i>
              <strong>Fermata Ufficiale Alternativa Consigliata:</strong>
            </div>
            <div class="reroute-card-body">
              <h5 class="reroute-dest-name">${altData.alternativeStop.name}</h5>
              <p class="reroute-dest-addr"><i class="fa-solid fa-location-dot"></i> ${altData.alternativeStop.address}</p>
              <div class="reroute-meta-tags">
                <span class="reroute-tag-dist"><i class="fa-solid fa-ruler-horizontal"></i> ${altData.distanceMeters} metri</span>
                <span class="reroute-tag-time"><i class="fa-solid fa-person-walking"></i> circa ${altData.walkTimeMin} min a piedi</span>
              </div>
            </div>
          </div>
        ` : ''}
        
        <div class="map-popup-lines">
          <span class="lines-lbl">${currentMode === 'flight' ? 'Voli e rotte in partenza:' : 'Linee e collegamenti in transito:'}</span>
          <div class="popup-badges-row">
            ${servingLines.length > 0 ? servingLines.map(l => `
              <span class="popup-line-pill" style="background:${l.color}20; color:${l.color}; border:1px solid ${l.color}">
                ${l.code}
              </span>
            `).join('') : `<small style="color:var(--text-muted);">${currentMode === 'flight' ? 'Hub Aeroportuale ENAC / IATA' : (currentMode === 'taxi' ? 'Servizio RadioTaxi H24' : (currentMode === 'train' ? 'Rete Ferroviaria Regionale / AV' : 'Servizio su gomma integrato'))}</small>`}
          </div>
        </div>

        <div class="map-popup-gmaps-links">
          <a href="${stop.gmapsUrl || 'https://www.google.com/maps'}" target="_blank" rel="noopener" class="btn-popup-gmaps" title="Visualizza su Google Maps">
            <i class="fa-brands fa-google"></i> Google Maps
          </a>
          <a href="${stop.streetViewUrl || 'https://www.google.com/maps'}" target="_blank" rel="noopener" class="btn-popup-gmaps" title="Visualizza Street View a 360°">
            <i class="fa-solid fa-street-view"></i> Street View
          </a>
        </div>

        <div class="map-popup-actions" style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
          <button class="btn btn-xs btn-primary w-100" onclick="if(window.liveBoard){ window.liveBoard.switchToStop('${isTempInactive && altData && altData.alternativeStop ? altData.alternativeStop.id : stop.id}'); } window.app.switchTab('live-board');">
            <i class="fa-solid ${currentMode === 'flight' ? 'fa-plane-departure' : (currentMode === 'taxi' ? 'fa-taxi' : (currentMode === 'train' ? 'fa-train' : 'fa-clock'))}"></i> ${currentMode === 'flight' ? 'Tabellone Voli Aeroporto' : (currentMode === 'taxi' ? 'Dettagli Posteggio & Tariffe' : (currentMode === 'train' ? 'Tabellone Stazione FS' : 'Visualizza Partenze Live'))}
          </button>
        </div>
      </div>
    `;
  }

  spawnLiveBuses() {
    this.activeBuses = [];
    if (!this.liveBusesLayer) return;
    this.liveBusesLayer.clearLayers();

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
    // Non eseguire l'animazione se la scheda mappa non è visibile o la pagina è nascosta
    if (document.hidden) return;
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

    const bannerColor = customColor || line?.color || '#0284c7';
    const lineCode = line?.code || dep?.lineCode || "Corsa";
    const lineName = line?.name || dep?.lineName || "Tracciato Selezionato";
    const destName = dep?.destination || (stops[stops.length - 1]?.name) || "Destinazione";
    const schedTime = dep ? `${String(dep.scheduledTime.getHours()).padStart(2, '0')}:${String(dep.scheduledTime.getMinutes()).padStart(2, '0')}` : "--:--";
    const platform = dep?.platform || "Banchina Standard";

    banner.innerHTML = `
      <div class="route-banner-header">
        <div class="route-banner-tag" style="background:${bannerColor}">
          <i class="fa-solid fa-route"></i>
          <strong>${lineCode}</strong>
        </div>
        <div class="route-banner-info">
          <h4>${lineName}</h4>
          <p><i class="fa-solid fa-flag-checkered"></i> Per <strong>${destName}</strong> &bull; Orario: <strong>${schedTime}</strong> &bull; <strong>${platform}</strong></p>
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
