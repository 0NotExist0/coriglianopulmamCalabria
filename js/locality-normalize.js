/**
 * ITALIABUS - LOCALITY NORMALIZER (Comuni + Province)
 *
 * Problema: le fermate GTFS hanno "area" grezza (es. "RIVAROLO (STAZIONE)") invece del
 * comune reale, e non hanno provincia. Cercare "rivarolo" restituiva decine di voci
 * indistinguibili tra Piemonte (Rivarolo Canavese) e Liguria (Rivarolo di Genova).
 *
 * Soluzione: usando il gazetteer ufficiale dei comuni italiani (comuni-gazetteer.js),
 * a runtime assegniamo a OGNI fermata il comune + provincia + regione PIU' VICINI alle
 * sue coordinate (reverse-geocoding per prossimita', con indice a griglia). Poi
 * ridefiniamo le funzioni di ricerca città/fermata perché mostrino nomi ufficiali
 * ("Rivarolo Canavese (TO)") raggruppati e disambiguati per provincia e regione.
 *
 * Non modifica il file dati: agisce sugli oggetti in memoria e sovrascrive gli helper.
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";

  var GAZ = window.COMUNI_GAZETTEER || [];
  // ogni riga: [nome, siglaProvincia, regione, lat, lng]
  var CELL = 0.1; // ~11 km
  var grid = new Map();

  function cell(la, ln) { return Math.floor(la / CELL) + '_' + Math.floor(ln / CELL); }

  for (var i = 0; i < GAZ.length; i++) {
    var la = GAZ[i][3], ln = GAZ[i][4];
    if (typeof la !== 'number' || typeof ln !== 'number') continue;
    var k = cell(la, ln);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }

  function distMeters(la1, ln1, la2, ln2) {
    var R = 6371000;
    var dLa = (la2 - la1) * Math.PI / 180;
    var dLn = (ln2 - ln1) * Math.PI / 180;
    var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
            Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) *
            Math.sin(dLn / 2) * Math.sin(dLn / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Comune ufficiale più vicino alle coordinate (cerca in celle via via più larghe).
  function nearestComune(la, ln) {
    if (typeof la !== 'number' || typeof ln !== 'number' || !isFinite(la) || !isFinite(ln)) return null;
    var ci = Math.floor(la / CELL), cj = Math.floor(ln / CELL);
    var best = null, bestD = Infinity;
    for (var ring = 1; ring <= 4 && !best; ring++) {
      for (var di = -ring; di <= ring; di++) {
        for (var dj = -ring; dj <= ring; dj++) {
          // solo l'anello esterno dopo il primo giro
          if (ring > 1 && Math.abs(di) !== ring && Math.abs(dj) !== ring) continue;
          var arr = grid.get((ci + di) + '_' + (cj + dj));
          if (!arr) continue;
          for (var x = 0; x < arr.length; x++) {
            var g = GAZ[arr[x]];
            var d = distMeters(la, ln, g[3], g[4]);
            if (d < bestD) { bestD = d; best = g; }
          }
        }
      }
    }
    if (!best) return null;
    return { comune: best[0], prov: best[1], region: best[2], dist: bestD };
  }

  var STREET = /^(via|viale|v\.le|piazza|p\.?zza|p\.za|corso|c\.so|strada|str\.|largo|vico|vicolo|salita|traversa|rotonda|rotatoria|bivio|svincolo)\b/i;

  // Nome comune "ripiegato" dai dati grezzi, se il gazetteer non aiuta.
  function cleanAreaName(raw) {
    var s = String(raw || '').split(' - ')[0].split('(')[0].split('/')[0].split(',')[0].trim();
    if (!s) return '';
    if (STREET.test(s)) return '';
    // Title-case per non lasciare tutto MAIUSCOLO
    return s.toLowerCase().replace(/\b[\wàèéìòóùç']+/g, function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  }

  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’.]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Assegna (una sola volta, memoizzato) comune/provincia/regione alla fermata.
  function assign(stop) {
    if (!stop || stop._comune !== undefined) return stop && stop._comune;
    var nc = (typeof stop.lat === 'number' && typeof stop.lng === 'number') ? nearestComune(stop.lat, stop.lng) : null;
    // Accettiamo il comune del gazetteer se ragionevolmente vicino (<= 18 km).
    if (nc && nc.dist <= 18000) {
      stop._comune = nc.comune;
      stop._prov = nc.prov;
      stop._comuneRegion = nc.region;
      stop._comuneKey = norm(nc.comune) + '|' + nc.prov;
    } else {
      var fallback = cleanAreaName(stop.area || stop.name) || (nc ? nc.comune : '') || 'Località';
      stop._comune = fallback;
      stop._prov = nc ? nc.prov : '';
      stop._comuneRegion = (nc && nc.dist <= 60000) ? nc.region : (stop.region || '');
      stop._comuneKey = norm(fallback) + '|' + (stop._prov || stop._comuneRegion || '');
    }
    return stop._comune;
  }

  function regionName(regionId) {
    var r = (typeof getRegionById === 'function') ? getRegionById(regionId) : null;
    if (r && r.name) return r.name;
    return String(regionId || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // Etichetta di disambiguazione per la UI: "TO · Piemonte" (provincia + regione).
  function contextLabel(stop) {
    assign(stop);
    var parts = [];
    if (stop._prov) parts.push(stop._prov);
    var rn = regionName(stop._comuneRegion || stop.region);
    if (rn) parts.push(rn);
    return parts.join(' · ');
  }

  // Nome comune ufficiale della fermata (per raggruppare e mostrare).
  function comuneOf(stop) { assign(stop); return stop._comune; }

  window.LocalityNormalizer = {
    assign: assign,
    nearestComune: nearestComune,
    comuneOf: comuneOf,
    contextLabel: contextLabel,
    provinceOf: function (stop) { assign(stop); return stop._prov || ''; },
    comuneRegionOf: function (stop) { assign(stop); return stop._comuneRegion || stop.region || ''; },
    norm: norm,
    ready: GAZ.length > 0
  };

  if (!GAZ.length) {
    console.warn('[locality-normalize] gazetteer comuni non caricato: normalizzazione disattivata.');
    return;
  }

  /* ============================================================
     OVERRIDE HELPER CITTA'/FERMATE (usati da search.js e select)
     ============================================================ */

  var REGION_CAP = (function () {
    // Ricava la lista capoluoghi/grandi città già presente nel data.js, se accessibile
    // tramite una categorizzazione precedente; altrimenti set vuoto (best-effort).
    return null;
  })();

  var _catCache = new Map();

  window.getCategorizedLocalities = function (regionId) {
    var stops = (typeof window.getStopsByRegion === 'function') ? window.getStopsByRegion(regionId) : [];
    var cacheKey = regionId + '#' + stops.length;
    if (_catCache.has(cacheKey)) return _catCache.get(cacheKey);

    // Raggruppa per comune ufficiale (+provincia). Ogni comune = una sola voce.
    var byComune = new Map(); // key -> {label, comune, prov, region, count}
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i];
      assign(s);
      if (!s._comune) continue;
      var key = s._comuneKey;
      var entry = byComune.get(key);
      if (!entry) {
        entry = { comune: s._comune, prov: s._prov || '', region: s._comuneRegion || s.region, count: 0, hub: false };
        byComune.set(key, entry);
      }
      entry.count++;
      if (s.isMainHub) entry.hub = true;
    }

    // Etichetta visibile: "Rivarolo Canavese (TO)". Grandi città = hub o molte fermate.
    var cities = [], towns = [];
    byComune.forEach(function (e) {
      e.label = e.prov ? (e.comune + ' (' + e.prov + ')') : e.comune;
      if (e.hub || e.count >= 12) cities.push(e); else towns.push(e);
    });

    var cmp = function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.comune.localeCompare(b.comune, 'it');
    };
    cities.sort(cmp);
    towns.sort(function (a, b) { return a.comune.localeCompare(b.comune, 'it'); });

    var res = {
      capoluoghi: cities.map(function (e) { return e.label; }),
      cities: cities.map(function (e) { return e.label; }),
      towns: towns.map(function (e) { return e.label; }),
      borghi: towns.map(function (e) { return e.label; }),
      frazioni: []
    };
    _catCache.set(cacheKey, res);
    return res;
  };

  window.getCitiesByRegion = function (regionId) {
    var cat = window.getCategorizedLocalities(regionId);
    var set = new Set([].concat(cat.capoluoghi, cat.towns));
    return Array.from(set);
  };

  // Estrae il nome comune dalla stringa "Comune (PROV)" scelta nel menù.
  function stripLabel(city) {
    return norm(String(city || '').replace(/\s*\([A-Z]{2}\)\s*$/, ''));
  }

  var _prevGetStopsByCity = window.getStopsByCity;
  window.getStopsByCity = function (regionId, city) {
    var stops = (typeof window.getStopsByRegion === 'function') ? window.getStopsByRegion(regionId) : [];
    if (!city || city === 'all') return stops;
    var want = stripLabel(city);

    // 1. Match esatto sul comune ufficiale assegnato
    var exact = stops.filter(function (s) { assign(s); return norm(s._comune) === want; });
    if (exact.length) return exact;

    // 2. Fallback al comportamento precedente (area/nome)
    if (typeof _prevGetStopsByCity === 'function') {
      try { return _prevGetStopsByCity(regionId, city); } catch (e) {}
    }
    return stops.filter(function (s) {
      var a = (s.area || '').toLowerCase(), n = (s.name || '').toLowerCase();
      return a.indexOf(want) !== -1 || n.indexOf(want) !== -1;
    });
  };

  console.log('[locality-normalize] attivo — comuni gazetteer:', GAZ.length);
})();
