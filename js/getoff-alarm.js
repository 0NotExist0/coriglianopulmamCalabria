/**
 * ITALIABUS - ALLARME DISCESA ("Svegliami alla fermata")
 *
 * Avvisa con SUONO + VIBRAZIONE + VOCE di sistema quando ti trovi entro N metri
 * (300 / 400 / 500) dalla fermata di DESTINAZIONE. Pensato per bus/treno: puoi
 * rilassarti o chiudere gli occhi e l'app ti sveglia prima di scendere.
 *
 * Funziona ad app aperta (schermo acceso, o spento con Wake Lock dove supportato).
 * Usa la voce di sistema del telefono via Web Speech API — nessun modello da bundlare.
 *
 * Aggancio GPS: riceve le posizioni dal navigatore (geo-locator.onLivePosition ->
 * getOffAlarm.notifyPosition). Se il tracciamento non è attivo, all'attivazione lo avvia.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";

  var RADII = [300, 400, 500];
  var ARRIVE_M = 90;                 // soglia "scendi ora"
  var LS_RADIUS = "ib_getoff_radius";

  var state = {
    armed: false,
    target: null,                    // {lat, lng, name}
    firedApproach: false,
    firedArrive: false,
    startedTracking: false,          // true se siamo stati noi ad avviare il GPS
    wakeLock: null,
    lastDist: null
  };

  var audioCtx = null;

  // ---------------- utilità ----------------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function getRadius() {
    var v = parseInt(lsGet(LS_RADIUS), 10);
    return (RADII.indexOf(v) !== -1) ? v : 400;
  }
  function setRadius(m) {
    m = parseInt(m, 10);
    if (RADII.indexOf(m) === -1) return;
    lsSet(LS_RADIUS, String(m));
    updateUI();
    if (state.armed) {
      toast("Sveglia aggiornata: ti avviso a " + m + " m.", "info", "fa-bell");
      // Ricontrolla subito: se sei già dentro il nuovo raggio, deve scattare.
      state.firedApproach = false;
      if (state.lastDist != null) evaluate(state.lastDist);
    }
  }

  function haversine(aLat, aLng, bLat, bLng) {
    var R = 6371000, toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------------- voce di sistema (TTS) ----------------
  function pickItalianVoice() {
    try {
      var voices = window.speechSynthesis.getVoices() || [];
      var it = voices.filter(function (v) { return /^it(-|_)/i.test(v.lang) || /ital/i.test(v.name); });
      return it.length ? it[0] : null;
    } catch (e) { return null; }
  }
  function speak(text) {
    // Se la guida vocale è caricata, usa la sua voce (rispetta voce/velocità scelte).
    if (window.voiceGuide && window.voiceGuide !== undefined && typeof window.voiceGuide.speak === "function" && window.voiceGuide.speak !== speak) {
      try { window.voiceGuide.speak(text, { force: true }); return; } catch (e) {}
    }
    try {
      if (!("speechSynthesis" in window)) return;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "it-IT";
      var v = pickItalianVoice();
      if (v) u.voice = v;
      u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  // Riutilizzabile dalla futura guida vocale turn-by-turn.
  window.ibSpeak = speak;

  // ---------------- suono ----------------
  function ensureAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  function beep(times) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var t = ctx.currentTime;
    for (var i = 0; i < times; i++) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var start = t + i * 0.28;
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, start);
      osc.frequency.exponentialRampToValueAtTime(1320, start + 0.09);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start); osc.stop(start + 0.26);
    }
  }

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }

  // ---------------- wake lock (tiene lo schermo per l'avviso) ----------------
  function acquireWakeLock() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request("screen").then(function (wl) { state.wakeLock = wl; }).catch(function () {});
      }
    } catch (e) {}
  }
  function releaseWakeLock() {
    try { if (state.wakeLock) { state.wakeLock.release(); state.wakeLock = null; } } catch (e) {}
  }
  // Ri-acquisisce il wake lock quando la scheda torna visibile (viene rilasciato in background).
  document.addEventListener("visibilitychange", function () {
    if (state.armed && document.visibilityState === "visible" && !state.wakeLock) acquireWakeLock();
  });

  // ---------------- destinazione dal navigatore ----------------
  function deriveTarget() {
    var gl = window.geoLocator;
    if (!gl) return null;
    var d = gl.selectedDestination;
    if (d && typeof d.lat === "number" && typeof d.lng === "number") {
      return { lat: d.lat, lng: d.lng, name: d.name || "destinazione" };
    }
    var it = gl.activeItinerary;
    var ds = it && it.destinationStop;
    if (ds && typeof ds.lat === "number" && typeof ds.lng === "number") {
      return { lat: ds.lat, lng: ds.lng, name: ds.name || "destinazione" };
    }
    return null;
  }

  // ---------------- notifiche/toast ----------------
  function notify(title, body) {
    var nm = window.notificationManager;
    if (nm && typeof nm.send === "function") {
      nm.send(title, body, { type: "warning", icon: "fa-bell", tabTarget: "map", sound: false, sendNative: true, showToast: true });
    }
  }
  function toast(html, type, icon) {
    var nm = window.notificationManager;
    if (nm && typeof nm.showToast === "function") nm.showToast(html, type || "info", icon || "fa-bell");
  }

  // ---------------- ciclo di valutazione ----------------
  function evaluate(dist) {
    var r = getRadius();
    if (!state.firedArrive && dist <= ARRIVE_M) {
      state.firedArrive = true;
      fireArrive();
      setTimeout(function () { disarm(true); }, 4500);
      return;
    }
    if (!state.firedApproach && dist <= r) {
      state.firedApproach = true;
      fireApproach(dist);
    }
  }

  function notifyPosition(lat, lng) {
    if (!state.armed || !state.target) return;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    var dist = haversine(lat, lng, state.target.lat, state.target.lng);
    state.lastDist = dist;
    updateDistUI(dist);
    evaluate(dist);
  }

  function fireApproach(dist) {
    beep(2);
    vibrate([300, 150, 300, 150, 600]);
    var m = Math.max(50, Math.round(dist / 10) * 10);
    speak("Preparati a scendere. Tra circa " + m + " metri arrivi a " + state.target.name + ".");
    notify("Preparati a scendere 🔔", "Tra circa " + m + " m arrivi a " + state.target.name + ".");
  }
  function fireArrive() {
    beep(3);
    vibrate([500, 200, 500, 200, 800]);
    speak("Sei arrivato a " + state.target.name + ". Scendi adesso.");
    notify("Sei arrivato! 🚏", "Scendi a " + state.target.name + ".");
  }

  // ---------------- attiva / disattiva ----------------
  function arm(target) {
    target = target || deriveTarget();
    if (!target) {
      toast("Prima scegli una destinazione sulla mappa, poi attiva la sveglia.", "warning", "fa-triangle-exclamation");
      return false;
    }
    state.armed = true;
    state.target = target;
    state.firedApproach = false;
    state.firedArrive = false;
    state.lastDist = null;

    ensureAudio();          // sblocca l'audio finché siamo in un gesto utente
    acquireWakeLock();

    // Assicura il flusso GPS: se il navigatore non sta già tracciando, avvialo.
    var gl = window.geoLocator;
    if (gl && !gl.tracking && typeof gl.startLiveTracking === "function") {
      gl.startLiveTracking();
      state.startedTracking = true;
    }

    var r = getRadius();
    speak("Sveglia impostata. Ti avviso a " + r + " metri da " + target.name + ".");
    toast('<strong>Sveglia attiva</strong><br><small>Ti avviso a ' + r + ' m da ' + escapeHtml(target.name) + '</small>', "success", "fa-bell");
    updateUI();

    // Se abbiamo già una posizione nota, valuta subito.
    if (gl && gl.userLatLng) notifyPosition(gl.userLatLng[0], gl.userLatLng[1]);
    return true;
  }

  function disarm(silent) {
    var wasArmed = state.armed;
    state.armed = false;
    state.target = null;
    releaseWakeLock();

    // Se il tracciamento l'avevamo avviato noi e non c'è una navigazione in corso, fermalo.
    var gl = window.geoLocator;
    if (state.startedTracking && gl && !gl.activeItinerary && typeof gl.stopLiveTracking === "function") {
      gl.stopLiveTracking();
    }
    state.startedTracking = false;
    updateUI();
    if (!silent && wasArmed) toast("Sveglia disattivata.", "info", "fa-bell-slash");
  }

  function toggle(target) { if (state.armed) disarm(); else arm(target); }
  function toggleFromNav() { toggle(null); }

  // ---------------- UI (bottone nei controlli del navigatore) ----------------
  function injectStyles() {
    if (document.getElementById("getoffAlarmStyle")) return;
    var st = document.createElement("style");
    st.id = "getoffAlarmStyle";
    st.textContent =
      ".geo-getoff-btn.active{background:linear-gradient(135deg,#dc2626,#b91c1c)!important;color:#fff!important;border-color:#dc2626!important;box-shadow:0 4px 14px rgba(220,38,38,.35)}" +
      ".geo-getoff-btn.active i{animation:goffRing 1.1s ease-in-out infinite}" +
      "@keyframes goffRing{0%,100%{transform:rotate(0)}20%{transform:rotate(-14deg)}40%{transform:rotate(12deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(4deg)}}" +
      ".goff-dist{margin-left:auto;font-weight:800;font-size:.82rem;opacity:.95}" +
      ".geo-getoff-radius{display:none;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap}" +
      ".goff-r-label{font-size:.72rem;color:#94a3b8;font-weight:700;margin-right:2px}" +
      ".goff-r-btn{border:1.5px solid rgba(148,163,184,.4);background:rgba(148,163,184,.08);color:inherit;border-radius:999px;padding:3px 10px;font-size:.75rem;font-weight:700;cursor:pointer}" +
      ".goff-r-btn.active{border-color:#dc2626;background:rgba(220,38,38,.15);color:#dc2626}";
    document.head.appendChild(st);
  }

  function updateUI() {
    var btn = document.getElementById("geoGetOffBtn");
    if (btn) {
      btn.classList.toggle("active", state.armed);
      var label = btn.querySelector(".goff-label");
      if (label) label.textContent = state.armed ? "Sveglia attiva" : "Svegliami alla fermata";
      if (!state.armed) { var d = document.getElementById("geoGetOffDist"); if (d) d.textContent = ""; }
    }
    var row = document.getElementById("geoGetOffRadiusRow");
    if (row) {
      row.style.display = state.armed ? "flex" : "none";
      var r = getRadius();
      row.querySelectorAll("[data-goff-r]").forEach(function (b) {
        b.classList.toggle("active", parseInt(b.getAttribute("data-goff-r"), 10) === r);
      });
    }
  }
  function updateDistUI(dist) {
    var el = document.getElementById("geoGetOffDist");
    if (!el || !state.armed) return;
    el.textContent = dist >= 1000 ? (dist / 1000).toFixed(1) + " km" : Math.round(dist) + " m";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectStyles);
  } else {
    injectStyles();
  }

  window.getOffAlarm = {
    arm: arm,
    disarm: disarm,
    toggle: toggle,
    toggleFromNav: toggleFromNav,
    notifyPosition: notifyPosition,
    setRadius: setRadius,
    getRadius: getRadius,
    isArmed: function () { return state.armed; },
    syncUI: updateUI
  };
})();
