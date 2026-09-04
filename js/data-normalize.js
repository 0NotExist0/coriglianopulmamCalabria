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

  function enrichTrainLines(TD) {
    if (!TD || !TD.modes || !TD.modes.train) return;
    var trainMode = TD.modes.train;
    var existingIds = new Set((trainMode.lines || []).map(function(l) { return l.id; }));

    var extraTrainLines = [
      // 1. Dorsale Alta Velocità (Torino - Milano - Bologna - Firenze - Roma - Napoli - Salerno)
      {
        id: "TR_AV_TORINO_SALERNO",
        region: "lazio",
        code: "FR 9610",
        shortName: "FR 9610",
        name: "Frecciarossa 1000 AV: Torino ➔ Milano ➔ Roma ➔ Napoli ➔ Salerno",
        operator: "Trenitalia Frecciarossa AV",
        type: "high_speed",
        busModel: "ETR 1000 Frecciarossa AV (300 km/h)",
        color: "#dc2626",
        duration: 330,
        priceBase: 59.0,
        stopsIds: [
          "TRAIN_TORINO_PORTA_NUOVA",
          "TRAIN_MILANO_CENTRALE",
          "TRAIN_MILANO_GARIBALDI",
          "TRAIN_BOLOGNA_CENTRALE",
          "TRAIN_FIRENZE_SMN",
          "TRAIN_ROMA_TIBURTINA",
          "TRAIN_ROMA_TERMINI",
          "TRAIN_NAPOLI_CENTRALE",
          "TRAIN_SALERNO"
        ],
        schedule: {
          weekday: ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"],
          saturday: ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
          sunday: ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00", "21:00"]
        }
      },
      {
        id: "TR_AV_SALERNO_TORINO",
        region: "lombardia",
        code: "FR 9625",
        shortName: "FR 9625",
        name: "Frecciarossa 1000 AV: Salerno ➔ Napoli ➔ Roma ➔ Milano ➔ Torino",
        operator: "Trenitalia Frecciarossa AV",
        type: "high_speed",
        busModel: "ETR 1000 Frecciarossa AV (300 km/h)",
        color: "#dc2626",
        duration: 330,
        priceBase: 59.0,
        stopsIds: [
          "TRAIN_SALERNO",
          "TRAIN_NAPOLI_CENTRALE",
          "TRAIN_ROMA_TERMINI",
          "TRAIN_ROMA_TIBURTINA",
          "TRAIN_FIRENZE_SMN",
          "TRAIN_BOLOGNA_CENTRALE",
          "TRAIN_MILANO_CENTRALE",
          "TRAIN_MILANO_GARIBALDI",
          "TRAIN_TORINO_PORTA_NUOVA"
        ],
        schedule: {
          weekday: ["06:15", "07:15", "08:15", "09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15", "16:15", "17:15", "18:15", "19:15", "20:15"],
          saturday: ["06:15", "08:15", "10:15", "12:15", "14:15", "16:15", "18:15", "20:15"],
          sunday: ["07:15", "09:15", "11:15", "13:15", "15:15", "17:15", "19:15", "21:15"]
        }
      },
      // 2. Dorsale Tirrenica Sud (Roma Termini - Napoli - Salerno - Paola - Lamezia - Vibo - Rosarno - Villa S.G. - Reggio Calabria)
      {
        id: "TR_AV_ROMA_REGGIO",
        region: "calabria",
        code: "FR 9585",
        shortName: "FR 9585",
        name: "Frecciarossa AV: Roma Termini ➔ Salerno ➔ Paola ➔ Lamezia ➔ Reggio Calabria",
        operator: "Trenitalia Frecciarossa AV",
        type: "high_speed",
        busModel: "ETR 500 Frecciarossa AV",
        color: "#dc2626",
        duration: 295,
        priceBase: 49.0,
        stopsIds: [
          "TRAIN_ROMA_TERMINI",
          "TRAIN_NAPOLI_CENTRALE",
          "TRAIN_SALERNO",
          "TRAIN_PAOLA_FS",
          "TRAIN_LAMEZIA_CENTRALE",
          "TRAIN_VIBO_PIZZO",
          "TRAIN_ROSARNO",
          "TRAIN_GIOIA_TAURO",
          "TRAIN_VILLA_SAN_GIOVANNI",
          "TRAIN_REGGIO_CALABRIA_CENTRALE"
        ],
        schedule: {
          weekday: ["07:20", "09:40", "13:15", "15:30", "17:45", "19:20"],
          saturday: ["07:20", "11:30", "15:30", "19:20"],
          sunday: ["08:30", "13:15", "17:45", "20:10"]
        }
      },
      {
        id: "TR_AV_REGGIO_ROMA",
        region: "lazio",
        code: "FR 9588",
        shortName: "FR 9588",
        name: "Frecciarossa AV: Reggio Calabria ➔ Lamezia ➔ Paola ➔ Salerno ➔ Roma Termini",
        operator: "Trenitalia Frecciarossa AV",
        type: "high_speed",
        busModel: "ETR 500 Frecciarossa AV",
        color: "#dc2626",
        duration: 295,
        priceBase: 49.0,
        stopsIds: [
          "TRAIN_REGGIO_CALABRIA_CENTRALE",
          "TRAIN_VILLA_SAN_GIOVANNI",
          "TRAIN_GIOIA_TAURO",
          "TRAIN_ROSARNO",
          "TRAIN_VIBO_PIZZO",
          "TRAIN_LAMEZIA_CENTRALE",
          "TRAIN_PAOLA_FS",
          "TRAIN_SALERNO",
          "TRAIN_NAPOLI_CENTRALE",
          "TRAIN_ROMA_TERMINI"
        ],
        schedule: {
          weekday: ["06:48", "08:15", "11:10", "14:20", "16:40", "18:25"],
          saturday: ["06:48", "11:10", "16:40"],
          sunday: ["08:20", "14:20", "18:25"]
        }
      },
      // 3. Dorsale Jonica & Sibari - Paola - Roma AV (Frecciargento & Intercity Sibari-Roma)
      {
        id: "TR_FA_SIBARI_ROMA",
        region: "calabria",
        code: "FA 8510",
        shortName: "FA 8510",
        name: "Frecciargento AV: Crotone ➔ Corigliano ➔ Sibari ➔ Paola ➔ Roma Termini",
        operator: "Trenitalia Frecciargento AV",
        type: "high_speed",
        busModel: "ETR 600 Frecciargento Pendolino (250 km/h)",
        color: "#0284c7",
        duration: 270,
        priceBase: 42.0,
        stopsIds: [
          "TRAIN_CROTONE_FS",
          "TRAIN_CATANZARO_LIDO",
          "TRAIN_ROSSANO_FS",
          "TRAIN_CORIGLIANO_SCALO",
          "TRAIN_SIBARI_FS",
          "TRAIN_CASTIGLIONE_COSENTINO",
          "TRAIN_COSENZA_VAGLIO",
          "TRAIN_PAOLA_FS",
          "TRAIN_SALERNO",
          "TRAIN_NAPOLI_CENTRALE",
          "TRAIN_ROMA_TERMINI"
        ],
        schedule: {
          weekday: ["05:30", "06:27", "11:45", "15:20", "18:05"],
          saturday: ["06:27", "11:45", "15:20"],
          sunday: ["06:27", "14:30", "18:05"]
        }
      },
      {
        id: "TR_FA_ROMA_SIBARI",
        region: "calabria",
        code: "FA 8519",
        shortName: "FA 8519",
        name: "Frecciargento AV: Roma Termini ➔ Paola ➔ Cosenza ➔ Sibari ➔ Corigliano ➔ Crotone",
        operator: "Trenitalia Frecciargento AV",
        type: "high_speed",
        busModel: "ETR 600 Frecciargento Pendolino (250 km/h)",
        color: "#0284c7",
        duration: 270,
        priceBase: 42.0,
        stopsIds: [
          "TRAIN_ROMA_TERMINI",
          "TRAIN_NAPOLI_CENTRALE",
          "TRAIN_SALERNO",
          "TRAIN_PAOLA_FS",
          "TRAIN_COSENZA_VAGLIO",
          "TRAIN_CASTIGLIONE_COSENTINO",
          "TRAIN_SIBARI_FS",
          "TRAIN_CORIGLIANO_SCALO",
          "TRAIN_ROSSANO_FS",
          "TRAIN_CATANZARO_LIDO",
          "TRAIN_CROTONE_FS"
        ],
        schedule: {
          weekday: ["07:35", "10:15", "14:10", "17:55", "19:40"],
          saturday: ["07:35", "14:10", "17:55"],
          sunday: ["09:00", "15:30", "19:40"]
        }
      },
      // 4. Dorsale Adriatica AV / Intercity (Bari - Bologna - Venezia - Milano)
      {
        id: "TR_AV_BARI_MILANO",
        region: "puglia",
        code: "FR 8802",
        shortName: "FR 8802",
        name: "Frecciarossa Adriatico: Bari Centrale ➔ Bologna ➔ Venezia ➔ Milano",
        operator: "Trenitalia Frecciarossa AV",
        type: "high_speed",
        busModel: "ETR 500 Frecciarossa AV",
        color: "#dc2626",
        duration: 410,
        priceBase: 55.0,
        stopsIds: [
          "TRAIN_BARI_CENTRALE",
          "TRAIN_BOLOGNA_CENTRALE",
          "TRAIN_VENEZIA_SANTA_LUCIA",
          "TRAIN_MILANO_CENTRALE"
        ],
        schedule: {
          weekday: ["06:10", "08:10", "11:10", "14:10", "16:10", "18:10"],
          saturday: ["06:10", "11:10", "16:10"],
          sunday: ["08:10", "14:10", "18:10"]
        }
      },
      {
        id: "TR_AV_MILANO_BARI",
        region: "lombardia",
        code: "FR 8815",
        shortName: "FR 8815",
        name: "Frecciarossa Adriatico: Milano ➔ Venezia ➔ Bologna ➔ Bari Centrale",
        operator: "Trenitalia Frecciarossa AV",
        type: "high_speed",
        busModel: "ETR 500 Frecciarossa AV",
        color: "#dc2626",
        duration: 410,
        priceBase: 55.0,
        stopsIds: [
          "TRAIN_MILANO_CENTRALE",
          "TRAIN_VENEZIA_SANTA_LUCIA",
          "TRAIN_BOLOGNA_CENTRALE",
          "TRAIN_BARI_CENTRALE"
        ],
        schedule: {
          weekday: ["06:45", "09:45", "12:45", "15:45", "17:45"],
          saturday: ["06:45", "12:45", "17:45"],
          sunday: ["08:45", "14:45", "18:45"]
        }
      },
      // 5. Trasversale Nord AV (Torino - Genova - Milano - Bologna - Venezia)
      {
        id: "TR_AV_TORINO_VENEZIA",
        region: "veneto",
        code: "FR 9720",
        shortName: "FR 9720",
        name: "Frecciarossa Trasversale: Torino ➔ Genova ➔ Milano ➔ Bologna ➔ Venezia",
        operator: "Trenitalia Frecciarossa AV",
        type: "high_speed",
        busModel: "ETR 1000 Frecciarossa AV",
        color: "#dc2626",
        duration: 210,
        priceBase: 38.0,
        stopsIds: [
          "TRAIN_TORINO_PORTA_NUOVA",
          "TRAIN_GENOVA_PRINCIPE",
          "TRAIN_MILANO_CENTRALE",
          "TRAIN_BOLOGNA_CENTRALE",
          "TRAIN_VENEZIA_SANTA_LUCIA"
        ],
        schedule: {
          weekday: ["06:30", "08:30", "10:30", "12:30", "14:30", "16:30", "18:30", "20:30"],
          saturday: ["07:30", "11:30", "15:30", "19:30"],
          sunday: ["08:30", "12:30", "16:30", "20:30"]
        }
      },
      {
        id: "TR_AV_VENEZIA_TORINO",
        region: "piemonte",
        code: "FR 9735",
        shortName: "FR 9735",
        name: "Frecciarossa Trasversale: Venezia ➔ Bologna ➔ Milano ➔ Genova ➔ Torino",
        operator: "Trenitalia Frecciarossa AV",
        type: "high_speed",
        busModel: "ETR 1000 Frecciarossa AV",
        color: "#dc2626",
        duration: 210,
        priceBase: 38.0,
        stopsIds: [
          "TRAIN_VENEZIA_SANTA_LUCIA",
          "TRAIN_BOLOGNA_CENTRALE",
          "TRAIN_MILANO_CENTRALE",
          "TRAIN_GENOVA_PRINCIPE",
          "TRAIN_TORINO_PORTA_NUOVA"
        ],
        schedule: {
          weekday: ["06:15", "08:15", "10:15", "12:15", "14:15", "16:15", "18:15", "20:15"],
          saturday: ["07:15", "11:15", "15:15", "19:15"],
          sunday: ["08:15", "12:15", "16:15", "20:15"]
        }
      },
      // 6. Dorsale Sicilia (Palermo - Catania - Villa S.G. - Reggio - Lamezia - Roma)
      {
        id: "TR_IC_SICILIA_ROMA",
        region: "sicilia",
        code: "IC 724",
        shortName: "IC 724",
        name: "Intercity Notte / Giorno: Palermo / Catania ➔ Villa S.G. ➔ Roma Termini",
        operator: "Trenitalia Intercity",
        type: "long_distance",
        busModel: "Locomotiva E464 + Carrozze UIC-Z Climatizzate",
        color: "#0369a1",
        duration: 480,
        priceBase: 36.0,
        stopsIds: [
          "TRAIN_PALERMO_CENTRALE",
          "TRAIN_CATANIA_CENTRALE",
          "TRAIN_VILLA_SAN_GIOVANNI",
          "TRAIN_REGGIO_CALABRIA_CENTRALE",
          "TRAIN_ROSARNO",
          "TRAIN_LAMEZIA_CENTRALE",
          "TRAIN_PAOLA_FS",
          "TRAIN_ROMA_TERMINI"
        ],
        schedule: {
          weekday: ["07:00", "10:15", "13:30", "21:10"],
          saturday: ["07:00", "13:30", "21:10"],
          sunday: ["08:30", "15:00", "21:10"]
        }
      },
      {
        id: "TR_IC_ROMA_SICILIA",
        region: "sicilia",
        code: "IC 727",
        shortName: "IC 727",
        name: "Intercity Notte / Giorno: Roma Termini ➔ Lamezia ➔ Villa S.G. ➔ Catania ➔ Palermo",
        operator: "Trenitalia Intercity",
        type: "long_distance",
        busModel: "Locomotiva E464 + Carrozze UIC-Z Climatizzate",
        color: "#0369a1",
        duration: 480,
        priceBase: 36.0,
        stopsIds: [
          "TRAIN_ROMA_TERMINI",
          "TRAIN_PAOLA_FS",
          "TRAIN_LAMEZIA_CENTRALE",
          "TRAIN_ROSARNO",
          "TRAIN_REGGIO_CALABRIA_CENTRALE",
          "TRAIN_VILLA_SAN_GIOVANNI",
          "TRAIN_CATANIA_CENTRALE",
          "TRAIN_PALERMO_CENTRALE"
        ],
        schedule: {
          weekday: ["07:26", "11:26", "15:26", "22:05"],
          saturday: ["07:26", "15:26", "22:05"],
          sunday: ["09:26", "16:00", "22:05"]
        }
      },
      // 7. Regionali Veloci Calabria (Tirrenica & Jonica)
      {
        id: "TR_RV_CALABRIA_TIRRENICA",
        region: "calabria",
        code: "REG 5510",
        shortName: "RV 5510",
        name: "Regionale Veloce: Cosenza ➔ Castiglione C. ➔ Paola ➔ Lamezia ➔ Catanzaro Lido",
        operator: "Trenitalia Regionale Calabria",
        type: "regional",
        busModel: "Treno ETR 104 'Pop' / ETR 421 'Rock'",
        color: "#16a34a",
        duration: 75,
        priceBase: 6.8,
        stopsIds: [
          "TRAIN_COSENZA_VAGLIO",
          "TRAIN_CASTIGLIONE_COSENTINO",
          "TRAIN_PAOLA_FS",
          "TRAIN_LAMEZIA_CENTRALE",
          "TRAIN_CATANZARO_LIDO"
        ],
        schedule: {
          weekday: ["06:10", "07:15", "08:20", "09:40", "11:15", "13:05", "14:15", "15:40", "17:10", "18:25", "19:40", "21:00"],
          saturday: ["06:10", "08:20", "11:15", "14:15", "17:10", "19:40"],
          sunday: ["08:20", "13:05", "17:10", "20:00"]
        }
      },
      {
        id: "TR_RV_CALABRIA_TIRRENICA_R",
        region: "calabria",
        code: "REG 5515",
        shortName: "RV 5515",
        name: "Regionale Veloce: Catanzaro Lido ➔ Lamezia ➔ Paola ➔ Castiglione C. ➔ Cosenza",
        operator: "Trenitalia Regionale Calabria",
        type: "regional",
        busModel: "Treno ETR 104 'Pop' / ETR 421 'Rock'",
        color: "#16a34a",
        duration: 75,
        priceBase: 6.8,
        stopsIds: [
          "TRAIN_CATANZARO_LIDO",
          "TRAIN_LAMEZIA_CENTRALE",
          "TRAIN_PAOLA_FS",
          "TRAIN_CASTIGLIONE_COSENTINO",
          "TRAIN_COSENZA_VAGLIO"
        ],
        schedule: {
          weekday: ["06:30", "07:40", "09:00", "10:30", "12:10", "13:45", "15:00", "16:20", "17:50", "19:10", "20:30"],
          saturday: ["06:30", "09:00", "12:10", "15:00", "17:50", "20:30"],
          sunday: ["08:40", "13:45", "17:50", "20:30"]
        }
      },
      {
        id: "TR_RV_CALABRIA_JONICA",
        region: "calabria",
        code: "REG 3840",
        shortName: "RV 3840",
        name: "Regionale Jonico: Sibari ➔ Corigliano ➔ Rossano ➔ Crotone ➔ Catanzaro Lido ➔ Reggio",
        operator: "Trenitalia Regionale Calabria",
        type: "regional",
        busModel: "Treno Ibrido HTR 412 'Blues' (Elettrico/Batteria/Diesel)",
        color: "#16a34a",
        duration: 160,
        priceBase: 11.5,
        stopsIds: [
          "TRAIN_SIBARI_FS",
          "TRAIN_CORIGLIANO_SCALO",
          "TRAIN_ROSSANO_FS",
          "TRAIN_CROTONE_FS",
          "TRAIN_CATANZARO_LIDO",
          "TRAIN_REGGIO_CALABRIA_CENTRALE"
        ],
        schedule: {
          weekday: ["05:55", "07:05", "08:45", "11:20", "13:35", "15:15", "17:25", "19:10"],
          saturday: ["05:55", "08:45", "13:35", "17:25"],
          sunday: ["07:45", "13:35", "18:20"]
        }
      },
      {
        id: "TR_RV_CALABRIA_JONICA_R",
        region: "calabria",
        code: "REG 3845",
        shortName: "RV 3845",
        name: "Regionale Jonico: Reggio ➔ Catanzaro Lido ➔ Crotone ➔ Rossano ➔ Corigliano ➔ Sibari",
        operator: "Trenitalia Regionale Calabria",
        type: "regional",
        busModel: "Treno Ibrido HTR 412 'Blues' (Elettrico/Batteria/Diesel)",
        color: "#16a34a",
        duration: 160,
        priceBase: 11.5,
        stopsIds: [
          "TRAIN_REGGIO_CALABRIA_CENTRALE",
          "TRAIN_CATANZARO_LIDO",
          "TRAIN_CROTONE_FS",
          "TRAIN_ROSSANO_FS",
          "TRAIN_CORIGLIANO_SCALO",
          "TRAIN_SIBARI_FS"
        ],
        schedule: {
          weekday: ["06:15", "07:50", "09:30", "12:10", "14:15", "16:05", "18:00", "20:05"],
          saturday: ["06:15", "09:30", "14:15", "18:00"],
          sunday: ["08:15", "14:15", "19:00"]
        }
      }
    ];

    extraTrainLines.forEach(function(l) {
      if (!existingIds.has(l.id)) {
        trainMode.lines.push(l);
        existingIds.add(l.id);
      }
    });
  }

  function run() {
    var TD = window.TRANSIT_DATA;
    if (!TD || !TD.modes) return;

    // 1. Arricchimento linee ferroviarie complete dirette
    enrichTrainLines(TD);

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
