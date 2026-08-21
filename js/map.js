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
      try {
        const regionId = e.detail?.regionId || (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
        const region = getRegionById(regionId);
        if (region && this.map) {
          this.map.flyTo(region.mapCenter, region.mapZoom, { duration: 1.5 });
        }
        this.drawRoutePolylines();
        this.placeStopMarkers();
        this.spawnLiveBuses();
        this.bindMapControls();
      } catch (err) {
        console.warn("Leaflet Map region change error:", err);
      }
    });

    document.addEventListener('transportModeChanged', (e) => {
      try {
        this.drawRoutePolylines();
        this.placeStopMarkers();
        this.spawnLiveBuses();
      } catch (err) {
        console.warn("Leaflet Map mode change error:", err);
      }
    });
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
    this.routeLinesLayer.clearLayers();

    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    getLinesByRegion(currentRegion).forEach(line => {
      // Ottieni le coordinate delle fermate della linea in ordine
      const latlngs = [];
      line.stopsIds.forEach(stopId => {
        const stop = getStopById(stopId);
        if (stop) {
          const lat = stop.lat_actual || stop.lat;
          const lng = stop.lng_actual || stop.lng;
          latlngs.push([lat, lng]);
        }
      });

      if (latlngs.length >= 2) {
        // Disegna la linea del percorso
        const polyline = L.polyline(latlngs, {
          color: line.color,
          weight: 5,
          opacity: 0.85,
          lineJoin: 'round',
          dashArray: line.type === 'suburban' ? '6, 8' : null
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
    this.stopMarkersLayer.clearLayers();

    const modeData = typeof getActiveMode === "function" ? getActiveMode() : { id: "pullman", icon: "fa-bus" };
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");

    getStopsByRegion(currentRegion).forEach(stop => {
      const isUrban = stop.category === "urban";
      const isTemp = !!stop.isTemporary;
      const isTempActive = isTemp && stop.temporaryStatus === 'active';
      const isTempInactive = isTemp && stop.temporaryStatus !== 'active';
      const lat = stop.lat_actual || stop.lat;
      const lng = stop.lng_actual || stop.lng;

      // Icona e colore personalizzati per fermate normali o provvisorie arancioni
      let iconClass = modeData.id === 'train' ? 'fa-train' : (modeData.id === 'tram' ? 'fa-train-tram' : (modeData.id === 'taxi' ? 'fa-taxi' : (stop.isMainHub ? 'fa-building-columns' : 'fa-location-dot')));
      let markerClass = `custom-stop-marker ${isUrban ? 'marker-urban' : 'marker-regional'}`;

      if (isTemp) {
        if (isTempActive) {
          markerClass = 'custom-stop-marker marker-temporary-active';
          iconClass = 'fa-triangle-exclamation';
        } else {
          markerClass = 'custom-stop-marker marker-temporary-inactive';
          iconClass = 'fa-person-digging';
        }
      }

      const iconHtml = `
        <div class="${markerClass}" title="${isTemp ? (isTempActive ? 'Fermata Provvisoria ATTIVA' : 'Fermata Provvisoria NON ATTIVA / Chiusa per Lavori') : stop.name}">
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

      // Linee servite
      const servingLines = TRANSIT_DATA.lines ? TRANSIT_DATA.lines.filter(l => l.stopsIds && l.stopsIds.includes(stop.id)) : [];

      // Dati fermata alternativa se provvisoria/non attiva
      const altData = isTemp ? (typeof window.getAlternativeActiveStop === 'function' ? window.getAlternativeActiveStop(stop.id) : null) : null;

      const popupContent = `
        <div class="map-popup-card ${isTemp ? 'popup-card-temporary' : ''}">
          <div class="map-popup-head">
            <div class="popup-top-badges">
              <span class="popup-badge">${stop.area}</span>
              ${isTemp ? (isTempActive ? 
                '<span class="popup-badge-temp-active"><i class="fa-solid fa-triangle-exclamation"></i> Provvisoria ATTIVA</span>' : 
                '<span class="popup-badge-temp-inactive"><i class="fa-solid fa-ban"></i> Chiusa per Lavori</span>'
              ) : ''}
              <span class="popup-code-badge" title="Codice Palina Google Transit"><i class="fa-solid fa-barcode"></i> ${stop.stopCode || 'Palina Transit'}</span>
            </div>
            <h4 style="${isTempInactive ? 'text-decoration: line-through; opacity: 0.85;' : ''}">${stop.name}</h4>
            <p class="popup-addr"><i class="fa-solid fa-map-pin"></i> ${stop.address}</p>
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
              <div class="reroute-card-actions">
                <button type="button" class="btn btn-xs btn-warning-pedestrian" onclick="window.transitMap.drawWalkingRoute('${stop.id}', '${altData.alternativeStop.id}')">
                  <i class="fa-solid fa-shoe-prints"></i> Traccia a Piedi su Mappa
                </button>
                <a href="https://www.google.com/maps/dir/?api=1&origin=${stop.lat},${stop.lng}&destination=${altData.alternativeStop.lat},${altData.alternativeStop.lng}&travelmode=walking" target="_blank" rel="noopener" class="btn-reroute-gmaps-link">
                  <i class="fa-brands fa-google"></i> Indicazioni Google Maps
                </a>
              </div>
            </div>
          ` : ''}
          
          <div class="map-popup-lines">
            <span class="lines-lbl">Linee e collegamenti in transito:</span>
            <div class="popup-badges-row">
              ${servingLines.length > 0 ? servingLines.map(l => `
                <span class="popup-line-pill" style="background:${l.color}20; color:${l.color}; border:1px solid ${l.color}">
                  ${l.code}
                </span>
              `).join('') : '<small style="color:var(--text-muted);">Servizio su gomma integrato</small>'}
            </div>
          </div>

          <div class="map-popup-gmaps-links">
            <a href="${stop.gmapsUrl}" target="_blank" rel="noopener" class="btn-popup-gmaps" title="Visualizza su Google Maps">
              <i class="fa-brands fa-google"></i> Google Maps
            </a>
            <a href="${stop.streetViewUrl}" target="_blank" rel="noopener" class="btn-popup-gmaps" title="Visualizza Street View a 360°">
              <i class="fa-solid fa-street-view"></i> Street View
            </a>
            <a href="${stop.gmapsDirUrl}" target="_blank" rel="noopener" class="btn-popup-gmaps" title="Calcola percorso con i mezzi">
              <i class="fa-solid fa-diamond-turn-right"></i> Indicazioni
            </a>
          </div>

          <div class="map-popup-features">
            ${stop.features ? stop.features.map(f => `<span class="feat-pill"><i class="fa-solid fa-check"></i> ${f}</span>`).join('') : ''}
          </div>

          <div class="map-popup-actions">
            <button class="btn btn-xs btn-primary w-100" onclick="window.liveBoard.filterHubSelect.value='${isTempInactive && altData && altData.alternativeStop ? altData.alternativeStop.id : stop.id}'; window.liveBoard.filterHubSelect.dispatchEvent(new Event('change')); window.app.switchTab('live-board');">
              <i class="fa-solid fa-clock"></i> Visualizza Partenze Live ${isTempInactive ? '(Fermata Ufficiale)' : ''}
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 350, className: 'transit-popup' });
      this.stopMarkersLayer.addLayer(marker);
    });
  }

  spawnLiveBuses() {
    this.activeBuses = [];
    this.liveBusesLayer.clearLayers();

    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const lines = getLinesByRegion(currentRegion);

    lines.forEach((line, idx) => {
      const stops = line.stopsIds.map(sId => getStopById(sId)).filter(Boolean);
      if (stops.length < 2) return;

      const busState = {
        id: `BUS_${line.id}_${idx}`,
        line: line,
        stops: stops,
        currentSegmentIdx: 0,
        progress: Math.random(), 
        speedKmh: Math.floor(Math.random() * 25) + 30, 
        marker: null
      };

      const startLat = stops[0].lat_actual || stops[0].lat;
      const startLng = stops[0].lng_actual || stops[0].lng;

      const busIconHtml = `
        <div class="custom-bus-marker" style="background-color: ${line.color}; box-shadow: 0 0 12px ${line.color}80;">
          <i class="fa-solid fa-bus"></i>
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
    this.animationTimer = setInterval(() => this.animateBusesStep(), 2000);
  }

  animateBusesStep() {
    this.activeBuses.forEach(bus => {
      bus.progress += 0.08;

      if (bus.progress >= 1.0) {
        bus.progress = 0;
        bus.currentSegmentIdx = (bus.currentSegmentIdx + 1) % (bus.stops.length - 1);
      }

      const fromStop = bus.stops[bus.currentSegmentIdx];
      const toStop = bus.stops[bus.currentSegmentIdx + 1];

      const fromLat = fromStop.lat_actual || fromStop.lat;
      const fromLng = fromStop.lng_actual || fromStop.lng;
      const toLat = toStop.lat_actual || toStop.lat;
      const toLng = toStop.lng_actual || toStop.lng;

      const curLat = fromLat + (toLat - fromLat) * bus.progress;
      const curLng = fromLng + (toLng - fromLng) * bus.progress;

      bus.marker.setLatLng([curLat, curLng]);
      this.updateBusTooltip(bus);
    });
  }

  updateBusTooltip(bus) {
    const nextStop = bus.stops[bus.currentSegmentIdx + 1] || bus.stops[0];
    const speed = bus.speedKmh + Math.floor(Math.random() * 5) - 2;

    bus.marker.bindTooltip(`
      <div class="bus-live-tooltip">
        <strong style="color: ${bus.line.color}">${bus.line.code}: ${bus.line.name}</strong><br>
        <span class="text-muted"><i class="fa-solid fa-gauge-high"></i> Velocità: ${speed} km/h</span><br>
        <span><i class="fa-solid fa-arrow-right"></i> Prossima: <strong>${nextStop.name.split(' - ')[0]}</strong></span>
      </div>
    `, {
      direction: 'top',
      offset: [0, -18],
      className: 'live-bus-map-tooltip'
    });
  }

  bindMapControls() {
    const container = document.getElementById("mapQuickButtonsContainer");
    if (!container) return;
    const currentRegion = (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
    const hubStops = getStopsByRegion(currentRegion).filter(s => s.isMainHub);
    
    // Clear existing buttons (keep the label span)
    const label = container.querySelector('span');
    container.innerHTML = '';
    if (label) container.appendChild(label);

    // Add GPS My Location Button first
    const gpsBtn = document.createElement('button');
    gpsBtn.className = 'map-btn-pill btn-pill-gps-active';
    gpsBtn.innerHTML = `<i class="fa-solid fa-location-crosshairs text-primary"></i> La Mia Posizione GPS`;
    gpsBtn.addEventListener('click', () => {
      if (window.geoLocator) {
        window.geoLocator.locateAndRoute();
      } else {
        this.locateUser();
      }
    });
    container.appendChild(gpsBtn);
    
    hubStops.slice(0, 4).forEach(stop => {
      const btn = document.createElement('button');
      btn.className = 'map-btn-pill';
      btn.textContent = `📍 ${stop.name.split(' - ')[0]}`;
      btn.addEventListener('click', () => {
        this.map.flyTo([stop.lat, stop.lng], 14, { duration: 1.5 });
      });
      container.appendChild(btn);
    });
    
    // Add region overview button
    const regionBtn = document.createElement('button');
    regionBtn.className = 'map-btn-pill';
    regionBtn.textContent = `🌍 Vista ${getRegionById(currentRegion)?.name || 'Regione'}`;
    regionBtn.addEventListener('click', () => {
      const r = getRegionById(currentRegion);
      if (r) this.map.flyTo(r.mapCenter, r.mapZoom, { duration: 1.8 });
    });
    container.appendChild(regionBtn);
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
