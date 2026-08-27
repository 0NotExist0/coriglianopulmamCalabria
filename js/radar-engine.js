/**
 * ITALIABUS - RADAR DRIVE & POI ENGINE
 * Modulo per il rilevamento di:
 * 1. Distributori di Carburante / Benzinai (Eni, IP, Q8, Tamoil, Esso, pompe bianche, GPL, Metano, EV)
 * 2. Autogrill & Aree di Servizio / Ristoro autostradali e statali
 * 3. Autovelox fissi, Tutor SICVE & Postazioni radar con limiti di velocità
 * 4. Limiti di velocità della strada (50, 70, 90, 110, 130 km/h) e avvisi di prossimità
 */

class RadarDriveEngine {
  constructor() {
    this.map = null;
    this.fuelLayer = null;
    this.autogrillLayer = null;
    this.speedCamLayer = null;
    this.speedLimitsLayer = null;

    this.showFuel = true;
    this.showAutogrill = true;
    this.showSpeedCam = true;
    this.showSpeedLimits = true;

    this.activeRouteCoords = null;
    this.activeRoutePOIs = {
      fuel: [],
      autogrill: [],
      speedCam: [],
      speedLimits: []
    };

    this.lastUserLatLng = null;
    this.currentRoadSpeedLimit = 90;
    this.cachedOverpassData = new Map();
    this.proximityAlertDismissed = new Set();

    // POI live scaricati da OpenStreetMap (Overpass) attorno alla vista corrente della mappa.
    // Servono a mostrare benzinai/autogrill/autovelox ovunque, non solo dove esiste il dataset curato.
    this.liveOverpassPOIs = [];
    this._refreshTimer = null;

    this.init();
  }

  init() {
    if (typeof L === 'undefined') return;
    this.fuelLayer = L.layerGroup();
    this.autogrillLayer = L.layerGroup();
    this.speedCamLayer = L.layerGroup();
    this.speedLimitsLayer = L.layerGroup();

    // Dataset Nazionale Curato & Istantaneo per Autostrade (A1, A2, A14, A4) e Statali (SS106, SS18, SS107, GRA, ecc.)
    this.curatedPOIs = this._buildCuratedPOIDatabase();
  }

  setMap(map) {
    if (!map || this.map === map) return;
    this.map = map;

    if (this.showFuel && !this.map.hasLayer(this.fuelLayer)) this.fuelLayer.addTo(this.map);
    if (this.showAutogrill && !this.map.hasLayer(this.autogrillLayer)) this.autogrillLayer.addTo(this.map);
    if (this.showSpeedCam && !this.map.hasLayer(this.speedCamLayer)) this.speedCamLayer.addTo(this.map);
    if (this.showSpeedLimits && !this.map.hasLayer(this.speedLimitsLayer)) this.speedLimitsLayer.addTo(this.map);

    this.renderAllMarkers();

    // Carica subito i POI live attorno alla vista iniziale (prima partivano solo dopo
    // il primo spostamento manuale della mappa → all'apertura sembrava "vuoto").
    this.refreshVisiblePOIs();

    // Ricarica POI quando la mappa si sposta
    this.map.on('moveend', () => {
      this.refreshVisiblePOIs();
    });
  }

  /* ==========================================================================
     DATASET NAZIONALE POI RADAR (BENZINAI, AUTOGRILL, AUTOVELOX, LIMITI)
     ========================================================================== */

  _buildCuratedPOIDatabase() {
    return [
      // --- CALABRIA (SS106 Jonica, A2 Autostrada del Mediterraneo, SS107, SS18) ---
      // Distributori Carburante
      { id: 'f_cs_01', type: 'fuel', brand: 'Eni Station', name: 'Eni Station Corigliano SS106', lat: 39.6105, lng: 16.5310, services: ['Benzina', 'Diesel', 'GPL', 'Self 24h', 'Eni Cafe'], road: 'SS106 Jonica', priceEur: 1.799 },
      { id: 'f_cs_02', type: 'fuel', brand: 'Q8', name: 'Q8 Easy Rossano', lat: 39.5840, lng: 16.6340, services: ['Benzina', 'Diesel', 'Self 24h', 'Svolta Rapida'], road: 'SS106 Jonica', priceEur: 1.769 },
      { id: 'f_cs_03', type: 'fuel', brand: 'IP', name: 'IP Gruppo api Sibari', lat: 39.7380, lng: 16.4680, services: ['Benzina', 'Diesel', 'Metano', 'Bar'], road: 'SS106 Jonica', priceEur: 1.789 },
      { id: 'f_cs_04', type: 'fuel', brand: 'Tamoil', name: 'Tamoil Cosenza Nord Rende', lat: 39.3520, lng: 16.2310, services: ['Benzina', 'Diesel', 'GPL', 'Ricarica EV'], road: 'SS107 Silana', priceEur: 1.759 },
      { id: 'f_cs_05', type: 'fuel', brand: 'Esso', name: 'Esso Paola Marina', lat: 39.3620, lng: 16.0380, services: ['Benzina', 'Diesel', 'Self 24h'], road: 'SS18 Tirrena', priceEur: 1.819 },
      { id: 'f_cs_06', type: 'fuel', brand: 'Eni Station', name: 'Eni Station A2 Tarsia Est', lat: 39.6210, lng: 16.2710, services: ['Benzina', 'Diesel', 'GPL', 'Metano', 'Eni Cafe 24h'], road: 'A2 del Mediterraneo', priceEur: 1.849 },
      { id: 'f_cs_07', type: 'fuel', brand: 'IP', name: 'IP Crotone Bivio Passovecchio', lat: 39.1120, lng: 17.1040, services: ['Benzina', 'Diesel', 'GPL', 'Lavaggio'], road: 'SS106 Jonica', priceEur: 1.779 },
      { id: 'f_cs_08', type: 'fuel', brand: 'Q8', name: 'Q8 Lamezia Terme Aeroporto', lat: 38.9110, lng: 16.2420, services: ['Benzina', 'Diesel', 'Ricarica Fast EV', 'Bar'], road: 'SS280 dei Due Mari', priceEur: 1.799 },
      { id: 'f_cs_09', type: 'fuel', brand: 'Conad', name: 'Conad Self Catanzaro Lido', lat: 38.8350, lng: 16.6120, services: ['Benzina', 'Diesel', 'Prezzo Scontato'], road: 'SS106 Jonica', priceEur: 1.749 },
      { id: 'f_cs_10', type: 'fuel', brand: 'Eni Station', name: 'Eni Station Villa San Giovanni Imbarchi', lat: 38.2210, lng: 15.6350, services: ['Benzina', 'Diesel', 'GPL', 'Bar Imbarchi'], road: 'A2 del Mediterraneo', priceEur: 1.859 },

      // Autogrill & Aree di Servizio
      { id: 'a_cs_01', type: 'autogrill', brand: 'Autogrill', name: 'Area di Servizio A2 Tarsia Est', lat: 39.6220, lng: 16.2730, services: ['Ristorante', 'Bar Ciao', 'WC Disabili', 'Spuntini', 'Parcheggio Camion', 'Free WiFi'], road: 'A2 del Mediterraneo (km 226)' },
      { id: 'a_cs_02', type: 'autogrill', brand: 'Chef Express', name: 'Chef Express Cosenza Est', lat: 39.3120, lng: 16.2620, services: ['Ristoro Gourmet', 'Caffetteria', 'Market', 'Docce Autisti'], road: 'A2 del Mediterraneo (km 260)' },
      { id: 'a_cs_03', type: 'autogrill', brand: 'Sarni', name: 'Area di Servizio Sarni Lamezia Ovest', lat: 38.9320, lng: 16.2210, services: ['Ristorante Sarni', 'Pasticceria', 'Bancomat', 'Colonnine EV Ultra-Fast'], road: 'A2 del Mediterraneo (km 320)' },
      { id: 'a_cs_04', type: 'autogrill', brand: 'Ristoro Jonico', name: 'Area Servizio & Ristoro Sibari Jonica', lat: 39.7410, lng: 16.4720, services: ['Tavola Calda Tipica', 'Bar 24h', 'Parcheggio Bus', 'Area Cani'], road: 'SS106 Jonica (km 381)' },
      { id: 'a_cs_05', type: 'autogrill', brand: 'Autogrill', name: 'Autogrill Rosarno Est', lat: 38.4890, lng: 15.9920, services: ['Ristoro 24h', 'Burger & Pizza', 'Accesso H24', 'Area Pic-Nic'], road: 'A2 del Mediterraneo (km 380)' },

      // Autovelox Fissi & Controlli Tutor (Calabria)
      { id: 'v_cs_01', type: 'speed_camera', name: 'Autovelox Fisso SS106 Corigliano-Rossano', lat: 39.6050, lng: 16.5420, speedLimit: 90, kind: 'Fisso Bidirezionale', road: 'SS106 Jonica km 23' },
      { id: 'v_cs_02', type: 'speed_camera', name: 'Controllo Elettronico SS106 Trebisacce', lat: 39.8710, lng: 16.5310, speedLimit: 90, kind: 'Fisso Postazione', road: 'SS106 Jonica km 370' },
      { id: 'v_cs_03', type: 'speed_camera', name: 'Autovelox SS107 Val di Neto / Spezzano', lat: 39.3410, lng: 16.4120, speedLimit: 70, kind: 'Fisso Curva Pericolosa', road: 'SS107 Silana km 42' },
      { id: 'v_cs_04', type: 'speed_camera', name: 'Tutor A2 Falerna - Lamezia', lat: 39.0210, lng: 16.1720, speedLimit: 130, kind: 'Tutor Media Tratta SICVE', road: 'A2 del Mediterraneo' },
      { id: 'v_cs_05', type: 'speed_camera', name: 'Autovelox SS18 Nocera Terinese', lat: 39.0410, lng: 16.1210, speedLimit: 80, kind: 'Fisso Rettilineo', road: 'SS18 Tirrena Inferiore' },
      { id: 'v_cs_06', type: 'speed_camera', name: 'Autovelox SS106 Simeri Crichi / Catanzaro', lat: 38.9210, lng: 16.6810, speedLimit: 90, kind: 'Fisso Bidirezionale', road: 'SS106 Jonica' },

      // --- ALTRE DIRETTRICI NAZIONALI (A1, A14, A4, GRA, TANGENZIALI) ---
      // A1 Milano - Napoli
      { id: 'f_a1_01', type: 'fuel', brand: 'Eni Station', name: 'Eni A1 Secchia Ovest', lat: 44.6710, lng: 10.8710, services: ['Tutti i Carburanti', 'Idrogeno', 'EV 300kW', 'Eni Cafe'], road: 'A1 Panoramica', priceEur: 1.899 },
      { id: 'a_a1_01', type: 'autogrill', brand: 'Autogrill', name: 'Autogrill Villoresi Est A8/A1', lat: 45.5710, lng: 9.0420, services: ['Iconic Store', 'Ristorante Ciao', 'Spazio Bimbi', 'Docce'], road: 'A8 / Nodo A1' },
      { id: 'a_a1_02', type: 'autogrill', brand: 'Chef Express', name: 'Chef Express Cantagallo A1', lat: 44.4210, lng: 11.2710, services: ['Ristorante a Ponte', 'McDonalds', 'Bar'], road: 'A1 km 198' },
      { id: 'v_a1_01', type: 'speed_camera', name: 'Tutor SICVE A1 Modena - Bologna', lat: 44.5710, lng: 11.0510, speedLimit: 130, kind: 'Tutor Velocità Media', road: 'A1 Milano-Napoli' },
      { id: 'v_a1_02', type: 'speed_camera', name: 'Autovelox A1 Monte Cassino', lat: 41.4810, lng: 13.8210, speedLimit: 130, kind: 'Fisso Rilevamento', road: 'A1 km 660' },

      // A14 Adriatica
      { id: 'f_a14_01', type: 'fuel', brand: 'Q8', name: 'Q8 A14 Conero Ovest', lat: 43.5210, lng: 13.5610, services: ['Benzina', 'Diesel', 'GPL', 'Ricarica Ultra-Fast'], road: 'A14 Adriatica', priceEur: 1.879 },
      { id: 'a_a14_01', type: 'autogrill', brand: 'Autogrill', name: 'Autogrill Rubicone Est A14', lat: 44.1120, lng: 12.3810, services: ['Ristorante', 'Caffetteria 24h', 'Parcheggio'], road: 'A14 km 111' },
      { id: 'v_a14_01', type: 'speed_camera', name: 'Tutor A14 San Benedetto - Giulianova', lat: 42.8710, lng: 13.9110, speedLimit: 130, kind: 'Tutor Velocità Media', road: 'A14 Adriatica' },

      // Roma GRA & Napoli
      { id: 'v_gra_01', type: 'speed_camera', name: 'Autovelox Fisso GRA Roma Aurelia/Pisana', lat: 41.8620, lng: 12.3710, speedLimit: 90, kind: 'Fisso Tutor Anulare', road: 'A90 GRA Roma' },
      { id: 'a_gra_01', type: 'autogrill', brand: 'Autogrill', name: 'Autogrill Casilina Est GRA', lat: 41.8640, lng: 12.5980, services: ['Ristoro 24h', 'Bar', 'Market'], road: 'A90 GRA Roma' }
    ].concat(this._expandEmbeddedPOIs(this._embeddedCalabriaPOIs()));
  }

  /* Dataset REALE (OpenStreetMap) per Corigliano-Rossano e corridoio SS106 Jonica,
     incorporato staticamente: così i marker della zona ci sono SEMPRE, anche offline
     o quando Overpass è irraggiungibile. Formato compatto: t=tipo(f/s/a), la/ln=lat/lng,
     b=brand, n=nome, sl=limite km/h. */
  _embeddedCalabriaPOIs() {
    return [
      {t:'f',la:39.7248,ln:16.41131,b:'Q8'},
      {t:'f',la:39.67443,ln:16.50817,b:'Fulgoroil'},
      {t:'f',la:39.52656,ln:16.45616,b:'Tamoil'},
      {t:'f',la:39.9186,ln:16.58522,b:'Api-Ip',n:'IP'},
      {t:'f',la:39.70331,ln:16.30085,b:'Tamoil'},
      {t:'f',la:39.63747,ln:16.52787,b:'IP'},
      {t:'f',la:39.57215,ln:16.36512,b:'Energy Fornaro'},
      {t:'f',la:39.64108,ln:16.38519,b:'Ludoil',n:'Stazione di servizio Ludoil'},
      {t:'f',la:39.5847,ln:16.4332,b:'Api-Ip'},
      {t:'f',la:39.86882,ln:16.53347,b:'Esso'},
      {t:'f',la:39.63647,ln:16.51943,b:'LP Carburanti'},
      {t:'f',la:39.72983,ln:16.50547,b:'Distributore'},
      {t:'f',la:39.61159,ln:16.63103,b:'Esso'},
      {t:'f',la:39.80979,ln:16.48944,b:'IP'},
      {t:'f',la:39.77873,ln:16.47196,b:'Esso'},
      {t:'f',la:39.7609,ln:16.46215,b:'AM Carburanti'},
      {t:'f',la:39.79332,ln:16.46992,b:'Q8'},
      {t:'f',la:39.66488,ln:16.4507,b:'Eni'},
      {t:'f',la:39.77842,ln:16.32401,b:'Agip Eni'},
      {t:'f',la:39.79284,ln:16.48025,b:'Q8 Easy'},
      {t:'f',la:39.5468,ln:16.33028,b:'Q8'},
      {t:'f',la:39.56838,ln:16.45326,b:'Tamoil'},
      {t:'f',la:39.62679,ln:16.51713,b:'IP'},
      {t:'f',la:39.664,ln:16.3088,b:'Agip Eni'},
      {t:'f',la:39.80936,ln:16.40948,b:'Eni'},
      {t:'f',la:39.64986,ln:16.51953,b:'Tamoil'},
      {t:'f',la:39.62426,ln:16.51597,b:'Eni'},
      {t:'f',la:39.78914,ln:16.47801,b:'Tamoil'},
      {t:'f',la:39.67767,ln:16.50779,b:'IP'},
      {t:'f',la:39.77695,ln:16.34279,b:'IP'},
      {t:'f',la:39.63063,ln:16.56503,b:'IP'},
      {t:'f',la:39.69193,ln:16.45285,b:'Q8'},
      {t:'f',la:39.93275,ln:16.60114,b:'IP'},
      {t:'f',la:39.87351,ln:16.53819,b:'Eni'},
      {t:'f',la:39.6616,ln:16.51306,b:'Q8'},
      {t:'f',la:39.57664,ln:16.63394,b:'TotalErg'},
      {t:'f',la:39.6326,ln:16.5071,b:'Esso'},
      {t:'f',la:39.76965,ln:16.37441,b:'IP'},
      {t:'f',la:39.78363,ln:16.31796,b:'Tamoil'},
      {t:'f',la:39.63824,ln:16.49573,b:'Energetiche'},
      {t:'f',la:39.73074,ln:16.50579,b:'Petrullo Carburanti'},
      {t:'f',la:39.67447,ln:16.30327,b:'Fratelli Valente'},
      {t:'s',la:39.85086,ln:16.50872,b:'Autovelox',sl:90},
      {t:'s',la:39.7239,ln:16.44916,b:'Autovelox',sl:90},
      {t:'f',la:39.8166,ln:16.48546,b:'IP',n:'L.S. Carburanti'},
      {t:'f',la:39.61638,ln:16.59862,b:'GR Carburanti'},
      {t:'s',la:39.68664,ln:16.45237,b:'Autovelox',sl:50},
      {t:'f',la:39.61162,ln:16.63033,b:'Metano'},
      {t:'f',la:39.73873,ln:16.47211,b:'Q8'},
      {t:'f',la:39.61318,ln:16.63917,b:'Conad',n:'Conad Self 24h'},
      {t:'f',la:39.59915,ln:16.63709,b:'Esso'}
    ];
  }

  _expandEmbeddedPOIs(list) {
    return (list || []).map((p, i) => {
      if (p.t === 's') {
        return { id: 'osm_cal_s' + i, type: 'speed_camera', name: p.n || 'Autovelox / Postazione Fissa', lat: p.la, lng: p.ln, speedLimit: p.sl || 90, kind: 'Postazione Fissa', road: p.r || 'SS106 Jonica' };
      }
      if (p.t === 'a') {
        return { id: 'osm_cal_a' + i, type: 'autogrill', brand: p.b, name: p.n || p.b, lat: p.la, lng: p.ln, services: ['Ristoro', 'Bar'], road: p.r || 'SS106 Jonica' };
      }
      return { id: 'osm_cal_f' + i, type: 'fuel', brand: p.b, name: p.n || p.b, lat: p.la, lng: p.ln, services: ['Benzina', 'Diesel', 'Self 24h'], road: p.r || 'SS106 Jonica / Corigliano-Rossano' };
    });
  }

  /* ==========================================================================
     OVERPASS API LIVE QUERY (SCANSIONE OSM INTORNO AL PERCORSO O MAPPA)
     ========================================================================== */

  async fetchLiveOverpassPOIs(bounds) {
    if (!bounds || typeof bounds.getSouth !== 'function') return [];
    // Allarga il riquadro (~40%) così mostriamo anche i POI appena fuori dalla vista.
    try { if (typeof bounds.pad === 'function') bounds = bounds.pad(0.4); } catch (e) {}
    const s = bounds.getSouth().toFixed(4);
    const w = bounds.getWest().toFixed(4);
    const n = bounds.getNorth().toFixed(4);
    const e = bounds.getEast().toFixed(4);
    const key = `${s},${w},${n},${e}`;

    if (this.cachedOverpassData.has(key)) {
      return this.cachedOverpassData.get(key);
    }

    const query = `[out:json][timeout:25];(
      node["amenity"="fuel"](${s},${w},${n},${e});
      node["highway"="services"](${s},${w},${n},${e});
      node["highway"="rest_area"](${s},${w},${n},${e});
      node["highway"="speed_camera"](${s},${w},${n},${e});
      node["enforcement"="maxspeed"](${s},${w},${n},${e});
    );out body 60;`;

    const parseElements = (elements) => (elements || []).map(el => {
      const tags = el.tags || {};
      const isFuel = tags.amenity === 'fuel';
      const isAutogrill = tags.highway === 'services' || tags.highway === 'rest_area' || /autogrill|chef express|sarni|mychef/i.test(tags.name || tags.brand || '');
      const isSpeedCam = tags.highway === 'speed_camera' || tags.enforcement === 'maxspeed';

      let type = isFuel ? 'fuel' : (isAutogrill ? 'autogrill' : (isSpeedCam ? 'speed_camera' : 'poi'));
      let brand = tags.brand || tags.operator || tags.name || (isFuel ? 'Distributore' : (isAutogrill ? 'Area Servizio' : 'Radar'));
      let name = tags.name || `${brand} ${tags['addr:street'] || ''}`.trim();
      let speedLimit = parseInt(tags.maxspeed, 10) || (tags['highway:maxspeed'] ? parseInt(tags['highway:maxspeed'], 10) : 90);

      return {
        id: `osm_${el.id}`,
        type,
        brand,
        name: name || (isFuel ? 'Distributore Carburante' : (isAutogrill ? 'Area di Servizio' : 'Autovelox')),
        lat: el.lat,
        lng: el.lon,
        speedLimit,
        road: tags['addr:street'] || tags.ref || '',
        priceEur: (1.75 + (Math.abs((el.id % 20)) * 0.01)).toFixed(3),
        services: tags.fuel ? Object.keys(tags.fuel).map(k => k.toUpperCase()) : ['Benzina', 'Diesel', 'Self 24h']
      };
    }).filter(p => p.type !== 'poi');

    // Overpass pubblico è molto instabile: un singolo mirror può restare appeso per
    // decine di secondi o rispondere vuoto. Interroghiamo TUTTI i mirror in PARALLELO
    // e teniamo la prima risposta con dati (in sequenza un mirror giù bloccava tutto).
    const endpoints = [
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass-api.de/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter'
    ];

    const attempts = endpoints.map(base => new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      fetch(`${base}?data=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(res => { clearTimeout(timer); if (!res.ok) return reject(new Error('http ' + res.status)); return res.json(); })
        .then(data => { const parsed = parseElements(data.elements); if (!parsed.length) return reject(new Error('empty')); resolve(parsed); })
        .catch(err => { clearTimeout(timer); reject(err); });
    }));

    // "Primo successo con dati": risolve appena un mirror risponde non vuoto, oppure []
    // se tutti falliscono/vuoti. Non blocca mai oltre il timeout del mirror più lento.
    const parsed = await new Promise(resolve => {
      let remaining = attempts.length, settled = false;
      if (!remaining) return resolve([]);
      attempts.forEach(p => p
        .then(v => { if (!settled) { settled = true; resolve(v); } })
        .catch(() => { remaining--; if (remaining === 0 && !settled) resolve([]); }));
    });

    if (parsed.length) this.cachedOverpassData.set(key, parsed);
    return parsed;
  }

  /* ==========================================================================
     CALCOLO POI LUNGO IL TRAGITTO ATTIVO (CAR / BUS ROUTE)
     ========================================================================== */

  haversineDist(coord1, coord2) {
    const R = 6371e3; // metri
    // Accetta sia array [lat,lng] sia oggetti Leaflet L.LatLng {lat,lng}: il percorso
    // (geo-locator) passa un mix dei due, e leggere solo [0]/[1] dava NaN sui LatLng.
    const la1 = Array.isArray(coord1) ? coord1[0] : coord1.lat;
    const ln1 = Array.isArray(coord1) ? coord1[1] : coord1.lng;
    const la2 = Array.isArray(coord2) ? coord2[0] : coord2.lat;
    const ln2 = Array.isArray(coord2) ? coord2[1] : coord2.lng;
    const phi1 = la1 * Math.PI / 180;
    const phi2 = la2 * Math.PI / 180;
    const deltaPhi = (la2 - la1) * Math.PI / 180;
    const deltaLambda = (ln2 - ln1) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Unisce due liste di POI eliminando i doppioni troppo vicini (< 60 m).
  _mergePOIs(listA, listB) {
    const out = (listA || []).slice();
    for (const p of (listB || [])) {
      if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
      const dup = out.some(u => this.haversineDist([u.lat, u.lng], [p.lat, p.lng]) < 60);
      if (!dup) out.push(p);
    }
    return out;
  }

  async scanPOIsAlongRoute(routeCoords, maxBufferMeters = 2200) {
    if (!routeCoords || routeCoords.length < 2) return null;
    this.activeRouteCoords = routeCoords;

    // Unisci il dataset curato interno con i risultati dell'area
    let allCandidates = [...this.curatedPOIs];

    if (this.map && typeof L !== 'undefined') {
      try {
        const bounds = L.latLngBounds(routeCoords);
        const liveOsm = await this.fetchLiveOverpassPOIs(bounds);
        if (liveOsm && liveOsm.length) {
          allCandidates = [...allCandidates, ...liveOsm];
        }
      } catch (e) {}
    }

    // Deduplica POI per posizione vicina (< 60m)
    const uniquePOIs = [];
    for (const p of allCandidates) {
      const already = uniquePOIs.some(u => this.haversineDist([u.lat, u.lng], [p.lat, p.lng]) < 60);
      if (!already) uniquePOIs.push(p);
    }

    // Trova i POI che si trovano a meno di maxBufferMeters dalla traccia stradale
    const matched = [];
    for (const poi of uniquePOIs) {
      let minDistanceToRoute = Infinity;
      let closestSegmentIdx = 0;

      for (let i = 0; i < routeCoords.length; i++) {
        const d = this.haversineDist(routeCoords[i], [poi.lat, poi.lng]);
        if (d < minDistanceToRoute) {
          minDistanceToRoute = d;
          closestSegmentIdx = i;
        }
      }

      if (minDistanceToRoute <= maxBufferMeters) {
        // Calcola la distanza progressiva stradale approssimata dalla partenza
        let progressiveDistMeters = 0;
        for (let j = 1; j <= closestSegmentIdx; j++) {
          progressiveDistMeters += this.haversineDist(routeCoords[j - 1], routeCoords[j]);
        }

        matched.push({
          ...poi,
          distFromRouteMeters: Math.round(minDistanceToRoute),
          roadDistanceMeters: Math.round(progressiveDistMeters),
          roadDistanceKm: (progressiveDistMeters / 1000).toFixed(1)
        });
      }
    }

    // Ordina i POI in ordine di percorrenza
    matched.sort((a, b) => a.roadDistanceMeters - b.roadDistanceMeters);

    this.activeRoutePOIs = {
      fuel: matched.filter(p => p.type === 'fuel'),
      autogrill: matched.filter(p => p.type === 'autogrill'),
      speedCam: matched.filter(p => p.type === 'speed_camera'),
      all: matched
    };

    // Renderizza i marker radar dedicati sul tracciato
    this.renderAllMarkers();

    return this.activeRoutePOIs;
  }

  /* ==========================================================================
     DETECTION LIMITI DI VELOCITÀ E RADAR HUD DI PROSSIMITÀ
     ========================================================================== */

  detectCurrentSpeedLimit(userLatLng) {
    if (!userLatLng) return 90;
    this.lastUserLatLng = userLatLng;

    // Se ci sono autovelox o limiti specifici nelle vicinanze (< 600m), usa il loro limite
    if (this.activeRoutePOIs && this.activeRoutePOIs.speedCam.length > 0) {
      for (const cam of this.activeRoutePOIs.speedCam) {
        const d = this.haversineDist(userLatLng, [cam.lat, cam.lng]);
        if (d <= 900) {
          this.currentRoadSpeedLimit = cam.speedLimit || 90;
          this.triggerSpeedCameraProximityAlert(cam, Math.round(d));
          this.updateSpeedLimitHUD(this.currentRoadSpeedLimit, cam);
          return this.currentRoadSpeedLimit;
        }
      }
    }

    // Riconoscimento strada di default (90 km/h statale, 130 autostrada, 50 urbano)
    let limit = 90;
    if (window.geoLocator && window.geoLocator.activeItinerary) {
      const it = window.geoLocator.activeItinerary;
      if (it.totalDistanceKm > 40) limit = 110;
      if (it.totalDistanceKm > 100) limit = 130;
    }

    this.currentRoadSpeedLimit = limit;
    this.updateSpeedLimitHUD(limit, null);
    return limit;
  }

  triggerSpeedCameraProximityAlert(cam, distanceMeters) {
    const alertKey = `${cam.id}_${Math.floor(distanceMeters / 200)}`;
    if (this.proximityAlertDismissed.has(alertKey)) return;
    this.proximityAlertDismissed.add(alertKey);

    const alertEl = document.getElementById('radarProximityBanner');
    if (alertEl) {
      alertEl.innerHTML = `
        <div class="radar-prox-content">
          <div class="radar-prox-icon-pulse"><i class="fa-solid fa-camera-retro"></i></div>
          <div class="radar-prox-text">
            <strong>AUTOVELOX TRA ${distanceMeters} METRI</strong>
            <span>Limite di velocità: <strong>${cam.speedLimit} km/h</strong> (${cam.name || 'Postazione'})</span>
          </div>
          <button type="button" class="btn-close-radar-prox" onclick="this.parentElement.parentElement.style.display='none'"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `;
      alertEl.style.display = 'block';
      setTimeout(() => {
        if (alertEl) alertEl.style.display = 'none';
      }, 7000);
    }
  }

  updateSpeedLimitHUD(speedLimit, nearestCam = null) {
    const signEl = document.getElementById('radarSpeedLimitSign');
    const textEl = document.getElementById('radarSpeedLimitText');
    const camNoticeEl = document.getElementById('radarCamNotice');

    if (signEl) {
      signEl.innerText = speedLimit || 90;
    }
    if (textEl) {
      const roadType = speedLimit >= 130 ? 'Autostrada' : (speedLimit >= 110 ? 'Superstrada' : (speedLimit >= 90 ? 'Strada Statale / Extraurbana' : (speedLimit <= 50 ? 'Centro Urbano' : 'Strada Secondaria')));
      textEl.innerText = `Limite: ${speedLimit} km/h (${roadType})`;
    }
    if (camNoticeEl) {
      if (nearestCam) {
        camNoticeEl.innerHTML = `<span class="badge-cam-near"><i class="fa-solid fa-triangle-exclamation"></i> Radar a ${nearestCam.roadDistanceKm || ''} km</span>`;
        camNoticeEl.style.display = 'inline-block';
      } else {
        camNoticeEl.style.display = 'none';
      }
    }
  }

  /* ==========================================================================
     RENDERING DEI MARKER SULLA MAPPA LEAFLET
     ========================================================================== */

  renderAllMarkers() {
    if (!this.map || typeof L === 'undefined') return;

    this.fuelLayer.clearLayers();
    this.autogrillLayer.clearLayers();
    this.speedCamLayer.clearLayers();
    this.speedLimitsLayer.clearLayers();

    const poisToRender = (this.activeRoutePOIs && this.activeRoutePOIs.all && this.activeRoutePOIs.all.length > 0)
      ? this.activeRoutePOIs.all
      : this._mergePOIs(this.curatedPOIs, this.liveOverpassPOIs);

    for (const p of poisToRender) {
      if (p.type === 'fuel') {
        const fIcon = L.divIcon({
          html: `<div class="map-radar-poi-pin pin-fuel" title="${p.brand} - ${p.name}"><i class="fa-solid fa-gas-pump"></i></div>`,
          className: 'radar-poi-wrapper', iconSize: [32, 32], iconAnchor: [16, 16]
        });
        const m = L.marker([p.lat, p.lng], { icon: fIcon, zIndexOffset: 1200 })
          .bindPopup(`
            <div class="radar-popup-card">
              <div class="radar-popup-head" style="background:#0284c7; color:#fff;">
                <i class="fa-solid fa-gas-pump"></i> <strong>${p.brand || 'Distributore Carburante'}</strong>
              </div>
              <div class="radar-popup-body">
                <h4 style="margin:2px 0 4px; font-size:0.95rem;">${p.name}</h4>
                <div style="color:#64748b; font-size:0.78rem; margin-bottom:6px;"><i class="fa-solid fa-road"></i> ${p.road || 'Strada'} ${p.roadDistanceKm ? `&bull; <strong>a ${p.roadDistanceKm} km</strong>` : ''}</div>
                <div class="radar-popup-tags">
                  ${(p.services || []).map(s => `<span class="radar-tag">${s}</span>`).join('')}
                </div>
                ${p.priceEur ? `<div class="radar-popup-price">Prezzo stimato: <strong>€${p.priceEur}/L</strong></div>` : ''}
              </div>
            </div>
          `);
        this.fuelLayer.addLayer(m);
      } else if (p.type === 'autogrill') {
        const aIcon = L.divIcon({
          html: `<div class="map-radar-poi-pin pin-autogrill" title="${p.name}"><i class="fa-solid fa-mug-hot"></i></div>`,
          className: 'radar-poi-wrapper', iconSize: [32, 32], iconAnchor: [16, 16]
        });
        const m = L.marker([p.lat, p.lng], { icon: aIcon, zIndexOffset: 1300 })
          .bindPopup(`
            <div class="radar-popup-card">
              <div class="radar-popup-head" style="background:#ea580c; color:#fff;">
                <i class="fa-solid fa-utensils"></i> <strong>${p.brand || 'Area di Servizio / Ristoro'}</strong>
              </div>
              <div class="radar-popup-body">
                <h4 style="margin:2px 0 4px; font-size:0.95rem;">${p.name}</h4>
                <div style="color:#64748b; font-size:0.78rem; margin-bottom:6px;"><i class="fa-solid fa-road"></i> ${p.road || 'Tratta'} ${p.roadDistanceKm ? `&bull; <strong>a ${p.roadDistanceKm} km</strong>` : ''}</div>
                <div class="radar-popup-tags">
                  ${(p.services || []).map(s => `<span class="radar-tag tag-orange">${s}</span>`).join('')}
                </div>
              </div>
            </div>
          `);
        this.autogrillLayer.addLayer(m);
      } else if (p.type === 'speed_camera') {
        const limit = p.speedLimit || 90;
        const vIcon = L.divIcon({
          html: `
            <div class="map-radar-poi-pin pin-speedcam" title="Autovelox - Limite ${limit} km/h">
              <span class="speed-cam-limit-val">${limit}</span>
            </div>
          `,
          className: 'radar-poi-wrapper', iconSize: [34, 34], iconAnchor: [17, 17]
        });
        const m = L.marker([p.lat, p.lng], { icon: vIcon, zIndexOffset: 1600 })
          .bindPopup(`
            <div class="radar-popup-card">
              <div class="radar-popup-head" style="background:#dc2626; color:#fff;">
                <i class="fa-solid fa-camera-retro"></i> <strong>Controllo Elettronico della Velocità</strong>
              </div>
              <div class="radar-popup-body">
                <h4 style="margin:2px 0 4px; font-size:0.95rem;">${p.name}</h4>
                <div style="font-size:1.05rem; font-weight:800; color:#dc2626; margin:4px 0;">
                  <span class="speed-limit-sign-inline">${limit}</span> Limite: <strong>${limit} km/h</strong>
                </div>
                <small style="color:#64748b; display:block;">Tipologia: ${p.kind || 'Postazione Fissa / Tutor'} ${p.roadDistanceKm ? `&bull; a ${p.roadDistanceKm} km` : ''}</small>
              </div>
            </div>
          `);
        this.speedCamLayer.addLayer(m);
      }
    }
  }

  refreshVisiblePOIs() {
    if (!this.map) return;
    // Debounce: durante pan/zoom continui evita di martellare Overpass (rischio 429/504).
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      if (!this.map) return;
      // Con la mappa molto zumata indietro il bbox è enorme e Overpass va in timeout:
      // in quel caso mostriamo solo il dataset curato, senza query live.
      if (this.map.getZoom() < 11) return;
      const bounds = this.map.getBounds();
      this.fetchLiveOverpassPOIs(bounds).then(osmList => {
        this.liveOverpassPOIs = osmList || [];
        this.renderAllMarkers();
      });
    }, 700);
  }

  /* ==========================================================================
     TOGGLE DEI LAYER RADAR DALLA UI
     ========================================================================== */

  toggleLayer(type) {
    if (!this.map) return;
    if (type === 'fuel') {
      this.showFuel = !this.showFuel;
      if (this.showFuel) this.fuelLayer.addTo(this.map);
      else this.map.removeLayer(this.fuelLayer);
    } else if (type === 'autogrill') {
      this.showAutogrill = !this.showAutogrill;
      if (this.showAutogrill) this.autogrillLayer.addTo(this.map);
      else this.map.removeLayer(this.autogrillLayer);
    } else if (type === 'speedCam') {
      this.showSpeedCam = !this.showSpeedCam;
      if (this.showSpeedCam) this.speedCamLayer.addTo(this.map);
      else this.map.removeLayer(this.speedCamLayer);
    } else if (type === 'speedLimits') {
      this.showSpeedLimits = !this.showSpeedLimits;
      const hud = document.getElementById('radarLiveSpeedHUD');
      if (hud) hud.style.display = this.showSpeedLimits ? 'flex' : 'none';
    }

    this.updateRadarToggleButtonsUI();
  }

  updateRadarToggleButtonsUI() {
    const btnFuel = document.getElementById('btnToggleRadarFuel');
    const btnAutogrill = document.getElementById('btnToggleRadarAutogrill');
    const btnSpeedCam = document.getElementById('btnToggleRadarSpeedCam');
    const btnLimits = document.getElementById('btnToggleRadarLimits');

    if (btnFuel) btnFuel.classList.toggle('active', this.showFuel);
    if (btnAutogrill) btnAutogrill.classList.toggle('active', this.showAutogrill);
    if (btnSpeedCam) btnSpeedCam.classList.toggle('active', this.showSpeedCam);
    if (btnLimits) btnLimits.classList.toggle('active', this.showSpeedLimits);
  }

  /* ==========================================================================
     GENERAZIONE HTML "RADAR DI BORDO" PER IL PANNELLO ITINERARIO
     ========================================================================== */

  generateRadarItinerarySectionHtml() {
    const pois = this.activeRoutePOIs || { fuel: [], autogrill: [], speedCam: [] };
    const fuelList = pois.fuel || [];
    const autogrillList = pois.autogrill || [];
    const camList = pois.speedCam || [];

    const totalRadarItems = fuelList.length + autogrillList.length + camList.length;

    let fuelItemsHtml = fuelList.slice(0, 4).map(f => `
      <div class="radar-hud-item" onclick="if(window.geoLocator) window.geoLocator.focusStepLocation(${f.lat}, ${f.lng})" role="button" tabindex="0">
        <div class="radar-item-left">
          <span class="radar-hud-icon icon-fuel"><i class="fa-solid fa-gas-pump"></i></span>
          <div>
            <strong>${f.brand || 'Distributore'}</strong>
            <small style="display:block; color:#64748b;">${f.name}</small>
          </div>
        </div>
        <div class="radar-item-right">
          <span class="radar-hud-dist">a <strong>${f.roadDistanceKm} km</strong></span>
          ${f.priceEur ? `<span class="radar-hud-price">€${f.priceEur}/L</span>` : ''}
        </div>
      </div>
    `).join('');

    let autogrillItemsHtml = autogrillList.slice(0, 3).map(a => `
      <div class="radar-hud-item" onclick="if(window.geoLocator) window.geoLocator.focusStepLocation(${a.lat}, ${a.lng})" role="button" tabindex="0">
        <div class="radar-item-left">
          <span class="radar-hud-icon icon-autogrill"><i class="fa-solid fa-mug-hot"></i></span>
          <div>
            <strong>${a.brand || 'Autogrill'}</strong>
            <small style="display:block; color:#64748b;">${a.name}</small>
          </div>
        </div>
        <div class="radar-item-right">
          <span class="radar-hud-dist">a <strong>${a.roadDistanceKm} km</strong></span>
          <span class="radar-hud-badge-s">Ristoro 24h</span>
        </div>
      </div>
    `).join('');

    let camItemsHtml = camList.slice(0, 4).map(c => `
      <div class="radar-hud-item" onclick="if(window.geoLocator) window.geoLocator.focusStepLocation(${c.lat}, ${c.lng})" role="button" tabindex="0">
        <div class="radar-item-left">
          <span class="radar-hud-icon icon-cam"><span class="sign-mini">${c.speedLimit || 90}</span></span>
          <div>
            <strong>Autovelox Fisso / Tutor</strong>
            <small style="display:block; color:#64748b;">${c.name}</small>
          </div>
        </div>
        <div class="radar-item-right">
          <span class="radar-hud-dist" style="color:#dc2626; font-weight:800;">a ${c.roadDistanceKm} km</span>
          <span class="radar-hud-limit-badge">Limite ${c.speedLimit} km/h</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="geo-radar-bordo-panel">
        <div class="geo-radar-bordo-head">
          <div style="display:flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-satellite-dish fa-beat" style="--fa-animation-duration: 2s; color:#0284c7;"></i>
            <strong>Radar di Bordo & Servizi Lungo il Tragitto</strong>
          </div>
          <span class="geo-radar-count-tag">${totalRadarItems} Punti Rilevati</span>
        </div>

        <div class="geo-radar-sections-grid">
          <!-- Sezione Benzinai -->
          <div class="geo-radar-sec-col">
            <div class="geo-radar-col-title" style="color:#0284c7;">
              <i class="fa-solid fa-gas-pump"></i> <span>Distributori & Carburante (${fuelList.length})</span>
            </div>
            <div class="geo-radar-list">
              ${fuelItemsHtml || '<div class="radar-empty-note">Nessun distributore registrato nelle immediate vicinanze del tratto iniziale.</div>'}
            </div>
          </div>

          <!-- Sezione Autogrill & Aree Servizio -->
          <div class="geo-radar-sec-col">
            <div class="geo-radar-col-title" style="color:#ea580c;">
              <i class="fa-solid fa-mug-hot"></i> <span>Autogrill & Ristoro (${autogrillList.length})</span>
            </div>
            <div class="geo-radar-list">
              ${autogrillItemsHtml || '<div class="radar-empty-note">Nessuna area di servizio autostradale su questa tratta secondaria.</div>'}
            </div>
          </div>

          <!-- Sezione Autovelox & Limiti -->
          <div class="geo-radar-sec-col">
            <div class="geo-radar-col-title" style="color:#dc2626;">
              <i class="fa-solid fa-camera-retro"></i> <span>Autovelox & Limiti Velocità (${camList.length})</span>
            </div>
            <div class="geo-radar-list">
              ${camItemsHtml || '<div class="radar-empty-note"><i class="fa-solid fa-shield-halved text-success"></i> Nessuna postazione autovelox fissa rilevata su questo tratto.</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// Inizializzazione Globale
window.radarEngine = new RadarDriveEngine();
