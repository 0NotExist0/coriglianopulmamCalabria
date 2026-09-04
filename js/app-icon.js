/**
 * ITALIARUN — SELETTORE ICONA APP
 * Permette di scegliere l'icona dell'app dalla Personalizzazione.
 *  - Le varianti sono immagini reali in img/icone/ (thumbnail nel selettore +
 *    riflesso su favicon / PWA / apple-touch così il cambio si vede subito).
 *  - La scelta è persistita in localStorage e inviata a Unity con
 *    invokeUnity('set_app_icon:<id>') per cambiare l'ICONA LAUNCHER NATIVA
 *    (richiede supporto lato Unity; se il bridge non gestisce il messaggio è
 *    un no-op innocuo).
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";

  var LS_KEY = "ib_app_icon";
  var VER = "5.36";

  // NB: gli id DEVONO combaciare con quelli gestiti lato Unity per l'icona launcher.
  var ICONS = [
    { id: "viaggia", label: "VIAGGIA", sub: "Sfondo trasparente", img: "img/icone/viaggia-classica.png", accent: "#0284c7" },
    { id: "viaggia_blu", label: "VIAGGIA Blu", sub: "Sfondo pieno blu", img: "img/icone/viaggia-blu.png", accent: "#1d4ed8" }
  ];

  function lsGet() { try { return localStorage.getItem(LS_KEY) || "viaggia"; } catch (e) { return "viaggia"; } }
  function lsSet(v) { try { localStorage.setItem(LS_KEY, v); } catch (e) {} }
  function byId(id) { for (var i = 0; i < ICONS.length; i++) { if (ICONS[i].id === id) return ICONS[i]; } return ICONS[0]; }
  function current() { return byId(lsGet()); }

  function setLink(rel, sizes, href) {
    var sel = 'link[rel="' + rel + '"]' + (sizes ? '[sizes="' + sizes + '"]' : '');
    var el = document.head ? document.head.querySelector(sel) : null;
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      if (sizes) el.setAttribute('sizes', sizes);
      (document.head || document.documentElement).appendChild(el);
    }
    el.setAttribute('type', 'image/png');
    el.setAttribute('href', href + '?ic=' + current().id + '&v=' + VER);
  }

  // Riflesso web (favicon / PWA / apple-touch). Chiamato a ogni caricamento: NON
  // invia il segnale nativo, così non si ri-triggera Unity a ogni avvio.
  function apply() {
    var ic = current();
    setLink('icon', '512x512', ic.img);
    setLink('icon', '192x192', ic.img);
    setLink('apple-touch-icon', '', ic.img);
    try {
      var tc = document.querySelector('meta[name="theme-color"]');
      if (tc && ic.accent) tc.setAttribute('content', ic.accent);
    } catch (e) {}
  }

  function select(id) {
    if (!ICONS.some(function (i) { return i.id === id; })) return;
    lsSet(id);
    apply();
    // Icona LAUNCHER nativa (Unity) — solo su scelta esplicita dell'utente.
    // Convenzione messaggi con parametro: "<comando>|||<payload>". No-op se il
    // bridge nativo non gestisce il messaggio (es. in browser).
    try { if (window.invokeUnity) window.invokeUnity('set_app_icon|||' + id); } catch (e) {}
    if (window.appIcon && typeof window.appIcon._render === "function") window.appIcon._render();
  }

  // Android azzera lo stato dei componenti (activity-alias) ai default del manifest
  // ad ogni AGGIORNAMENTO dell'app. Se l'utente aveva scelto un'icona diversa da
  // quella di default, la ri-applichiamo lato nativo una volta al caricamento.
  function syncNativeIfNeeded() {
    var id = current().id;
    if (id && id !== ICONS[0].id) {
      try { if (window.invokeUnity) window.invokeUnity('set_app_icon|||' + id); } catch (e) {}
    }
  }

  function boot() { apply(); syncNativeIfNeeded(); }

  window.appIcon = {
    apply: apply,
    select: select,
    list: function () { return ICONS.slice(); },
    current: function () { return current().id; },
    _render: null
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
