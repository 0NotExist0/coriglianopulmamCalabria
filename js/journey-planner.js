/**
 * ITALIABUS - MULTI-HOP JOURNEY PLANNER (RAPTOR-style)
 *
 * Quando la fermata piu' vicina NON ha mezzi che servono la destinazione,
 * questo motore calcola automaticamente l'intero itinerario: a piedi fino alla
 * fermata giusta, quali mezzi prendere, dove cambiare e dove scendere, fino a
 * destinazione. Fa tutti i match di linee e fermate in automatico.
 *
 * Preferisce le fermate di partenza in DISCESA rispetto a quelle in salita
 * (anche se un po' piu' lontane) usando le quote reali (Open-Meteo elevation).
 *
 * Espone: window.journeyPlanner.plan(originLatLng, destStop, opts) -> Promise<itinerary|null>
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

class JourneyPlanner {
  constructor() {
    this._indexCache = {};   // per-mode: { modeKey -> index }
    this._elevCache = new Map(); // "lat,lng" arrotondato -> quota (m)

    // Pesi del costo (equivalenti in metri) — piu' alto = piu' sgradito
    this.RIDE_W = 0.35;          // stare sul mezzo e' comodo -> peso basso
    this.WALK_W = 1.7;           // camminare e' faticoso -> peso alto
    this.TRANSFER_PENALTY = 1500;// ogni salita su un mezzo (cambio) costa
    this.UPHILL_PER_M = 10;      // ogni metro di dislivello in SALITA (Naismith ~8-10)
    this.DOWNHILL_PER_M = 3;     // la discesa e' preferita (riduce il costo)
    this.MAX_TRANSFER_WALK = 550;// max metri per un trasbordo a piedi tra fermate
    this.DEFAULT_MAX_ROUNDS = 3; // fino a 3 mezzi = 2 cambi
    this.GRID_CELL = 0.01;       // ~1.1 km di lato
  }

  /* ==========================================================================
     INDICE SPAZIALE + INDICE DI RETE (costruito una volta per modalita')
     ========================================================================== */
  _buildIndex(modeKey) {
    const modeData = window.TRANSIT_DATA?.modes?.[modeKey] || window.TRANSIT_DATA?.modes?.pullman;
    const stops = (modeData?.stops) || [];
    const rawLines = (modeData?.lines) || [];

    const cached = this._indexCache[modeKey];
    if (cached && cached.stopsCount === stops.length && cached.linesCount === rawLines.length) {
      return cached;
    }

    const stopsById = new Map();
    const grid = new Map();
    const cell = this.GRID_CELL;

    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const lat = s.lat_actual || s.lat;
      const lng = s.lng_actual || s.lng;
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
      stopsById.set(s.id, s);
      const key = Math.floor(lat / cell) + '_' + Math.floor(lng / cell);
      let bucket = grid.get(key);
      if (!bucket) { bucket = []; grid.set(key, bucket); }
      bucket.push(s.id);
    }

    // Linee: sequenza ordinata di fermate risolvibili + distanze cumulative
    const lines = [];
    const linesByStop = new Map();
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i];
      const rawIds = l.stopsIds || l.stops || [];
      const ids = [];
      const coords = [];
      for (let k = 0; k < rawIds.length; k++) {
        const st = stopsById.get(rawIds[k]);
        if (!st) continue; // salta le fermate mancanti nei dati
        ids.push(rawIds[k]);
        coords.push([st.lat_actual || st.lat, st.lng_actual || st.lng]);
      }
      if (ids.length < 2) continue;

      const cum = [0];
      for (let k = 1; k < coords.length; k++) {
        cum[k] = cum[k - 1] + this.haversine(coords[k - 1], coords[k]);
      }
      const idIndex = new Map();
      for (let k = 0; k < ids.length; k++) {
        if (!idIndex.has(ids[k])) idIndex.set(ids[k], k);
      }

      const lineObj = { key: 'L' + lines.length, ref: l, ids, coords, cum, idIndex };
      lines.push(lineObj);

      for (let k = 0; k < ids.length; k++) {
        let arr = linesByStop.get(ids[k]);
        if (!arr) { arr = []; linesByStop.set(ids[k], arr); }
        arr.push(lineObj);
      }
    }

    const index = {
      modeKey, stopsCount: stops.length, linesCount: rawLines.length,
      stopsById, grid, cell, lines, linesByStop
    };
    this._indexCache[modeKey] = index;
    return index;
  }

  /* Fermate vicine a (lat,lng) entro radiusM, ordinate per distanza, max limit */
  nearbyStops(index, lat, lng, radiusM, limit) {
    const cell = index.cell;
    const span = Math.max(1, Math.ceil(radiusM / 1000)); // ~1 cella ~1.1km
    const cx = Math.floor(lat / cell);
    const cy = Math.floor(lng / cell);
    const found = [];
    for (let dx = -span; dx <= span; dx++) {
      for (let dy = -span; dy <= span; dy++) {
        const bucket = index.grid.get((cx + dx) + '_' + (cy + dy));
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b++) {
          const st = index.stopsById.get(bucket[b]);
          if (!st) continue;
          const slat = st.lat_actual || st.lat;
          const slng = st.lng_actual || st.lng;
          const d = this.haversine([lat, lng], [slat, slng]);
          if (d <= radiusM) {
            found.push({ id: st.id, lat: slat, lng: slng, name: st.name, dist: d, stop: st });
          }
        }
      }
    }
    found.sort((a, b) => a.dist - b.dist);
    return limit ? found.slice(0, limit) : found;
  }

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

  /* ==========================================================================
     QUOTE (ELEVATION) — per preferire le fermate in discesa
     ========================================================================== */
  async fetchElevations(points) {
    // points: [[lat,lng], ...] -> [quota_m, ...] oppure null se non disponibile
    if (!points || points.length === 0) return null;

    // Usa cache dove possibile
    const round = (v) => Math.round(v * 10000) / 10000;
    const need = [];
    const needIdx = [];
    const result = new Array(points.length).fill(null);
    for (let i = 0; i < points.length; i++) {
      const k = round(points[i][0]) + ',' + round(points[i][1]);
      if (this._elevCache.has(k)) result[i] = this._elevCache.get(k);
      else { need.push(points[i]); needIdx.push(i); }
    }
    if (need.length === 0) return result;

    const lats = need.map(p => p[0]).join(',');
    const lngs = need.map(p => p[1]).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return result.some(v => v != null) ? result : null;
      const data = await res.json();
      const elev = data && data.elevation;
      if (!Array.isArray(elev)) return result.some(v => v != null) ? result : null;
      for (let i = 0; i < needIdx.length; i++) {
        const v = elev[i];
        result[needIdx[i]] = (typeof v === 'number') ? v : null;
        if (typeof v === 'number') {
          const k = round(need[i][0]) + ',' + round(need[i][1]);
          this._elevCache.set(k, v);
        }
      }
      return result;
    } catch (e) {
      clearTimeout(timer);
      return result.some(v => v != null) ? result : null;
    }
  }

  /* ==========================================================================
     PIANIFICAZIONE ITINERARIO
     ========================================================================== */
  async plan(originLatLng, destStop, opts = {}) {
    if (!originLatLng || !destStop || !destStop.id) return null;
    const modeKey = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const index = this._buildIndex(modeKey);
    if (!index.stopsById.has(destStop.id)) {
      // La destinazione non e' una fermata nota di questa modalita'
      if (!destStop.lat) return null;
    }

    const maxRounds = opts.maxRounds || this.DEFAULT_MAX_ROUNDS;

    // --- Fermate di partenza candidate vicine all'utente ---
    let cands = this.nearbyStops(index, originLatLng[0], originLatLng[1], opts.originRadius || 2200, opts.originK || 8);
    if (cands.length === 0) cands = this.nearbyStops(index, originLatLng[0], originLatLng[1], 9000, 4);
    if (cands.length === 0) return null;

    // --- Quote per preferire la discesa (best-effort) ---
    let terrainOn = false;
    try {
      const pts = [originLatLng].concat(cands.map(c => [c.lat, c.lng]));
      const elevs = await this.fetchElevations(pts);
      if (elevs && elevs[0] != null) {
        const userElev = elevs[0];
        for (let i = 0; i < cands.length; i++) {
          const e = elevs[i + 1];
          cands[i].elevGain = (e != null) ? (e - userElev) : 0;
        }
        terrainOn = true;
      }
    } catch (e) { /* offline: prosegue senza terreno */ }
    if (!terrainOn) cands.forEach(c => { c.elevGain = 0; });

    // --- RAPTOR (label-correcting, costo cumulativo + penalita' cambio) ---
    const bestCost = new Map();
    const bestTrips = new Map();
    const parent = new Map();
    let marked = new Set();

    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      const terrain = c.elevGain > 0 ? c.elevGain * this.UPHILL_PER_M : c.elevGain * this.DOWNHILL_PER_M;
      const cost = c.dist * this.WALK_W + terrain;
      if (cost < (bestCost.get(c.id) ?? Infinity)) {
        bestCost.set(c.id, cost);
        bestTrips.set(c.id, 0);
        parent.set(c.id, { type: 'walk', from: 'USER', meters: c.dist, elevGain: c.elevGain });
        marked.add(c.id);
      }
    }

    const destId = destStop.id;

    for (let round = 1; round <= maxRounds; round++) {
      // Snapshot degli arrivi del round precedente (per decidere dove salire)
      const arrPrev = new Map(bestCost);
      const tripsPrev = new Map(bestTrips);

      // 1) Coda linee: per ogni linea, la fermata marcata con indice piu' basso da cui salire
      const lineQueue = new Map();
      for (const sid of marked) {
        const linesHere = index.linesByStop.get(sid);
        if (!linesHere) continue;
        for (let li = 0; li < linesHere.length; li++) {
          const L = linesHere[li];
          const i = L.idIndex.get(sid);
          if (i == null || i >= L.ids.length - 1) continue; // capolinea: non si sale
          const cur = lineQueue.get(L.key);
          if (!cur || i < cur.minIdx) lineQueue.set(L.key, { line: L, minIdx: i });
        }
      }

      const newMarked = new Set();

      // 2) Scansione linee: dal punto di salita in avanti
      for (const { line: L, minIdx } of lineQueue.values()) {
        let boardIdx = minIdx;
        let board = L.ids[boardIdx];
        let boardCost = arrPrev.get(board);
        let boardTrips = tripsPrev.get(board);
        if (boardCost == null) continue;

        for (let j = boardIdx + 1; j < L.ids.length; j++) {
          const sj = L.ids[j];
          const rideMeters = L.cum[j] - L.cum[boardIdx];
          const cost = boardCost + rideMeters * this.RIDE_W + this.TRANSFER_PENALTY;
          if (cost < (bestCost.get(sj) ?? Infinity)) {
            bestCost.set(sj, cost);
            bestTrips.set(sj, boardTrips + 1);
            parent.set(sj, { type: 'ride', line: L, boardStop: board, boardIdx, alightIdx: j });
            newMarked.add(sj);
          }
          // Conviene salire piu' avanti? (usa gli arrivi del round precedente)
          const cj = arrPrev.get(sj);
          if (cj != null && cj < boardCost) {
            boardIdx = j; board = sj; boardCost = cj; boardTrips = tripsPrev.get(sj);
          }
        }
      }

      // 3) Trasbordi a piedi dalle fermate appena raggiunte
      const transferMarked = new Set();
      for (const sid of newMarked) {
        const s = index.stopsById.get(sid);
        if (!s) continue;
        const near = this.nearbyStops(index, s.lat_actual || s.lat, s.lng_actual || s.lng, this.MAX_TRANSFER_WALK, 6);
        for (let n = 0; n < near.length; n++) {
          const nb = near[n];
          if (nb.id === sid) continue;
          const cost = bestCost.get(sid) + nb.dist * this.WALK_W;
          if (cost < (bestCost.get(nb.id) ?? Infinity)) {
            bestCost.set(nb.id, cost);
            bestTrips.set(nb.id, bestTrips.get(sid));
            parent.set(nb.id, { type: 'walk', from: sid, meters: nb.dist });
            transferMarked.add(nb.id);
          }
        }
      }

      marked = new Set([...newMarked, ...transferMarked]);
      if (marked.size === 0) break;
    }

    if (!parent.has(destId)) return null; // destinazione non raggiungibile nei limiti

    // --- Ricostruzione itinerario ---
    const legsRev = [];
    let cur = destId;
    let guard = 0;
    while (cur !== 'USER' && cur != null && guard++ < 50) {
      const p = parent.get(cur);
      if (!p) break;
      if (p.type === 'ride') {
        legsRev.push({ kind: 'ride', line: p.line, boardIdx: p.boardIdx, alightIdx: p.alightIdx, boardId: p.boardStop, alightId: cur });
        cur = p.boardStop;
      } else {
        legsRev.push({ kind: 'walk', fromId: p.from, toId: cur, meters: p.meters, elevGain: p.elevGain });
        cur = p.from;
      }
    }
    legsRev.reverse();

    return this._materialize(index, legsRev, originLatLng, destStop, bestTrips.get(destId) || 0);
  }

  /* Converte i leg astratti in leg concreti con coordinate e testi */
  _materialize(index, legs, originLatLng, destStop, transfers) {
    const out = [];
    let totalWalk = 0, totalRide = 0, rideStops = 0;

    for (let i = 0; i < legs.length; i++) {
      const lg = legs[i];
      if (lg.kind === 'walk') {
        const fromLL = lg.fromId === 'USER'
          ? originLatLng
          : this._stopLL(index, lg.fromId);
        const toStop = index.stopsById.get(lg.toId);
        const toLL = this._stopLL(index, lg.toId);
        if (!fromLL || !toLL) continue;
        const meters = lg.meters != null ? lg.meters : this.haversine(fromLL, toLL);
        totalWalk += meters;
        out.push({
          type: 'walk',
          isOrigin: lg.fromId === 'USER',
          fromLatLng: fromLL,
          toStop: toStop,
          toName: toStop ? toStop.name : 'Fermata',
          coords: [fromLL, toLL],
          meters: Math.round(meters),
          seconds: Math.round(meters / 1.35),
          elevGain: (lg.elevGain != null) ? Math.round(lg.elevGain) : null
        });
      } else {
        const L = lg.line;
        const bIdx = lg.boardIdx, aIdx = lg.alightIdx;
        const seq = L.ids.slice(bIdx, aIdx + 1);
        const coords = L.coords.slice(bIdx, aIdx + 1).map(c => [c[0], c[1]]);
        const meters = L.cum[aIdx] - L.cum[bIdx];
        totalRide += meters;
        rideStops += (aIdx - bIdx);
        const boardStop = index.stopsById.get(lg.boardId);
        const alightStop = index.stopsById.get(lg.alightId);
        out.push({
          type: 'ride',
          line: L.ref,
          boardStop, alightStop,
          boardName: boardStop ? boardStop.name : 'Fermata',
          alightName: alightStop ? alightStop.name : 'Fermata',
          coords,
          stopsCount: aIdx - bIdx,
          seqIds: seq,
          meters: Math.round(meters)
        });
      }
    }

    if (out.length === 0) return null;

    return {
      legs: out,
      transfers: Math.max(0, transfers - 1),
      rideCount: out.filter(l => l.type === 'ride').length,
      totalWalkMeters: Math.round(totalWalk),
      totalRideMeters: Math.round(totalRide),
      rideStops,
      destinationStop: destStop
    };
  }

  _stopLL(index, id) {
    const s = index.stopsById.get(id);
    if (!s) return null;
    return [s.lat_actual || s.lat, s.lng_actual || s.lng];
  }
}

function initJourneyPlanner() {
  if (!window.journeyPlanner) {
    window.journeyPlanner = new JourneyPlanner();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initJourneyPlanner);
} else {
  initJourneyPlanner();
}
