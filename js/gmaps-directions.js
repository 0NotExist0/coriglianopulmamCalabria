/**
 * ITALIABUS - GOOGLE DIRECTIONS (TRANSIT) — SCAFFOLD
 *
 * Predisposizione per basare gli itinerari sui percorsi REALI di Google Maps
 * (trasporto pubblico), accurati e con orari veri. DORMIENTE finche' non
 * inserisci una chiave API valida: senza chiave l'app usa il pianificatore
 * locale (journey-planner.js) come sempre.
 *
 * >>> COME ATTIVARLO <<<
 *   1. Crea una chiave in Google Cloud (abilita "Maps JavaScript API" e
 *      "Directions API") con FATTURAZIONE attiva.
 *   2. Limita la chiave (per package Android / bundle iOS / referrer) — in
 *      un'app client la chiave e' visibile, quindi va sempre ristretta.
 *   3. Incolla la chiave qui sotto in GMAPS_CONFIG.apiKey (oppure imposta
 *      window.GMAPS_CONFIG = { apiKey: "..." } prima del caricamento).
 *
 * Restituisce itinerari nello STESSO formato del pianificatore locale
 * (legs walk/ride) cosi' la mappa e il pannello passo-passo funzionano uguale.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

window.GMAPS_CONFIG = window.GMAPS_CONFIG || {
  apiKey: "",        // <-- INCOLLA QUI LA CHIAVE GOOGLE MAPS PER ATTIVARE
  language: "it",
  region: "IT"
};

(function () {
  "use strict";

  var sdkPromise = null;

  function haversine(a, b) {
    var R = 6371000, toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
    var la1 = toRad(a[0]), la2 = toRad(b[0]);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  var GmapsDirections = {
    available: function () {
      return !!(window.GMAPS_CONFIG && window.GMAPS_CONFIG.apiKey);
    },

    /* Carica una sola volta l'SDK Google Maps JS (evita problemi CORS del REST) */
    ensureSdk: function () {
      if (window.google && window.google.maps && window.google.maps.DirectionsService) {
        return Promise.resolve(window.google.maps);
      }
      if (sdkPromise) return sdkPromise;
      if (!this.available()) return Promise.reject(new Error("Nessuna chiave Google Maps"));

      sdkPromise = new Promise(function (resolve, reject) {
        var cbName = "__gmapsReady_" + Date.now();
        window[cbName] = function () {
          try { delete window[cbName]; } catch (e) {}
          resolve(window.google.maps);
        };
        var s = document.createElement("script");
        var key = encodeURIComponent(window.GMAPS_CONFIG.apiKey);
        var lang = encodeURIComponent(window.GMAPS_CONFIG.language || "it");
        var reg = encodeURIComponent(window.GMAPS_CONFIG.region || "IT");
        s.src = "https://maps.googleapis.com/maps/api/js?key=" + key +
                "&libraries=geometry&language=" + lang + "&region=" + reg +
                "&callback=" + cbName;
        s.async = true;
        s.defer = true;
        s.onerror = function () { sdkPromise = null; reject(new Error("Caricamento SDK Google Maps fallito")); };
        document.head.appendChild(s);
      });
      return sdkPromise;
    },

    /* Pianifica in TRASPORTO PUBBLICO reale. Ritorna itinerario {legs,...} o null. */
    plan: function (originLatLng, destStop, opts) {
      opts = opts || {};
      if (!this.available() || !originLatLng || !destStop) return Promise.resolve(null);
      var dLat = destStop.lat_actual || destStop.lat;
      var dLng = destStop.lng_actual || destStop.lng;
      if (dLat == null || dLng == null) return Promise.resolve(null);

      var self = this;
      return this.ensureSdk().then(function (maps) {
        return new Promise(function (resolve) {
          var svc = new maps.DirectionsService();
          svc.route({
            origin: { lat: originLatLng[0], lng: originLatLng[1] },
            destination: { lat: dLat, lng: dLng },
            travelMode: maps.TravelMode.TRANSIT,
            transitOptions: { modes: opts.transitModes || undefined },
            provideRouteAlternatives: false
          }, function (result, status) {
            if (status !== "OK" || !result || !result.routes || !result.routes.length) {
              resolve(null);
              return;
            }
            try {
              resolve(self._toItinerary(result.routes[0], destStop));
            } catch (e) {
              console.warn("gmaps _toItinerary error:", e);
              resolve(null);
            }
          });
        });
      }).catch(function (e) {
        console.warn("gmapsDirections.plan:", e && e.message);
        return null;
      });
    },

    /* Converte una route di Google nel formato legs dell'app */
    _toItinerary: function (route, destStop) {
      var gleg = route.legs && route.legs[0];
      if (!gleg || !gleg.steps) return null;

      var legs = [];
      var totalWalk = 0, totalRide = 0, rideStops = 0, rideCount = 0;
      var firstWalkSeen = false;

      for (var i = 0; i < gleg.steps.length; i++) {
        var st = gleg.steps[i];
        var coords = (st.path || []).map(function (p) { return [p.lat(), p.lng()]; });
        if (coords.length < 2 && st.start_location && st.end_location) {
          coords = [[st.start_location.lat(), st.start_location.lng()],
                    [st.end_location.lat(), st.end_location.lng()]];
        }
        var meters = st.distance ? st.distance.value : 0;
        var seconds = st.duration ? st.duration.value : Math.round(meters / 1.35);

        if (st.travel_mode === "WALKING") {
          var toLL = coords[coords.length - 1];
          totalWalk += meters;
          var isOrigin = !firstWalkSeen;
          firstWalkSeen = true;
          legs.push({
            type: "walk",
            isOrigin: isOrigin,
            fromLatLng: coords[0],
            toStop: { id: "g_walk_" + i, name: (st.transit && st.transit.arrival_stop) ? st.transit.arrival_stop.name : "Punto di salita", lat: toLL[0], lng: toLL[1] },
            toName: null,
            coords: coords,
            meters: Math.round(meters),
            seconds: Math.round(seconds),
            elevGain: null
          });
        } else if (st.travel_mode === "TRANSIT" && st.transit) {
          var td = st.transit;
          var line = td.line || {};
          var dep = td.departure_stop || {};
          var arr = td.arrival_stop || {};
          var boardLL = dep.location ? [dep.location.lat(), dep.location.lng()] : coords[0];
          var arrLL = arr.location ? [arr.location.lat(), arr.location.lng()] : coords[coords.length - 1];
          totalRide += meters;
          rideStops += (td.num_stops || 1);
          rideCount++;
          legs.push({
            type: "ride",
            line: {
              code: line.short_name || line.name || "Mezzo",
              name: line.name || (td.headsign ? ("➔ " + td.headsign) : "Linea"),
              color: line.color || "#0284c7"
            },
            boardStop: { id: "g_board_" + i, name: dep.name || "Fermata", lat: boardLL[0], lng: boardLL[1] },
            alightStop: { id: "g_alight_" + i, name: arr.name || "Fermata", lat: arrLL[0], lng: arrLL[1] },
            boardName: dep.name || "Fermata",
            alightName: arr.name || "Fermata",
            coords: coords,
            stopsCount: td.num_stops || 1,
            meters: Math.round(meters)
          });
        }
      }

      // Riempi le label toName mancanti dei tratti a piedi con la fermata di salita successiva
      for (var k = 0; k < legs.length; k++) {
        if (legs[k].type === "walk" && !legs[k].toName) {
          var next = legs[k + 1];
          legs[k].toName = (next && next.boardName) ? next.boardName : (destStop.name || "Destinazione");
          if (next && next.type === "ride") legs[k].toStop.name = next.boardName;
        }
      }

      if (legs.length === 0) return null;

      return {
        legs: legs,
        transfers: Math.max(0, rideCount - 1),
        rideCount: rideCount,
        totalWalkMeters: Math.round(totalWalk),
        totalRideMeters: Math.round(totalRide),
        rideStops: rideStops,
        destinationStop: destStop,
        source: "google"
      };
    }
  };

  window.gmapsDirections = GmapsDirections;
})();
