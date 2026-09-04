/**
 * ITALIABUS - FOOTER DINAMICO (contatti Comune)
 *
 * Nel footer "Assistenza & Info" la mail di contatto NON è più fissa: viene
 * ricavata dinamicamente dal COMUNE in cui si trova l'utente. Si usa la posizione
 * GPS già nota all'app (window.geoLocator.userLatLng) oppure, sul web, la
 * geolocalizzazione del browser SOLO se il permesso è già stato concesso (nessun
 * popup a sorpresa). Il comune più vicino è risolto dal gazetteer ufficiale ISTAT
 * tramite window.LocalityNormalizer.nearestComune().
 *
 * Convenzione dominio istituzionale dei Comuni italiani: comune.<nome>.<pr>.it
 * (es. "Rivarolo Canavese" (TO) -> comune.rivarolocanavese.to.it), casella
 * generica "protocollo@". È lo schema standard dei domini .it delle PA locali.
 *
 * NB: dentro l'app nativa il footer è nascosto (html.in-app .app-footer), quindi
 * questo aggiornamento è di fatto per la versione WEB, ma resta corretto ovunque.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";

  var MAIL_ID = "footerComuneMail";
  var lastKey = null; // evita riscritture inutili quando il comune non cambia

  // Slug per il dominio istituzionale: minuscolo, senza accenti/apostrofi/spazi.
  function slug(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "") // toglie i diacritici
      .replace(/['’.]/g, "")                             // apostrofi e punti
      .replace(/[^a-z0-9]+/g, "");                        // resta solo a-z0-9
  }

  function buildEmail(comune, prov) {
    var s = slug(comune);
    var p = String(prov || "").toLowerCase();
    if (!s || !p) return null;
    return "protocollo@comune." + s + "." + p + ".it";
  }

  function render(comune, prov) {
    var el = document.getElementById(MAIL_ID);
    if (!el) return;
    var email = buildEmail(comune, prov);
    if (!email) return;
    var key = comune + "|" + prov;
    if (key === lastKey) return;
    lastKey = key;

    var label = comune + (prov ? " (" + prov + ")" : "");
    el.innerHTML =
      'Comune di <strong>' + label + '</strong><br>' +
      '<a href="mailto:' + email + '">' + email + '</a>';
    var item = document.getElementById("footerComuneMailItem");
    if (item) item.title = "Contatto del Comune rilevato dalla tua posizione";
  }

  // Prova a risolvere il comune da una coppia [lat, lng].
  function updateFrom(lat, lng) {
    if (typeof lat !== "number" || typeof lng !== "number") return false;
    var LN = window.LocalityNormalizer;
    if (!LN || typeof LN.nearestComune !== "function") return false;
    var nc = LN.nearestComune(lat, lng);
    if (!nc || !nc.comune) return false;
    render(nc.comune, nc.prov);
    return true;
  }

  // 1) Posizione già nota all'app (l'utente ha usato il GPS): la osserviamo.
  function pollGeoLocator() {
    try {
      var g = window.geoLocator;
      if (g && Array.isArray(g.userLatLng)) {
        updateFrom(g.userLatLng[0], g.userLatLng[1]);
      }
    } catch (e) {}
  }

  // 2) Sul web: geolocalizzazione del browser SOLO se già autorizzata (niente prompt).
  function trySilentGeo() {
    if (!navigator.geolocation) return;
    function ask() {
      try {
        navigator.geolocation.getCurrentPosition(function (pos) {
          updateFrom(pos.coords.latitude, pos.coords.longitude);
        }, function () {}, { maximumAge: 600000, timeout: 8000, enableHighAccuracy: false });
      } catch (e) {}
    }
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" }).then(function (st) {
        if (st.state === "granted") ask();
      }).catch(function () {});
    }
    // Se le Permissions API non ci sono, non forziamo il prompt: resta il testo default.
  }

  function start() {
    pollGeoLocator();
    trySilentGeo();
    // Ricontrolla periodicamente: appena l'utente attiva il GPS, il footer si aggiorna.
    setInterval(pollGeoLocator, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
