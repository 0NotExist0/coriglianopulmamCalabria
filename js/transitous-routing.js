/**
 * ITALIABUS - TRANSITOUS / MOTIS ROUTING (rete pubblica REALE, gratis, no key)
 *
 * Per le tratte che la rete locale non copre (soprattutto lunghe/interregionali)
 * usa il servizio pubblico e GRATUITO Transitous (motore MOTIS) che aggrega i
 * feed GTFS reali: restituisce itinerari multimodali VERI (bus + treni + metro),
 * con orari e coincidenze reali — come Google Maps ma senza chiave API.
 *
 * API: https://api.transitous.org/api/v1/plan (CORS aperto, chiamabile dalla WebView)
 * Geometrie: encoded polyline PRECISIONE 7.
 *
 * Converte l'itinerario nel formato "legs" dell'app, quindi mappa e pannello
 * passo-passo funzionano identici agli altri motori.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

(function () {
  "use strict";

  var BASE = "https://api.transitous.org/api/v1/plan";

  function haversine(a, b) {
    var R = 6371000, tr = function (d) { return d * Math.PI / 180; };
    var dLat = tr(b[0] - a[0]), dLng = tr(b[1] - a[1]);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(tr(a[0])) * Math.cos(tr(b[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Decodifica una polyline codificata con PRECISIONE 7 (MOTIS)
  function decodePolyline(str, precision) {
    if (!str) return [];
    var factor = Math.pow(10, precision || 7);
    var index = 0, lat = 0, lng = 0, out = [], b, shift, result;
    while (index < str.length) {
      shift = 0; result = 0;
      do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      out.push([lat / factor, lng / factor]);
    }
    return out;
  }

  var TransitousRouting = {
    enabled: true,

    available: function () {
      return this.enabled && (typeof fetch === 'function') && (typeof AbortController === 'function');
    },

    plan: function (originLatLng, destStop, opts) {
      opts = opts || {};
      if (!this.available() || !originLatLng || !destStop) return Promise.resolve(null);
      var dLat = destStop.lat_actual || destStop.lat;
      var dLng = destStop.lng_actual || destStop.lng;
      if (dLat == null || dLng == null) return Promise.resolve(null);

      var url = BASE +
        "?fromPlace=" + originLatLng[0] + "," + originLatLng[1] +
        "&toPlace=" + dLat + "," + dLng +
        "&arriveBy=false&timetableView=false";

      var self = this;
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, opts.timeout || 12000);

      return fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
        .then(function (res) { clearTimeout(timer); return res.ok ? res.json() : null; })
        .then(function (data) {
          if (!data || !data.itineraries || !data.itineraries.length) return null;
          // scegli l'itinerario piu' veloce
          var best = data.itineraries[0];
          for (var i = 1; i < data.itineraries.length; i++) {
            if ((data.itineraries[i].duration || 1e15) < (best.duration || 1e15)) best = data.itineraries[i];
          }
          return self._toItinerary(best, destStop);
        })
        .catch(function (e) { clearTimeout(timer); console.warn("transitous.plan:", e && e.message); return null; });
    },

    _code: function (l) {
      var rs = l.routeShortName || l.tripShortName || '';
      if (rs) return String(rs);
      var m = l.mode || '';
      if (m === 'BUS') return 'Bus';
      if (m === 'SUBWAY') return 'Metro';
      if (m === 'TRAM') return 'Tram';
      if (/RAIL|LONG_DISTANCE/.test(m)) return 'Treno';
      return 'Linea';
    },

    _color: function (l) {
      if (l.routeColor) return (String(l.routeColor)[0] === '#') ? l.routeColor : ('#' + l.routeColor);
      var m = l.mode || '';
      if (/HIGHSPEED|LONG_DISTANCE/.test(m)) return '#dc2626';
      if (/RAIL/.test(m)) return '#b91c1c';
      if (m === 'SUBWAY') return '#7c3aed';
      if (m === 'TRAM') return '#059669';
      if (m === 'BUS') return '#0284c7';
      return '#0284c7';
    },

    _toItinerary: function (it, destStop) {
      var legsIn = it.legs || [];
      var legs = [];
      var totalWalk = 0, totalRide = 0, rideStops = 0, rideCount = 0, firstWalkSeen = false;

      for (var i = 0; i < legsIn.length; i++) {
        var l = legsIn[i];
        var coords = decodePolyline(l.legGeometry && l.legGeometry.points, 7);
        if (coords.length < 2) {
          var a = l.from && [l.from.lat, l.from.lon];
          var b = l.to && [l.to.lat, l.to.lon];
          coords = (a && b) ? [a, b] : [];
        }
        if (coords.length < 2) continue;

        var meters = Math.round((l.distance != null) ? l.distance : this._pathMeters(coords));
        var seconds = Math.round(l.duration || ((Date.parse(l.endTime) - Date.parse(l.startTime)) / 1000) || (meters / 1.35));

        if (l.mode === 'WALK') {
          var toLL = coords[coords.length - 1];
          totalWalk += meters;
          var isOrigin = !firstWalkSeen;
          firstWalkSeen = true;
          legs.push({
            type: 'walk', isOrigin: isOrigin,
            fromLatLng: coords[0],
            toStop: { id: 'tt_w' + i, name: (l.to && l.to.name) || 'Punto', lat: toLL[0], lng: toLL[1] },
            toName: null,
            coords: coords, meters: meters, seconds: seconds, elevGain: null
          });
        } else {
          var nStops = (l.intermediateStops ? l.intermediateStops.length + 1 : 1);
          totalRide += meters; rideStops += nStops; rideCount++;
          legs.push({
            type: 'ride',
            line: { code: this._code(l), name: l.routeLongName || l.headsign || l.displayName || '', color: this._color(l) },
            boardStop: { id: 'tt_b' + i, name: (l.from && l.from.name) || 'Fermata', lat: l.from.lat, lng: l.from.lon },
            alightStop: { id: 'tt_a' + i, name: (l.to && l.to.name) || 'Fermata', lat: l.to.lat, lng: l.to.lon },
            boardName: (l.from && l.from.name) || 'Fermata',
            alightName: (l.to && l.to.name) || 'Fermata',
            coords: coords, stopsCount: nStops, meters: meters,
            agency: l.agencyName || ''
          });
        }
      }

      // Riempi le label dei tratti a piedi con la fermata di salita successiva
      for (var k = 0; k < legs.length; k++) {
        if (legs[k].type === 'walk' && !legs[k].toName) {
          var next = legs[k + 1];
          legs[k].toName = (next && next.boardName) ? next.boardName : (destStop.name || 'Destinazione');
          if (next && next.type === 'ride') legs[k].toStop.name = next.boardName;
        }
      }

      if (!legs.length || rideCount === 0) return null;

      return {
        legs: legs,
        transfers: Math.max(0, rideCount - 1),
        rideCount: rideCount,
        totalWalkMeters: Math.round(totalWalk),
        totalRideMeters: Math.round(totalRide),
        rideStops: rideStops,
        destinationStop: destStop,
        source: 'transitous'
      };
    },

    _pathMeters: function (coords) {
      var m = 0;
      for (var i = 1; i < coords.length; i++) m += haversine(coords[i - 1], coords[i]);
      return m;
    }
  };

  window.transitousRouting = TransitousRouting;
})();
