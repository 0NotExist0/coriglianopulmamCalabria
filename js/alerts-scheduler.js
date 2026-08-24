/**
 * ITALIABUS - ALERTS SCHEDULER
 *
 * Attiva DUE tipi di notifiche che prima erano previste ma mai innescate:
 *  1) SCIOPERI: avvisa degli scioperi attivi o imminenti (prossimi 7 giorni),
 *     rilevanti per la modalita'/regione attiva. Deduplicate per non ripetere.
 *  2) PULLMAN IN ARRIVO: sulla "fermata vicina" (quella localizzata via GPS, o
 *     in mancanza la fermata selezionata) avvisa quando un mezzo sta per partire
 *     entro pochi minuti, usando gli orari reali delle linee.
 *
 * Usa window.notificationManager (toast + campanella + push nativa se concessa).
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

(function () {
  "use strict";

  var STRIKE_HORIZON_MS = 7 * 24 * 3600 * 1000; // preavviso scioperi: 7 giorni
  var BUS_WINDOW_MIN = 12;   // avvisa se un mezzo parte entro N minuti
  var BUS_MIN_MIN = 1;       // ...ma non prima di 1 minuto
  var CAT_FOR_MODE = { pullman: 'pullman', train: 'train', tram: 'tram', taxi: 'taxi', flight: 'air' };

  function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } }
  function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function prune(map, maxAgeMs) {
    var now = Date.now();
    for (var k in map) { if (now - map[k] > maxAgeMs) delete map[k]; }
    return map;
  }
  function scheduleKey() {
    var d = new Date().getDay();
    if (d === 0) return 'sunday';
    if (d === 6) return 'saturday';
    return 'weekday';
  }
  function nowMinutes() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

  var AlertsScheduler = {
    strikeTimer: null,
    busTimer: null,
    started: false,

    start: function () {
      if (this.started) return;
      this.started = true;
      var self = this;

      // Scioperi: poco dopo l'avvio, poi ogni 6 ore; e al cambio modalita'/regione
      setTimeout(function () { self.checkStrikes(); }, 4000);
      this.strikeTimer = setInterval(function () { self.checkStrikes(); }, 6 * 3600 * 1000);
      document.addEventListener('transportModeChanged', function () { setTimeout(function () { self.checkStrikes(); }, 300); });
      document.addEventListener('regionChanged', function () { setTimeout(function () { self.checkStrikes(); }, 300); });

      // Pullman in arrivo: primo check dopo 9s, poi ogni 45s
      setTimeout(function () { self.checkArrivingBuses(); }, 9000);
      this.busTimer = setInterval(function () { self.checkArrivingBuses(); }, 45000);
    },

    /* -------------------- SCIOPERI -------------------- */
    checkStrikes: function () {
      var nm = window.notificationManager;
      if (!nm || typeof nm.notifyStrike !== 'function') return;
      var strikes = (window.TRANSIT_DATA && window.TRANSIT_DATA.strikes) ||
                    (window.strikesEngine && window.strikesEngine.strikes) || [];
      if (!strikes.length) return;

      var now = Date.now();
      var mode = (typeof getActiveMode === 'function') ? getActiveMode() : 'pullman';
      var region = (typeof safeStorageGet === 'function') ? safeStorageGet('italiabus_region', 'calabria') : 'calabria';
      var relevantCat = CAT_FOR_MODE[mode] || 'pullman';

      var notified = prune(loadJSON('italiabus_strike_notified'), 30 * 24 * 3600 * 1000);

      var candidates = strikes.filter(function (s) {
        if (!s || s.status === 'revoked') return false;
        var start = Date.parse(s.startDate);
        var end = Date.parse(s.endDate);
        if (isNaN(start)) return false;
        var active = now >= start && (isNaN(end) || now <= end);
        var upcoming = start > now && start <= now + STRIKE_HORIZON_MS;
        if (!active && !upcoming) return false;
        var regionOk = s.region === 'all' || s.region === region;
        var catOk = s.category === relevantCat;
        return regionOk || catOk;
      }).sort(function (a, b) { return Date.parse(a.startDate) - Date.parse(b.startDate); });

      var count = 0;
      for (var i = 0; i < candidates.length; i++) {
        var s = candidates[i];
        if (notified[s.id]) continue;
        nm.notifyStrike(s);
        notified[s.id] = now;
        if (++count >= 3) break; // evita raffiche
      }
      saveJSON('italiabus_strike_notified', notified);
    },

    /* -------------------- PULLMAN IN ARRIVO -------------------- */
    watchedStop: function () {
      // Priorita': la fermata localizzata via GPS; in mancanza, quella selezionata
      if (window.geoLocator && window.geoLocator.nearestStop) return window.geoLocator.nearestStop;
      var id = (window.app && window.app.currentStopId) ||
               (typeof safeStorageGet === 'function' ? safeStorageGet('italiabus_stop', '') : '');
      if (id && typeof getStopById === 'function') return getStopById(id);
      return null;
    },

    checkArrivingBuses: function () {
      var nm = window.notificationManager;
      if (!nm || typeof nm.send !== 'function') return;
      var stop = this.watchedStop();
      if (!stop || !stop.id) return;

      var lines = (typeof getLinesByStop === 'function') ? getLinesByStop(stop.id) : [];
      if (!lines || !lines.length) return;

      var mode = (typeof getActiveMode === 'function') ? getActiveMode() : 'pullman';
      var vehWord = mode === 'train' ? 'Treno' : (mode === 'tram' ? 'Tram' : (mode === 'flight' ? 'Volo' : (mode === 'taxi' ? 'Taxi' : 'Bus')));
      var vehIcon = mode === 'train' ? 'fa-train' : (mode === 'tram' ? 'fa-train-tram' : (mode === 'flight' ? 'fa-plane-departure' : (mode === 'taxi' ? 'fa-taxi' : 'fa-bus')));
      var key = scheduleKey();
      var cur = nowMinutes();
      var stopShort = (stop.name || 'Fermata').split(' - ')[0].split(' (')[0];

      var notified = prune(loadJSON('italiabus_bus_notified'), 12 * 3600 * 1000);
      var fired = 0;

      for (var i = 0; i < lines.length && fired < 2; i++) {
        var l = lines[i];
        var sched = (l.schedule && (l.schedule[key] || l.schedule.weekday)) || [];
        var best = null;
        for (var t = 0; t < sched.length; t++) {
          var parts = String(sched[t]).split(':');
          var h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
          if (isNaN(h) || isNaN(m)) continue;
          var diff = (h * 60 + m) - cur;
          if (diff >= BUS_MIN_MIN && diff <= BUS_WINDOW_MIN && (!best || diff < best.diff)) {
            best = { time: sched[t], diff: diff };
          }
        }
        if (!best) continue;
        var code = l.code || l.shortName || 'Linea';
        var dedupeKey = key + '|' + stop.id + '|' + code + '|' + best.time;
        if (notified[dedupeKey]) continue;

        var dir = l.name ? (' ' + l.name) : '';
        nm.send(
          vehWord + ' in arrivo: ' + code + ' 🚏',
          'Parte tra ' + best.diff + ' min dalla fermata ' + stopShort + ' (ore ' + best.time + ').' + dir,
          { type: 'warning', icon: vehIcon, tabTarget: 'live-board', sound: true, sendNative: true, showToast: true }
        );
        notified[dedupeKey] = Date.now();
        fired++;
      }
      saveJSON('italiabus_bus_notified', notified);
    }
  };

  window.alertsScheduler = AlertsScheduler;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { AlertsScheduler.start(); });
  } else {
    AlertsScheduler.start();
  }
})();
