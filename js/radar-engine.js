/**
 * ITALIABUS - RADAR DRIVE & POI ENGINE
 * Modulo per il rilevamento di:
 * 1. Distributori di Carburante / Benzinai (Eni, IP, Q8, Tamoil, Esso, pompe bianche, GPL, Metano, EV)
 * 2. Autogrill & Aree di Servizio / Ristoro autostradali e statali
 * 3. Autovelox fissi, Tutor SICVE & Postazioni radar con limiti di velocità
 * 4. Limiti di velocità della strada (50, 70, 90, 110, 130 km/h) e avvisi di prossimità
 */

/* Categorie POI (tutta Italia). type = retrocompat con il vecchio sistema. */
const POI_CACHE_VER = 'v1';
const POI_CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 giorni
const POI_CATS = {
  fu: { type: 'fuel',         label: 'Carburante',      sing: 'Distributore',      icon: 'fa-gas-pump',       color: '#0284c7' },
  ri: { type: 'poi',          label: 'Ristoranti',      sing: 'Ristorante',        icon: 'fa-utensils',       color: '#ea580c' },
  ba: { type: 'poi',          label: 'Bar & Caffè',     sing: 'Bar / Caffè',       icon: 'fa-mug-hot',        color: '#a16207' },
  sm: { type: 'poi',          label: 'Spesa & Market',  sing: 'Supermercato',      icon: 'fa-cart-shopping',  color: '#16a34a' },
  fa: { type: 'poi',          label: 'Farmacie',        sing: 'Farmacia',          icon: 'fa-plus',           color: '#e11d48' },
  bk: { type: 'poi',          label: 'Banche & ATM',    sing: 'Banca / ATM',       icon: 'fa-euro-sign',      color: '#475569' },
  os: { type: 'poi',          label: 'Ospedali',        sing: 'Ospedale',          icon: 'fa-hospital',       color: '#be123c' },
  ho: { type: 'poi',          label: 'Hotel',           sing: 'Hotel',             icon: 'fa-bed',            color: '#7c3aed' },
  pk: { type: 'poi',          label: 'Parcheggi',       sing: 'Parcheggio',        icon: 'fa-square-parking', color: '#2563eb' },
  av: { type: 'speed_camera', label: 'Autovelox',       sing: 'Autovelox',         icon: 'fa-camera-retro',   color: '#dc2626' },
  ag: { type: 'autogrill',    label: 'Autogrill & Aree',sing: 'Area di Servizio',  icon: 'fa-utensils',       color: '#ea580c' },
  st: { type: 'poi',          label: 'Vie & Strade',    sing: 'Via',               icon: 'fa-road',           color: '#0f766e' }
};

class RadarDriveEngine {
  static poiCatFromTags(tags) {
    const a = tags.amenity, sh = tags.shop, hw = tags.highway, to = tags.tourism;
    if (a === 'fuel') return 'fu';
    if (hw === 'services' || hw === 'rest_area' || /autogrill|chef express|sarni|mychef|autostello/i.test(tags.name || tags.brand || '')) return 'ag';
    if (hw === 'speed_camera' || tags.enforcement === 'maxspeed') return 'av';
    if (a === 'restaurant' || a === 'fast_food') return 'ri';
    if (a === 'bar' || a === 'cafe') return 'ba';
    if (sh === 'supermarket' || sh === 'bakery') return 'sm';
    if (a === 'pharmacy') return 'fa';
    if (a === 'bank') return 'bk';
    if (a === 'hospital') return 'os';
    if (to === 'hotel') return 'ho';
    if (a === 'parking') return 'pk';
    return null;
  }

  constructor() {
    this.map = null;
    this.fuelLayer = null;
    this.autogrillLayer = null;
    this.speedCamLayer = null;
    this.speedLimitsLayer = null;
    this.poiLayer = null; // ristoranti, bar, negozi, farmacie, banche, ospedali, hotel, parcheggi…

    this.showFuel = true;
    this.showAutogrill = true;
    this.showSpeedCam = true;
    this.showSpeedLimits = true;
    this.showPOI = true;

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
    this.fuelLayer = this._createRadarLayer();
    this.autogrillLayer = this._createRadarLayer();
    this.speedCamLayer = this._createRadarLayer();
    this.speedLimitsLayer = L.layerGroup(); // solo cerchi/limiti, mai cluster
    this.poiLayer = this._createRadarLayer();

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
    if (this.showPOI && !this.map.hasLayer(this.poiLayer)) this.poiLayer.addTo(this.map);

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
    ].concat(this._expandEmbeddedPOIs(window.POI_EMBEDDED || []));
  }

  /* Espande il dataset POI reale incorporato (js/poi-data.js) — formato compatto
     [cat, lat, lng, nome] — in oggetti POI completi con categoria/tipo/icona. */
  _expandEmbeddedPOIs(list) {
    return (list || []).map((r, i) => {
      const cat = r[0];
      const meta = POI_CATS[cat] || POI_CATS.ri;
      const name = r[3] || meta.sing;
      return {
        id: 'emb_' + cat + '_' + i,
        cat,
        type: meta.type,
        brand: name,
        name,
        lat: r[1],
        lng: r[2],
        speedLimit: cat === 'av' ? 90 : undefined,
        road: '',
        services: null
      };
    });
  }

  /* Categoria di un POI (usa .cat se c'è, altrimenti la deduce dal vecchio .type). */
  _catOf(p) {
    if (p.cat && POI_CATS[p.cat]) return p.cat;
    if (p.type === 'fuel') return 'fu';
    if (p.type === 'autogrill') return 'ag';
    if (p.type === 'speed_camera') return 'av';
    return 'ri';
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

    // Cache persistente in localStorage: una volta scaricata una zona resta disponibile
    // (anche offline / quando Overpass è giù), su tutta Italia.
    const lsKey = 'ib_poi_' + POI_CACHE_VER + '_' + key;
    try {
      const cached = localStorage.getItem(lsKey);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj && obj.t && (Date.now() - obj.t) < POI_CACHE_TTL && Array.isArray(obj.p)) {
          this.cachedOverpassData.set(key, obj.p);
          return obj.p;
        }
      }
    } catch (e) {}

    // Interroga TUTTE le categorie POI su tutta Italia (benzinai, ristoranti, bar/caffè,
    // supermercati, farmacie, banche, ospedali, hotel, parcheggi, autogrill, autovelox).
    const query = `[out:json][timeout:25];(
      node["amenity"~"^(fuel|restaurant|fast_food|cafe|bar|pharmacy|bank|hospital|parking)$"](${s},${w},${n},${e});
      node["shop"~"^(supermarket|bakery)$"](${s},${w},${n},${e});
      node["tourism"="hotel"](${s},${w},${n},${e});
      node["highway"~"^(services|rest_area|speed_camera)$"](${s},${w},${n},${e});
      node["enforcement"="maxspeed"](${s},${w},${n},${e});
    );out body 250;`;

    const parseElements = (elements) => (elements || []).map(el => {
      const tags = el.tags || {};
      const cat = RadarDriveEngine.poiCatFromTags(tags);
      if (!cat) return null;
      const meta = POI_CATS[cat];
      const brand = tags.brand || tags.operator || tags.name || meta.label;
      const name = tags.name || `${brand} ${tags['addr:street'] || ''}`.trim();
      const speedLimit = parseInt(tags.maxspeed, 10) || (tags['highway:maxspeed'] ? parseInt(tags['highway:maxspeed'], 10) : 90);
      return {
        id: `osm_${el.id}`,
        cat,
        type: meta.type,                 // retrocompat: fuel / autogrill / speed_camera / poi
        brand,
        name: name || meta.label,
        lat: el.lat,
        lng: el.lon,
        speedLimit,
        road: tags['addr:street'] || tags.ref || '',
        priceEur: cat === 'fu' ? (1.75 + (Math.abs((el.id % 20)) * 0.01)).toFixed(3) : null,
        services: (cat === 'fu' && tags.fuel) ? Object.keys(tags.fuel).map(k => k.toUpperCase()) : null
      };
    }).filter(Boolean);

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

    if (parsed.length) {
      this.cachedOverpassData.set(key, parsed);
      try { localStorage.setItem(lsKey, JSON.stringify({ t: Date.now(), p: parsed })); } catch (e) {}
    }
    return parsed;
  }

  /* Corsa multi-mirror su Overpass: risolve con gli `elements` grezzi del primo
     mirror che risponde non vuoto, [] se tutti falliscono. Non blocca mai oltre
     il timeout del mirror più lento. Usato dalla scansione VIE (openCityPanel). */
  _overpassFetch(query) {
    const endpoints = [
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass-api.de/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter'
    ];
    const attempts = endpoints.map(base => new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      fetch(`${base}?data=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(res => { clearTimeout(timer); if (!res.ok) return reject(new Error('http ' + res.status)); return res.json(); })
        .then(data => { const els = (data && data.elements) || []; if (!els.length) return reject(new Error('empty')); resolve(els); })
        .catch(err => { clearTimeout(timer); reject(err); });
    }));
    return new Promise(resolve => {
      let remaining = attempts.length, settled = false;
      if (!remaining) return resolve([]);
      attempts.forEach(p => p
        .then(v => { if (!settled) { settled = true; resolve(v); } })
        .catch(() => { remaining--; if (remaining === 0 && !settled) resolve([]); }));
    });
  }

  /* Scarica le VIE con nome dentro il riquadro (residenziali, principali, pedonali…),
     una voce per via (dedotta per nome, punto rappresentativo = baricentro OSM).
     Serve al pannello "Dove vuoi andare in città?" per elencare/cercare le strade. */
  async fetchLiveOverpassStreets(bounds) {
    if (!bounds || typeof bounds.getSouth !== 'function') return [];
    const s = bounds.getSouth().toFixed(4);
    const w = bounds.getWest().toFixed(4);
    const n = bounds.getNorth().toFixed(4);
    const e = bounds.getEast().toFixed(4);
    const key = `st_${s},${w},${n},${e}`;

    if (this.cachedOverpassData.has(key)) return this.cachedOverpassData.get(key);

    const lsKey = 'ib_str_' + POI_CACHE_VER + '_' + key;
    try {
      const cached = localStorage.getItem(lsKey);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj && obj.t && (Date.now() - obj.t) < POI_CACHE_TTL && Array.isArray(obj.p)) {
          this.cachedOverpassData.set(key, obj.p);
          return obj.p;
        }
      }
    } catch (e) {}

    const query = `[out:json][timeout:25];(
      way["highway"~"^(residential|living_street|pedestrian|tertiary|secondary|primary|unclassified|road)$"]["name"](${s},${w},${n},${e});
    );out center 400;`;

    let elements = [];
    try { elements = await this._overpassFetch(query); } catch (e) { elements = []; }

    const seen = new Set();
    const streets = [];
    for (const el of elements) {
      const c = el.center || (el.lat != null ? { lat: el.lat, lon: el.lon } : null);
      const nm = el.tags && el.tags.name;
      if (!c || !nm) continue;
      const k = nm.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      streets.push({ id: 'str_' + el.id, cat: 'st', type: 'poi', brand: nm, name: nm, lat: c.lat, lng: c.lon, road: '' });
    }

    if (streets.length) {
      this.cachedOverpassData.set(key, streets);
      try { localStorage.setItem(lsKey, JSON.stringify({ t: Date.now(), p: streets })); } catch (e) {}
    }
    return streets;
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

    // Avviso VOCALE + sonoro (guida vocale). Deduplicato dallo stesso alertKey del banner.
    if (window.voiceGuide && typeof window.voiceGuide.announceCamera === 'function') {
      window.voiceGuide.announceCamera(cam, distanceMeters);
    }

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

  /* ==========================================================================
     CLUSTERING RADAR (opzione "Marker sulla Mappa" in Personalizza)
     ========================================================================== */
  _clusterEnabled() {
    try {
      const v = (typeof safeStorageGet === 'function')
        ? safeStorageGet('italiarun_map_cluster', 'single')
        : ((typeof localStorage !== 'undefined' && localStorage.getItem('italiarun_map_cluster')) || 'single');
      return v === 'cluster' && typeof L !== 'undefined' && typeof L.markerClusterGroup === 'function';
    } catch (e) { return false; }
  }

  _createRadarLayer() {
    if (this._clusterEnabled()) {
      return L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 55,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 16
      });
    }
    return L.layerGroup();
  }

  // Chiamato dal customizer quando si passa da "Singoli" a "Raggruppati".
  applyClusterSetting() {
    if (!this.map) return;
    const names = ['fuelLayer', 'autogrillLayer', 'speedCamLayer', 'poiLayer'];
    const onMap = {};
    names.forEach(n => {
      onMap[n] = this[n] && this.map.hasLayer(this[n]);
      if (this[n]) { try { this[n].clearLayers(); } catch (e) {} this.map.removeLayer(this[n]); }
    });
    names.forEach(n => {
      this[n] = this._createRadarLayer();
      if (onMap[n]) this[n].addTo(this.map);
    });
    this.renderAllMarkers();
  }

  renderAllMarkers() {
    if (!this.map || typeof L === 'undefined') return;

    this.fuelLayer.clearLayers();
    this.autogrillLayer.clearLayers();
    this.speedCamLayer.clearLayers();
    this.speedLimitsLayer.clearLayers();
    this.poiLayer.clearLayers();

    const poisToRender = (this.activeRoutePOIs && this.activeRoutePOIs.all && this.activeRoutePOIs.all.length > 0)
      ? this.activeRoutePOIs.all
      : this._mergePOIs(this.curatedPOIs, this.liveOverpassPOIs);

    // PERF: viewport culling (solo in modalità "Singoli"). Disegniamo SOLO i
    // POI dentro (o appena fuori) il riquadro visibile: gli altri restano nel
    // dataset e compaiono spostando/zoomando la mappa (moveend). Nessuna
    // informazione persa — semplicemente non teniamo centinaia di marker fuori
    // schermo nel DOM tutti insieme (era una delle cause del lag).
    // In modalità "Raggruppati" (cluster) mostriamo invece TUTTO: ci pensa il
    // cluster a comprimere la densità, così i numeri sui pallini sono reali.
    let cullBounds = null;
    if (!this._clusterEnabled()) {
      try { cullBounds = this.map.getBounds().pad(0.35); } catch (e) { cullBounds = null; }
    }

    for (const p of poisToRender) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
      if (cullBounds && !cullBounds.contains([p.lat, p.lng])) continue;
      const cat = this._catOf(p);
      const meta = POI_CATS[cat] || POI_CATS.ri;
      const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
      const distTxt = p.roadDistanceKm ? ` &bull; <strong>a ${p.roadDistanceKm} km</strong>` : '';

      // Autovelox: pin dedicato col numero del limite.
      if (cat === 'av') {
        const limit = p.speedLimit || 90;
        const vIcon = L.divIcon({
          html: `<div class="map-radar-poi-pin pin-speedcam" title="Autovelox - Limite ${limit} km/h"><span class="speed-cam-limit-val">${limit}</span></div>`,
          className: 'radar-poi-wrapper', iconSize: [34, 34], iconAnchor: [17, 17]
        });
        const m = L.marker([p.lat, p.lng], { icon: vIcon, zIndexOffset: 1600 })
          .bindPopup(`
            <div class="radar-popup-card">
              <div class="radar-popup-head" style="background:#dc2626; color:#fff;"><i class="fa-solid fa-camera-retro"></i> <strong>Autovelox / Controllo Velocità</strong></div>
              <div class="radar-popup-body">
                <h4 style="margin:2px 0 4px; font-size:0.95rem;">${p.name || 'Postazione'}</h4>
                <div style="font-size:1.05rem; font-weight:800; color:#dc2626; margin:4px 0;"><span class="speed-limit-sign-inline">${limit}</span> Limite: <strong>${limit} km/h</strong></div>
                <small style="color:#64748b; display:block;">${p.kind || 'Postazione Fissa / Tutor'}${distTxt}</small>
              </div>
            </div>`);
        this.speedCamLayer.addLayer(m);
        continue;
      }

      // Tutte le altre categorie: pin colorato per categoria + popup con "Indicazioni".
      const pin = L.divIcon({
        html: `<div class="map-radar-poi-pin" title="${(p.brand || meta.sing)}" style="background:${meta.color}"><i class="fa-solid ${meta.icon}"></i></div>`,
        className: 'radar-poi-wrapper', iconSize: [30, 30], iconAnchor: [15, 15]
      });
      const tags = (p.services && p.services.length)
        ? `<div class="radar-popup-tags">${p.services.map(sv => `<span class="radar-tag">${sv}</span>`).join('')}</div>` : '';
      const price = p.priceEur ? `<div class="radar-popup-price">Prezzo stimato: <strong>€${p.priceEur}/L</strong></div>` : '';
      const popup = `
        <div class="radar-popup-card">
          <div class="radar-popup-head" style="background:${meta.color}; color:#fff;"><i class="fa-solid ${meta.icon}"></i> <strong>${p.brand || meta.sing}</strong></div>
          <div class="radar-popup-body">
            <h4 style="margin:2px 0 4px; font-size:0.95rem;">${p.name || meta.sing}</h4>
            <div style="color:#64748b; font-size:0.78rem; margin-bottom:6px;">${meta.label}${p.road ? ` &bull; ${p.road}` : ''}${distTxt}</div>
            ${tags}${price}
            <a href="${gmaps}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:6px 10px;background:${meta.color};color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.82rem;"><i class="fa-solid fa-diamond-turn-right"></i> Indicazioni</a>
          </div>
        </div>`;
      const zoff = cat === 'fu' ? 1200 : (cat === 'ag' ? 1300 : 1000);
      const m = L.marker([p.lat, p.lng], { icon: pin, zIndexOffset: zoff }).bindPopup(popup);
      const layer = cat === 'fu' ? this.fuelLayer : (cat === 'ag' ? this.autogrillLayer : this.poiLayer);
      layer.addLayer(m);
    }
  }

  refreshVisiblePOIs() {
    if (!this.map) return;
    // Ridisegno IMMEDIATO dei marker nella nuova area visibile (il culling in
    // renderAllMarkers tiene solo quelli a schermo → operazione leggera).
    // Così, spostando la mappa, i POI della zona compaiono subito senza
    // attendere la query di rete.
    this.renderAllMarkers();
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
    } else if (type === 'poi') {
      this.showPOI = !this.showPOI;
      if (this.showPOI) this.poiLayer.addTo(this.map);
      else this.map.removeLayer(this.poiLayer);
    }

    this.updateRadarToggleButtonsUI();
  }

  updateRadarToggleButtonsUI() {
    const btnFuel = document.getElementById('btnToggleRadarFuel');
    const btnAutogrill = document.getElementById('btnToggleRadarAutogrill');
    const btnSpeedCam = document.getElementById('btnToggleRadarSpeedCam');
    const btnLimits = document.getElementById('btnToggleRadarLimits');
    const btnPOI = document.getElementById('btnToggleRadarPOI');

    if (btnFuel) btnFuel.classList.toggle('active', this.showFuel);
    if (btnAutogrill) btnAutogrill.classList.toggle('active', this.showAutogrill);
    if (btnSpeedCam) btnSpeedCam.classList.toggle('active', this.showSpeedCam);
    if (btnLimits) btnLimits.classList.toggle('active', this.showSpeedLimits);
    if (btnPOI) btnPOI.classList.toggle('active', this.showPOI);
  }

  /* ==========================================================================
     PANNELLO "PUNTI DI INTERESSE" (apribile) — POI reali attorno a una città/punto,
     scegliibili per impostare la destinazione. Dati OSM live (tutta Italia) + cache.
     ========================================================================== */

  openPOIPanelForView() {
    let lat, lng, title;
    const gl = window.geoLocator;
    if (gl && gl.selectedDestination && typeof gl.selectedDestination.lat === 'number') {
      lat = gl.selectedDestination.lat; lng = gl.selectedDestination.lng;
      title = gl.selectedDestination.name || 'Destinazione';
    } else if (this.map) {
      const c = this.map.getCenter(); lat = c.lat; lng = c.lng; title = 'In questa zona';
    } else { return; }
    this.openPOIPanel(lat, lng, title);
  }

  /* Pannello "Dove vuoi andare in <Città>?": apre in modalità città (scarica anche le
     VIE, mostra la ricerca e il tasto "Vai al centro"). Chiamato da geo-locator quando
     l'utente imposta un comune come destinazione, o quando entra in città. */
  openCityDestinationPanel(dest) {
    if (!dest || typeof dest.lat !== 'number') return;
    this._cityDest = dest;
    this.openPOIPanel(dest.lat, dest.lng, dest.name || 'Città', 5, { cityMode: true });
  }

  async openPOIPanel(lat, lng, title, radiusKm = 3.5, opts = {}) {
    this._panelCenter = [lat, lng];
    this._panelTitle = title;
    this._panelCityMode = !!opts.cityMode;
    if (!this._panelCityMode) this._cityDest = null;
    this._renderPOIPanel(null, title, true); // stato di caricamento
    let live = [], streets = [];
    // Serve solo Leaflet (L) per costruire il bbox: funziona anche se la mappa
    // non è ancora stata inizializzata (apertura automatica appena scelta la città).
    if (typeof L !== 'undefined') {
      try {
        const d = radiusKm / 111;
        const b = L.latLngBounds([lat - d, lng - d * 1.4], [lat + d, lng + d * 1.4]);
        const tasks = [this.fetchLiveOverpassPOIs(b)];
        if (this._panelCityMode) tasks.push(this.fetchLiveOverpassStreets(b));
        const res = await Promise.all(tasks);
        live = res[0] || [];
        streets = res[1] || [];
      } catch (e) {}
    }
    const near = (this.curatedPOIs || []).filter(p => this.haversineDist([lat, lng], [p.lat, p.lng]) <= radiusKm * 1000);
    let all = this._mergePOIs(near, live);
    if (streets.length) all = all.concat(streets);
    all.forEach(p => { p._distM = Math.round(this.haversineDist([lat, lng], [p.lat, p.lng])); });
    all.sort((a, b) => a._distM - b._distM);
    this._panelPOIs = all;
    this._renderPOIPanel(all, title, false);
  }

  _poiPanelEl() {
    let el = document.getElementById('radarPOIPanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'radarPOIPanel';
      el.className = 'radar-poi-panel';
      const host = document.querySelector('.transit-map-wrapper') || document.querySelector('#section-map') || document.body;
      host.appendChild(el);
    }
    return el;
  }

  _renderPOIPanel(pois, title, loading) {
    const el = this._poiPanelEl();
    el.style.display = 'flex';
    const cityMode = this._panelCityMode;
    const safeTitle = this._escAttr(title || '');
    const head = `
      <div class="rpoi-head">
        <div class="rpoi-title"><i class="fa-solid ${cityMode ? 'fa-city' : 'fa-location-dot'}"></i> ${cityMode ? 'Dove vuoi andare?' : 'Punti di Interesse'}<br><small>${title || ''}</small></div>
        <button type="button" class="rpoi-close" onclick="window.radarEngine.closePOIPanel()" aria-label="Chiudi"><i class="fa-solid fa-xmark"></i></button>
      </div>`;

    // Barra di ricerca (filtra l'elenco locale + cerca online l'indirizzo esatto).
    const searchBar = `
      <div class="rpoi-search-wrap">
        <i class="fa-solid fa-magnifying-glass rpoi-search-ic"></i>
        <input type="text" id="rpoiSearchInput" class="rpoi-search" placeholder="Cerca via, luogo o indirizzo…" autocomplete="off"
          oninput="window.radarEngine._poiSearchFilter(this.value)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();window.radarEngine._poiSearchOnline(this.value);}">
        <button type="button" class="rpoi-search-go" title="Cerca questo indirizzo online (OpenStreetMap)" onclick="window.radarEngine._poiSearchOnline(document.getElementById('rpoiSearchInput').value)"><i class="fa-solid fa-globe"></i></button>
      </div>`;

    if (loading) {
      el.innerHTML = head + searchBar + `<div class="rpoi-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> ${cityMode ? 'Scarico vie e luoghi da OpenStreetMap…' : 'Carico i punti di interesse da OpenStreetMap…'}</div>`;
      return;
    }

    const cityCenterBtn = (cityMode && this._cityDest)
      ? `<button type="button" class="rpoi-citycenter" onclick="window.radarEngine._poiGoCityCenter()"><i class="fa-solid fa-diamond-turn-right"></i> Vai al centro di ${safeTitle}</button>`
      : '';

    if (!pois || !pois.length) {
      el.innerHTML = head + searchBar + cityCenterBtn +
        `<div class="rpoi-loading">Nessun luogo trovato qui ora. Usa la ricerca qui sopra${cityMode ? ', oppure "Vai al centro"' : ''} (serve connessione a OpenStreetMap).</div>`;
      return;
    }
    // conteggi per categoria (per i chip filtro)
    const counts = {};
    pois.forEach(p => { const c = this._catOf(p); counts[c] = (counts[c] || 0) + 1; });
    const order = ['st', 'fu', 'ri', 'ba', 'sm', 'fa', 'bk', 'os', 'ho', 'pk', 'ag', 'av'];
    const chips = [`<button type="button" class="rpoi-chip active" data-cat="all" onclick="window.radarEngine._poiPanelFilter('all',this)">Tutti (${pois.length})</button>`]
      .concat(order.filter(c => counts[c]).map(c => {
        const m = POI_CATS[c];
        return `<button type="button" class="rpoi-chip" data-cat="${c}" onclick="window.radarEngine._poiPanelFilter('${c}',this)"><i class="fa-solid ${m.icon}" style="color:${m.color}"></i> ${m.label} (${counts[c]})</button>`;
      }));
    const items = pois.map((p, i) => {
      const c = this._catOf(p); const m = POI_CATS[c];
      const dist = p._distM != null ? (p._distM < 1000 ? p._distM + ' m' : (p._distM / 1000).toFixed(1) + ' km') : '';
      return `
        <div class="rpoi-item" data-cat="${c}" data-idx="${i}">
          <div class="rpoi-ic" style="background:${m.color}"><i class="fa-solid ${m.icon}"></i></div>
          <div class="rpoi-txt" onclick="window.radarEngine._poiFocus(${i})" role="button" tabindex="0">
            <strong>${p.name || m.sing}</strong>
            <small>${m.label}${dist ? ' · ' + dist : ''}</small>
          </div>
          <button type="button" class="rpoi-go" onclick="window.radarEngine._poiRoute(${i})" title="Imposta come destinazione e traccia il percorso"><i class="fa-solid fa-diamond-turn-right"></i> Vai</button>
        </div>`;
    }).join('');
    el.innerHTML = head + searchBar + cityCenterBtn +
      `<div class="rpoi-chips">${chips.join('')}</div>` +
      `<div class="rpoi-list" id="rpoiList">${items}</div>`;

    // Integra i prezzi carburante reali sui benzinai elencati (Premium).
    this._enrichPOIFuelPrices();
  }

  /* Escape minimale per testo inserito in attributi/inline HTML del pannello. */
  _escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  /* Aggiunge ai benzinai del pannello Punti di Interesse i prezzi reali
     (Premium) o un lucchetto (free), abbinandoli alla stazione Osservaprezzi
     più vicina tramite window.fuelPrices. */
  _enrichPOIFuelPrices() {
    const el = document.getElementById('radarPOIPanel');
    if (!el || !window.fuelPrices) return;
    const fuelItems = Array.prototype.slice.call(el.querySelectorAll('.rpoi-item[data-cat="fu"]'));
    if (!fuelItems.length) return;

    const premium = window.fuelPrices.isPremium && window.fuelPrices.isPremium();
    if (!premium) {
      fuelItems.forEach(it => {
        const txt = it.querySelector('.rpoi-txt');
        if (!txt || txt.querySelector('.rpoi-price')) return;
        const b = document.createElement('div');
        b.className = 'rpoi-price locked';
        b.innerHTML = '<i class="fa-solid fa-lock"></i> Prezzi Premium';
        txt.appendChild(b);
      });
      return;
    }

    const center = this._panelCenter;
    if (!center) return;
    const panelPOIs = this._panelPOIs || [];
    window.fuelPrices.pricesNear(center[0], center[1], 4).then(stations => {
      if (!stations || !stations.length) return;
      fuelItems.forEach(it => {
        const txt = it.querySelector('.rpoi-txt');
        if (!txt || txt.querySelector('.rpoi-price')) return;
        const idx = parseInt(it.getAttribute('data-idx'), 10);
        const poi = panelPOIs[idx];
        if (!poi || typeof poi.lat !== 'number') return;
        const near = window.fuelPrices.nearest(stations, poi.lat, poi.lng);
        if (!near || near.distM > 700) return; // troppo lontano: nessun abbinamento affidabile
        const bf = near.station.byFuel || {};
        const chips = ['Benzina', 'Diesel', 'GPL', 'Metano']
          .filter(k => bf[k])
          .map(k => `<span title="${k}${bf[k].self ? ' self' : ' servito'}">${k.slice(0, 4)} €${bf[k].price.toFixed(3)}</span>`)
          .join('');
        if (!chips) return;
        const div = document.createElement('div');
        div.className = 'rpoi-price';
        div.innerHTML = chips;
        txt.appendChild(div);
      });
    }).catch(() => {});
  }

  _poiPanelFilter(cat, btn) {
    const el = document.getElementById('radarPOIPanel');
    if (!el) return;
    el.querySelectorAll('.rpoi-chip').forEach(b => b.classList.toggle('active', b === btn));
    el.querySelectorAll('.rpoi-item').forEach(it => {
      it.style.display = (cat === 'all' || it.getAttribute('data-cat') === cat) ? 'flex' : 'none';
    });
  }

  _poiFocus(i) {
    const p = this._panelPOIs && this._panelPOIs[i];
    if (!p) return;
    if (window.geoLocator && typeof window.geoLocator.focusStepLocation === 'function') window.geoLocator.focusStepLocation(p.lat, p.lng);
    else if (this.map) this.map.setView([p.lat, p.lng], 16);
  }

  _poiRoute(i) {
    const p = this._panelPOIs && this._panelPOIs[i];
    if (!p) return;
    const name = p.name || (POI_CATS[this._catOf(p)] || {}).sing || 'Punto';
    this._routeToPlace(p.lat, p.lng, name, p.road || '');
  }

  /* Imposta un punto preciso (luogo/via/indirizzo) come destinazione finale e traccia
     il percorso. `_cityRefined:true` evita che geo-locator riapra il pannello città. */
  _routeToPlace(lat, lng, name, area) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    const gl = window.geoLocator;
    const uid = 'poi_' + Date.now();
    if (gl && typeof gl.selectDestination === 'function') {
      gl.selectDestination({
        id: uid, uniqueKey: uid, name: name || 'Destinazione',
        area: area || (this._panelTitle || ''), region: (gl.currentRegion || ''),
        lat, lng, isMainHub: false, isStop: true, _cityRefined: true,
        stop: { id: uid, name: name || 'Destinazione', lat, lng }
      }, true);
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`, '_blank');
    }
    this.closePOIPanel();
  }

  /* "Vai al centro di <Città>": instrada verso il comune intero (destinazione originale). */
  _poiGoCityCenter() {
    const d = this._cityDest;
    this.closePOIPanel();
    if (!d) return;
    const gl = window.geoLocator;
    if (gl && typeof gl.selectDestination === 'function') {
      gl.selectDestination(Object.assign({}, d, { _cityRefined: true }), true);
    }
  }

  /* Filtro rapido dell'elenco già scaricato (per testo). */
  _poiSearchFilter(q) {
    const el = document.getElementById('radarPOIPanel');
    if (!el) return;
    q = (q || '').trim().toLowerCase();
    // Il testo libero ha precedenza sui chip categoria.
    el.querySelectorAll('.rpoi-chip').forEach(b => b.classList.toggle('active', b.getAttribute('data-cat') === 'all'));
    el.querySelectorAll('.rpoi-item').forEach(it => {
      const txt = (it.textContent || '').toLowerCase();
      it.style.display = (!q || txt.indexOf(q) !== -1) ? 'flex' : 'none';
    });
  }

  /* Ricerca ONLINE dell'indirizzo esatto (geocoding Nominatim), ristretta alla città
     quando il pannello è in modalità città. È la "ricerca col browser" dei dati OSM. */
  async _poiSearchOnline(q) {
    q = (q || '').trim();
    const listEl = document.getElementById('rpoiList');
    if (q.length < 2) { this._poiRestoreList(); return; }
    const city = (this._panelTitle || '').split('(')[0].split(' · ')[0].trim();
    if (listEl) { listEl._online = true; listEl.innerHTML = `<div class="rpoi-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Cerco "${this._escAttr(q)}"${city ? ' a ' + this._escAttr(city) : ''}…</div>`; }

    const center = this._panelCenter;
    const doFetch = async (bounded) => {
      let vb = '';
      if (center) {
        const d = 0.09; // ~10 km attorno al centro città
        vb = `&viewbox=${center[1] - d},${center[0] + d},${center[1] + d},${center[0] - d}` + (bounded ? '&bounded=1' : '');
      }
      const qFull = q + (city ? (', ' + city) : '') + ', Italia';
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&countrycodes=it&q=${encodeURIComponent(qFull)}${vb}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
        clearTimeout(timer);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (e) { clearTimeout(timer); return []; }
    };

    let results = await doFetch(true);
    if (!results.length) results = await doFetch(false); // fallback senza confine città
    this._renderOnlineResults(results, q);
  }

  _renderOnlineResults(results, q) {
    const listEl = document.getElementById('rpoiList');
    if (!listEl) return;
    listEl._online = true;
    const back = `<button type="button" class="rpoi-back" onclick="window.radarEngine._poiRestoreList()"><i class="fa-solid fa-arrow-left"></i> Elenco</button>`;
    if (!results || !results.length) {
      listEl.innerHTML = `<div class="rpoi-online-head"><span>Nessun risultato per "${this._escAttr(q)}"</span>${back}</div>`;
      return;
    }
    this._onlineResults = results;
    const items = results.map((r, i) => {
      const parts = (r.display_name || '').split(',');
      const name = parts.slice(0, 2).join(',').trim() || (r.display_name || 'Risultato');
      const sub = parts.slice(2, 4).join(',').trim();
      return `
        <div class="rpoi-item">
          <div class="rpoi-ic" style="background:#0f766e"><i class="fa-solid fa-location-dot"></i></div>
          <div class="rpoi-txt"><strong>${this._escAttr(name)}</strong><small>${this._escAttr(sub)}</small></div>
          <button type="button" class="rpoi-go" onclick="window.radarEngine._onlineRoute(${i})" title="Imposta come destinazione"><i class="fa-solid fa-diamond-turn-right"></i> Vai</button>
        </div>`;
    }).join('');
    listEl.innerHTML = `<div class="rpoi-online-head"><span><i class="fa-solid fa-globe"></i> Risultati online</span>${back}</div>` + items;
  }

  _onlineRoute(i) {
    const r = this._onlineResults && this._onlineResults[i];
    if (!r) return;
    const name = (r.display_name || '').split(',').slice(0, 2).join(',').trim() || 'Destinazione';
    this._routeToPlace(parseFloat(r.lat), parseFloat(r.lon), name, '');
  }

  _poiRestoreList() {
    const listEl = document.getElementById('rpoiList');
    if (listEl) listEl._online = false;
    this._renderPOIPanel(this._panelPOIs, this._panelTitle, false);
  }

  closePOIPanel() {
    const el = document.getElementById('radarPOIPanel');
    if (el) el.style.display = 'none';
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
