/*
 * FUEL PRICES — Confronto prezzi carburante lungo il percorso in auto (PREMIUM)
 * ============================================================================
 * Per gli account con abbonamento, quando si visualizza il percorso in MACCHINA,
 * mostra i prezzi REALI di ogni benzinaio lungo il tragitto, per tipo di
 * carburante (Benzina, Diesel, GPL, Metano, ...), cosi' da confrontarli.
 *
 * Fonte: API ufficiale Osservaprezzi Carburanti (MIMIT), raggiunta tramite il
 * proxy CORS `/api/fuel` (vedi api/fuel.js). Se il proxy non e' raggiungibile,
 * ripiega su una STIMA basata sui benzinai rilevati dal Radar di Bordo,
 * chiaramente etichettata come tale.
 *
 * Espone window.fuelPrices. Agganciato da geo-locator.js quando disegna un
 * percorso auto (renderForRoute), che riempie il contenitore #geoFuelPricesWrap.
 */
(function () {
  'use strict';

  // Base del proxy. Sovrascrivibile con window.FUEL_PROXY_BASE prima del load.
  var PROXY_BASE = (typeof window !== 'undefined' && window.FUEL_PROXY_BASE) || 'https://italiarun.vercel.app';

  // Ordine e stile delle categorie di carburante mostrate come filtro.
  var FUEL_ORDER = ['Benzina', 'Diesel', 'GPL', 'Metano', 'Benzina Premium', 'Diesel Premium', 'GNL', 'HVO', 'Idrogeno', 'Altro'];
  var FUEL_STYLE = {
    'Benzina':         { icon: 'fa-gas-pump',   color: '#16a34a', unit: '/L' },
    'Diesel':          { icon: 'fa-oil-can',    color: '#0284c7', unit: '/L' },
    'GPL':             { icon: 'fa-fire-flame-simple', color: '#d97706', unit: '/L' },
    'Metano':          { icon: 'fa-wind',       color: '#7c3aed', unit: '/kg' },
    'Benzina Premium': { icon: 'fa-gas-pump',   color: '#15803d', unit: '/L' },
    'Diesel Premium':  { icon: 'fa-oil-can',    color: '#0369a1', unit: '/L' },
    'GNL':             { icon: 'fa-snowflake',  color: '#0891b2', unit: '/kg' },
    'HVO':             { icon: 'fa-leaf',       color: '#65a30d', unit: '/L' },
    'Idrogeno':        { icon: 'fa-atom',       color: '#db2777', unit: '/kg' },
    'Altro':           { icon: 'fa-gas-pump',   color: '#64748b', unit: '' }
  };

  function isPremium() {
    try {
      if (window._premiumUnlocked) return true;
      return localStorage.getItem('premium_unlocked') === 'true';
    } catch (e) { return !!window._premiumUnlocked; }
  }

  // Classifica il nome del carburante grezzo dell'Osservaprezzi in una categoria.
  function canonFuel(name) {
    var n = (name || '').toLowerCase();
    if (/gpl/.test(n)) return 'GPL';
    if (/gnl|lng/.test(n)) return 'GNL';
    if (/metano|gnc|\bcng\b/.test(n)) return 'Metano';
    if (/idrogeno|hydrogen/.test(n)) return 'Idrogeno';
    if (/\bhvo\b/.test(n)) return 'HVO';
    var premium = /premium|plus|excellium|hi-?q|v-?power|blu|energy|supreme|racing|special|100\b|98\b|tech/.test(n);
    if (/gasolio|diesel/.test(n)) return premium ? 'Diesel Premium' : 'Diesel';
    if (/benzina/.test(n)) return premium ? 'Benzina Premium' : 'Benzina';
    return 'Altro';
  }

  function fmtPrice(p) {
    if (typeof p !== 'number' || !isFinite(p) || p <= 0) return '—';
    return '€' + p.toFixed(3);
  }

  function relDate(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (!t) return '';
    var days = Math.floor((Date.now() - t) / 86400000);
    if (days <= 0) return 'oggi';
    if (days === 1) return 'ieri';
    if (days < 30) return days + ' giorni fa';
    try { return new Date(t).toLocaleDateString('it-IT'); } catch (e) { return ''; }
  }

  function FuelPricesEngine() {
    this._stations = [];
    this._present = [];       // categorie carburante presenti
    this._cheapest = {};      // categoria -> prezzo minimo globale
    this._activeFuel = null;
    this._reqId = 0;
  }

  FuelPricesEngine.prototype.wrapEl = function () {
    return document.getElementById('geoFuelPricesWrap');
  };

  // Punto d'ingresso: chiamato quando si disegna un percorso in auto.
  FuelPricesEngine.prototype.renderForRoute = function (routeCoords) {
    // Ricorda l'ultimo percorso cosi' il pulsante "Aggiorna"/reload() puo' rifare
    // la richiesta anche se chiamato senza argomenti.
    if (routeCoords && routeCoords.length) this._lastRouteCoords = routeCoords;

    var el = this.wrapEl();
    if (!el) return;

    if (!isPremium()) { el.innerHTML = this._upsellHtml(); return; }

    var pts = this._sample(this._lastRouteCoords, 18);
    if (pts.length < 1) { el.innerHTML = ''; return; }

    var reqId = ++this._reqId;
    el.innerHTML = this._loadingHtml();

    var self = this;
    this._fetchRoute(pts).then(function (data) {
      if (reqId !== self._reqId) return; // superato da una richiesta piu' recente
      if (data && data.success && data.results && data.results.length) {
        self._ingest(data.results, false, data.updated);
        el.innerHTML = self._panelHtml(false, data.updated);
      } else {
        self._renderEstimated(el);
      }
    }).catch(function () {
      if (reqId !== self._reqId) return;
      self._renderEstimated(el);
    });
  };

  // Ricarica i prezzi usando l'ultimo percorso noto (bottone "Aggiorna"/"Riprova").
  FuelPricesEngine.prototype.reload = function () {
    if (this._lastRouteCoords && this._lastRouteCoords.length) {
      this.renderForRoute(this._lastRouteCoords);
    }
  };

  // Campiona al piu' n punti equidistanti lungo il percorso ([lat,lng] o {lat,lng}).
  FuelPricesEngine.prototype._sample = function (coords, n) {
    var pts = [];
    if (!coords || !coords.length) return pts;
    var norm = [];
    for (var i = 0; i < coords.length; i++) {
      var c = coords[i], lat, lng;
      if (Array.isArray(c)) { lat = c[0]; lng = c[1]; }
      else if (c && typeof c.lat === 'function') { lat = c.lat(); lng = c.lng(); }
      else if (c && typeof c.lat === 'number') { lat = c.lat; lng = c.lng; }
      if (isFinite(lat) && isFinite(lng)) norm.push({ lat: lat, lng: lng });
    }
    if (!norm.length) return pts;
    if (norm.length <= n) return norm;
    var step = (norm.length - 1) / (n - 1);
    for (var k = 0; k < n; k++) pts.push(norm[Math.round(k * step)]);
    return pts;
  };

  // Chiamata generica al proxy (prova same-origin /api/fuel su http(s), poi assoluto).
  FuelPricesEngine.prototype._call = function (bodyObj) {
    var self = this;
    var payload = JSON.stringify(bodyObj);
    var candidates = [];
    try {
      if (location && /^https?:$/.test(location.protocol)) candidates.push('/api/fuel');
    } catch (e) {}
    candidates.push(PROXY_BASE.replace(/\/$/, '') + '/api/fuel');

    function attempt(i) {
      if (i >= candidates.length) return Promise.reject(new Error('no endpoint'));
      return self._post(candidates[i], payload).catch(function () { return attempt(i + 1); });
    }
    return attempt(0);
  };

  FuelPricesEngine.prototype._fetchRoute = function (points) {
    return this._call({ points: points, mode: 'route' });
  };

  // Stazioni reali attorno a un punto (raggio km) — usato dal pannello Punti di Interesse.
  FuelPricesEngine.prototype.pricesNear = function (lat, lng, radiusKm) {
    return this._call({ points: [{ lat: lat, lng: lng }], mode: 'zone', radius: radiusKm || 3 })
      .then(function (data) {
        if (!data || !data.success || !data.results) return [];
        return data.results.map(function (s) {
          var byFuel = {};
          (s.fuels || []).forEach(function (f) {
            var price = (typeof f.price === 'number') ? f.price : parseFloat(f.price);
            if (!isFinite(price) || price <= 0.2 || price === 1) return;
            var key = canonFuel(f.name);
            if (!byFuel[key] || price < byFuel[key].price) byFuel[key] = { price: price, self: !!f.self };
          });
          return { id: s.id, name: s.name, brand: s.brand, lat: s.lat, lng: s.lng, updated: s.updated, byFuel: byFuel };
        }).filter(function (s) { return s.lat != null && Object.keys(s.byFuel).length; });
      });
  };

  FuelPricesEngine.prototype._haversine = function (la1, lo1, la2, lo2) {
    var R = 6371000, r = Math.PI / 180;
    var dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
    var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
      Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  FuelPricesEngine.prototype.nearest = function (stations, lat, lng) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < stations.length; i++) {
      var s = stations[i];
      if (s.lat == null) continue;
      var d = this._haversine(lat, lng, s.lat, s.lng);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best ? { station: best, distM: Math.round(bestD) } : null;
  };

  FuelPricesEngine.prototype.isPremium = function () { return isPremium(); };

  FuelPricesEngine.prototype._post = function (url, payload) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, 16000) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (to) clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) {
      if (to) clearTimeout(to);
      throw e;
    });
  };

  // Costruisce la struttura interna (per-stazione, per-carburante prezzo minimo).
  FuelPricesEngine.prototype._ingest = function (results, estimated, updated) {
    var stations = [];
    var presentSet = {};
    for (var i = 0; i < results.length; i++) {
      var s = results[i];
      var byFuel = {};
      var fuels = s.fuels || [];
      for (var j = 0; j < fuels.length; j++) {
        var f = fuels[j];
        var price = (typeof f.price === 'number') ? f.price : parseFloat(f.price);
        // Scarta i prezzi-segnaposto fasulli (0.001, 0.01, 1.000) che alcuni
        // gestori inseriscono: falserebbero il "più economico". Nessun carburante
        // reale costa <0.20 (nemmeno il GPL) o esattamente 1.000 nel 2026.
        if (!isFinite(price) || price <= 0.2 || price === 1) continue;
        var key = f._canon || canonFuel(f.name);
        if (!byFuel[key] || price < byFuel[key].price) {
          byFuel[key] = { price: price, self: !!f.self };
        }
        presentSet[key] = true;
      }
      if (!Object.keys(byFuel).length) continue;
      stations.push({
        id: s.id,
        name: s.name || 'Distributore',
        brand: s.brand || '',
        lat: s.lat, lng: s.lng,
        distKm: s.distKm,
        updated: s.updated || updated || null,
        byFuel: byFuel,
        estimated: !!estimated
      });
    }

    // Cheapest globale per categoria.
    var cheapest = {};
    for (var a = 0; a < stations.length; a++) {
      var bf = stations[a].byFuel;
      for (var kk in bf) {
        if (!bf.hasOwnProperty(kk)) continue;
        if (cheapest[kk] == null || bf[kk].price < cheapest[kk]) cheapest[kk] = bf[kk].price;
      }
    }

    var present = FUEL_ORDER.filter(function (k) { return presentSet[k]; });
    // categorie non previste nell'ordine, in coda
    for (var pk in presentSet) if (present.indexOf(pk) === -1) present.push(pk);

    this._stations = stations;
    this._present = present;
    this._cheapest = cheapest;
    this._estimated = !!estimated;

    // Carburante attivo: preferenza salvata -> Benzina -> Diesel -> primo presente.
    var pref = null;
    try { pref = localStorage.getItem('ib_fuel_pref'); } catch (e) {}
    if (pref && present.indexOf(pref) !== -1) this._activeFuel = pref;
    else if (present.indexOf('Benzina') !== -1) this._activeFuel = 'Benzina';
    else if (present.indexOf('Diesel') !== -1) this._activeFuel = 'Diesel';
    else this._activeFuel = present[0] || null;
  };

  FuelPricesEngine.prototype._sortedStations = function () {
    var key = this._activeFuel;
    var list = this._stations.slice();
    list.sort(function (a, b) {
      var pa = a.byFuel[key] ? a.byFuel[key].price : Infinity;
      var pb = b.byFuel[key] ? b.byFuel[key].price : Infinity;
      if (pa !== pb) return pa - pb;
      var da = (a.distKm == null) ? Infinity : a.distKm;
      var db = (b.distKm == null) ? Infinity : b.distKm;
      return da - db;
    });
    return list;
  };

  FuelPricesEngine.prototype.setFuel = function (key) {
    if (!key || key === this._activeFuel) return;
    this._activeFuel = key;
    try { localStorage.setItem('ib_fuel_pref', key); } catch (e) {}
    var el = this.wrapEl();
    if (el) el.innerHTML = this._panelHtml(this._estimated, this._updated);
  };

  FuelPricesEngine.prototype.focus = function (i) {
    var list = this._lastRendered || [];
    var s = list[i];
    if (!s || s.lat == null) return;
    if (window.geoLocator && typeof window.geoLocator.focusStepLocation === 'function') {
      window.geoLocator.focusStepLocation(s.lat, s.lng);
    } else if (window.transitMap && window.transitMap.map) {
      window.transitMap.map.setView([s.lat, s.lng], 16);
    }
  };

  FuelPricesEngine.prototype.goPremium = function () {
    if (typeof window.onPremiumClick === 'function') { window.onPremiumClick(); return; }
    var b = document.getElementById('btnPremium');
    if (b) b.click();
    else if (typeof window.openAccount === 'function') window.openAccount();
  };

  /* ------------------------------ RENDER HTML ------------------------------ */

  FuelPricesEngine.prototype._panelHtml = function (estimated, updated) {
    this._updated = updated;
    var active = this._activeFuel;
    var sorted = this._sortedStations();
    this._lastRendered = sorted;

    var style = FUEL_STYLE[active] || FUEL_STYLE['Altro'];
    // Indice della SINGOLA stazione più economica per il carburante attivo
    // (le stazioni sono già ordinate crescenti: è la prima che ha quel carburante).
    // Cosi' evitiamo di marcare "più economico" tutte quelle a pari prezzo.
    var cheapIdx = -1;
    for (var ci = 0; ci < sorted.length; ci++) { if (sorted[ci].byFuel[active]) { cheapIdx = ci; break; } }

    // Chip filtro per categoria carburante.
    var chips = this._present.map(function (k) {
      var st = FUEL_STYLE[k] || FUEL_STYLE['Altro'];
      var on = (k === active);
      return '<button type="button" class="fuel-chip' + (on ? ' active' : '') + '"' +
        ' style="' + (on ? '--fc:' + st.color + ';' : '') + '"' +
        ' onclick="window.fuelPrices.setFuel(\'' + k + '\')">' +
        '<i class="fa-solid ' + st.icon + '"></i> ' + k + '</button>';
    }).join('');

    var rows = sorted.map(function (s, idx) {
      var act = s.byFuel[active];
      var isCheap = (idx === cheapIdx) && !!act;

      // pill dei singoli carburanti della stazione (attivo evidenziato)
      var fuelPills = FUEL_ORDER.filter(function (k) { return s.byFuel[k]; }).map(function (k) {
        var st = FUEL_STYLE[k] || FUEL_STYLE['Altro'];
        var v = s.byFuel[k];
        var on = (k === active);
        return '<span class="fuel-price-pill' + (on ? ' on' : '') + '" style="--fc:' + st.color + '">' +
          '<i class="fa-solid ' + st.icon + '"></i>' +
          '<span class="fp-k">' + k + '</span>' +
          '<span class="fp-v">' + fmtPrice(v.price) + '<small>' + st.unit + '</small></span>' +
          '<span class="fp-mode">' + (v.self ? 'self' : 'servito') + '</span>' +
        '</span>';
      }).join('');

      var gmaps = 'https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng + '&travelmode=driving';
      var dist = (s.distKm != null) ? ('<span class="fs-dist"><i class="fa-solid fa-route"></i> ' + s.distKm + ' km</span>') : '';
      var upd = s.updated ? ('<span class="fs-upd" title="Ultimo aggiornamento prezzo"><i class="fa-solid fa-clock"></i> ' + relDate(s.updated) + '</span>') : '';
      var brand = s.brand ? ('<span class="fs-brand">' + s.brand + '</span>') : '';

      return '<div class="fuel-station' + (isCheap ? ' cheapest' : '') + '">' +
        '<div class="fs-head">' +
          '<div class="fs-id" role="button" tabindex="0" onclick="window.fuelPrices.focus(' + idx + ')">' +
            (isCheap ? '<span class="fs-badge-cheap"><i class="fa-solid fa-award"></i> Più economico</span>' : '') +
            '<strong>' + (s.name || 'Distributore') + '</strong>' +
            '<div class="fs-meta">' + brand + dist + upd + '</div>' +
          '</div>' +
          '<a class="fs-go" href="' + gmaps + '" target="_blank" rel="noopener" title="Indicazioni"><i class="fa-solid fa-diamond-turn-right"></i></a>' +
        '</div>' +
        '<div class="fuel-pill-row">' + fuelPills + '</div>' +
      '</div>';
    }).join('');

    var srcNote = estimated
      ? '<span class="fuel-src est"><i class="fa-solid fa-triangle-exclamation"></i> Prezzi STIMATI — Osservaprezzi non raggiungibile ora</span>'
      : '<span class="fuel-src"><i class="fa-solid fa-circle-check"></i> Prezzi reali · fonte MIMIT Osservaprezzi' + (updated ? ' · agg. ' + relDate(updated) : '') + '</span>';

    return '' +
      '<div class="geo-fuel-panel">' +
        '<div class="geo-fuel-head">' +
          '<div class="gf-title"><i class="fa-solid fa-gas-pump" style="color:' + style.color + '"></i> ' +
            '<strong>Prezzi carburante lungo il percorso</strong> ' +
            '<span class="gf-premium"><i class="fa-solid fa-crown"></i> Premium</span></div>' +
          '<div class="gf-head-right">' +
            '<span class="gf-count">' + this._stations.length + ' distributori</span>' +
            '<button type="button" class="gf-refresh" title="Aggiorna i prezzi" onclick="window.fuelPrices.reload()"><i class="fa-solid fa-rotate"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="gf-srcbar">' + srcNote + '</div>' +
        '<div class="gf-sub">Ordinati per <strong>' + active + '</strong> (dal più economico). Tocca un carburante per confrontarlo:</div>' +
        '<div class="fuel-chips">' + chips + '</div>' +
        '<div class="fuel-station-list">' + (rows || '<div class="fuel-empty">Nessun distributore con prezzi lungo questo tratto.</div>') + '</div>' +
      '</div>';
  };

  FuelPricesEngine.prototype._renderEstimated = function (el) {
    var est = this._buildEstimatedFromRadar();
    if (est && est.length) {
      this._ingest(est, true, null);
      el.innerHTML = this._panelHtml(true, null);
    } else {
      el.innerHTML = '' +
        '<div class="geo-fuel-panel">' +
          '<div class="geo-fuel-head"><div class="gf-title"><i class="fa-solid fa-gas-pump"></i> <strong>Prezzi carburante</strong> <span class="gf-premium"><i class="fa-solid fa-crown"></i> Premium</span></div></div>' +
          '<div class="fuel-empty"><i class="fa-solid fa-wifi"></i> Prezzi non disponibili ora (Osservaprezzi non raggiungibile). Controlla la connessione e riprova.' +
            '<button type="button" class="fuel-retry" onclick="window.fuelPrices.reload()"><i class="fa-solid fa-rotate"></i> Riprova</button>' +
          '</div>' +
        '</div>';
    }
  };

  // Ripiego: costruisce stazioni "stimate" dai benzinai del Radar di Bordo.
  FuelPricesEngine.prototype._buildEstimatedFromRadar = function () {
    var pois = (window.radarEngine && window.radarEngine.activeRoutePOIs && window.radarEngine.activeRoutePOIs.fuel) || [];
    if (!pois.length) return null;
    // Prezzi base nazionali indicativi (aggiornati manualmente, solo come stima).
    var BASE = { Benzina: 1.86, Diesel: 1.80, GPL: 0.72, Metano: 1.42 };
    return pois.slice(0, 12).map(function (p) {
      var seed = 0, str = (p.id || p.name || '') + '';
      for (var i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) % 1000;
      var jitter = ((seed % 60) - 30) / 1000; // ±0.030
      var base = (typeof p.priceEur === 'number') ? p.priceEur : (typeof p.priceEur === 'string' ? parseFloat(p.priceEur) : NaN);
      var benz = isFinite(base) ? base : (BASE.Benzina + jitter);
      var svc = (p.services || []).join(' ').toLowerCase();
      var fuels = [
        { name: 'Benzina', price: +(benz).toFixed(3), self: true },
        { name: 'Gasolio', price: +(benz - 0.05 + jitter / 2).toFixed(3), self: true }
      ];
      if (/gpl/.test(svc)) fuels.push({ name: 'GPL', price: +(BASE.GPL + jitter / 2).toFixed(3), self: true });
      if (/metano/.test(svc)) fuels.push({ name: 'Metano', price: +(BASE.Metano + jitter).toFixed(3), self: true });
      return {
        id: p.id, name: p.name, brand: p.brand || '',
        lat: p.lat, lng: p.lng,
        distKm: (typeof p.roadDistanceKm === 'number') ? p.roadDistanceKm : null,
        updated: null, fuels: fuels
      };
    });
  };

  FuelPricesEngine.prototype._loadingHtml = function () {
    return '' +
      '<div class="geo-fuel-panel">' +
        '<div class="geo-fuel-head"><div class="gf-title"><i class="fa-solid fa-gas-pump"></i> <strong>Prezzi carburante lungo il percorso</strong> <span class="gf-premium"><i class="fa-solid fa-crown"></i> Premium</span></div></div>' +
        '<div class="fuel-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Cerco i prezzi reali dei distributori lungo il tragitto…</div>' +
      '</div>';
  };

  FuelPricesEngine.prototype._upsellHtml = function () {
    return '' +
      '<div class="geo-fuel-panel fuel-locked">' +
        '<div class="fuel-lock-badge"><i class="fa-solid fa-lock"></i></div>' +
        '<div class="fuel-lock-body">' +
          '<div class="fl-title"><i class="fa-solid fa-crown"></i> Prezzi carburante — funzione Premium</div>' +
          '<p class="fl-text">Confronta i prezzi <strong>reali</strong> di benzina, diesel, GPL e metano di <strong>tutti i benzinai lungo il percorso</strong> e trova subito il più conveniente. Dati ufficiali MIMIT (Osservaprezzi Carburanti).</p>' +
          '<div class="fl-preview" aria-hidden="true">' +
            '<div class="flp-row"><span class="flp-name">Distributore ●●●●</span><span class="flp-price">€1.8●●</span></div>' +
            '<div class="flp-row"><span class="flp-name">Distributore ●●●●●</span><span class="flp-price">€1.7●●</span></div>' +
            '<div class="flp-row"><span class="flp-name">Distributore ●●●</span><span class="flp-price">€1.8●●</span></div>' +
          '</div>' +
          '<button type="button" class="btn btn-primary btn-sm fl-cta" onclick="window.fuelPrices.goPremium()"><i class="fa-solid fa-crown"></i> Attiva Premium per vedere i prezzi</button>' +
        '</div>' +
      '</div>';
  };

  window.fuelPrices = new FuelPricesEngine();
})();
