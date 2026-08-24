/**
 * ITALIABUS - DATA NORMALIZER
 *
 * Molte linee (soprattutto pullman importate da GTFS) hanno come "name" solo la
 * sigla di percorso (es. "279 A A") invece di un nome leggibile. Qui, a runtime,
 * rigeneriamo un nome chiaro dai capolinea reali ("Reggio Calabria ⇄ Catanzaro"),
 * lasciando intatti i nomi gia' descrittivi. Non modifica il file dati (9.6 MB):
 * agisce sugli oggetti in memoria che tutte le sezioni leggono.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

(function () {
  "use strict";

  function run() {
    var TD = window.TRANSIT_DATA;
    if (!TD || !TD.modes) return;

    var fixed = 0;
    for (var key in TD.modes) {
      var mode = TD.modes[key];
      if (!mode || !mode.lines || !mode.stops) continue;

      // Indice fermate O(1)
      var byId = new Map();
      for (var i = 0; i < mode.stops.length; i++) byId.set(mode.stops[i].id, mode.stops[i]);

      for (var j = 0; j < mode.lines.length; j++) {
        var l = mode.lines[j];
        if (!needsRename(l)) continue;
        var ids = l.stopsIds || l.stops || [];
        if (ids.length < 2) continue;
        var s0 = byId.get(ids[0]);
        var sN = byId.get(ids[ids.length - 1]);
        var nm = buildName(s0, sN);
        if (nm) {
          if (!l._originalName) l._originalName = l.name; // conserva l'originale
          l.name = nm;
          fixed++;
        }
      }
    }
    if (fixed) console.log("[data-normalize] nomi linea rigenerati:", fixed);
  }

  // Un nome e' "buono" se contiene un separatore di percorso; altrimenti e' una sigla
  function needsRename(l) {
    var n = (l && l.name ? String(l.name) : "").trim();
    if (!n) return true;
    if (/[⇄➔→]/.test(n)) return false;          // "A ⇄ B" / "A ➔ B"
    if (/\s[-–]\s/.test(n)) return false;         // "Autolinea X - Verona FS"
    if (/:/.test(n) && n.length > 12) return false; // "Linea 1: ... "
    return true; // es. "279 A A", "138 C A"
  }

  function labelArea(stop) {
    if (!stop) return null;
    if (stop.area && String(stop.area).trim()) return String(stop.area).trim();
    return null;
  }

  function shortStopName(stop) {
    if (!stop) return null;
    var n = String(stop.name || "").trim();
    if (!n) return null;
    // "Via G. Matteotti, 1 - Corigliano" -> pezzo piu' significativo
    var parts = n.split(" - ").map(function (s) { return s.trim(); }).filter(Boolean);
    // scarta i civici tipo "Via X, 12"
    var candidate = parts[0] || n;
    return candidate.replace(/,\s*\d+\w*$/, "").trim();
  }

  function buildName(s0, sN) {
    var oA = labelArea(s0), dA = labelArea(sN);
    if (oA && dA && oA.toLowerCase() !== dA.toLowerCase()) {
      return oA + " ⇄ " + dA;
    }
    // stessa area (linea urbana) o area mancante: usa i nomi delle fermate
    var oS = shortStopName(s0), dS = shortStopName(sN);
    if (oS && dS && oS.toLowerCase() !== dS.toLowerCase()) {
      return oS + " ⇄ " + dS;
    }
    if (oA || oS) return (oA || oS) + " (Servizio Urbano)";
    return null;
  }

  if (window.TRANSIT_DATA) {
    run();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
