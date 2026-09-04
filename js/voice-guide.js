/**
 * ITALIABUS - GUIDA VOCALE NAVIGATORE
 *
 * Voce turn-by-turn (istruzioni di svolta) + avvisi vocali/sonori di
 * autovelox, tutor e limiti, usando la VOCE DI SISTEMA del telefono
 * (Web Speech API -> Android TextToSpeech). Nessun modello da bundlare.
 *
 *  - Free    : voce italiana standard del dispositivo.
 *  - Premium : scelta della voce (personalizzata) + velocità.
 *
 * Aggancio: geo-locator.setActiveItinerary -> startNavigation(navLegs);
 * onLivePosition -> onPosition(lat,lng); onArrived -> announceArrival();
 * radar-engine.triggerSpeedCameraProximityAlert -> announceCamera(cam,dist).
 *
 * Espone window.voiceGuide e (condiviso) window.ibSpeak.
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";

  var LS = { enabled: "ib_voice_enabled", radar: "ib_voice_radar", voice: "ib_voice_uri", rate: "ib_voice_rate" };

  var FAR = 350, NEAR = 120, NOW = 35, PASS = 25;   // soglie annunci (m)
  var nav = { steps: [], idx: 0, active: false };
  var audioCtx = null;

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

  function isPremium() {
    try { return !!(window._premiumUnlocked || localStorage.getItem("premium_unlocked") === "true"); }
    catch (e) { return !!window._premiumUnlocked; }
  }
  function enabled() { return lsGet(LS.enabled, "true") !== "false"; }
  function radarOn() { return lsGet(LS.radar, "true") !== "false"; }
  function getRate() { var r = parseFloat(lsGet(LS.rate, "1")); return isNaN(r) ? 1 : Math.min(1.6, Math.max(0.6, r)); }

  // ---------------- voci di sistema ----------------
  function italianVoices() {
    try { return (window.speechSynthesis.getVoices() || []).filter(function (v) { return /^it(-|_)/i.test(v.lang) || /ital/i.test(v.name); }); }
    catch (e) { return []; }
  }
  function chosenVoice() {
    var vs = italianVoices();
    var uri = lsGet(LS.voice, "");
    if (uri && isPremium()) { var f = vs.filter(function (v) { return v.voiceURI === uri; }); if (f.length) return f[0]; }
    return vs.length ? vs[0] : null;
  }

  function speak(text, opts) {
    opts = opts || {};
    if (!enabled() && !opts.force) return;
    try {
      if (!("speechSynthesis" in window)) return;
      var ss = window.speechSynthesis;
      if (opts.priority === "high") ss.cancel();   // radar: interrompe l'istruzione in corso
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "it-IT";
      var v = chosenVoice(); if (v) u.voice = v;
      u.rate = getRate(); u.pitch = 1.0; u.volume = 1.0;
      ss.speak(u);
    } catch (e) {}
  }
  // Voce condivisa con getoff-alarm.js (che la preferisce se presente).
  window.ibSpeak = speak;

  // ---------------- beep radar ----------------
  function ensureAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  function beep() {
    var ctx = ensureAudio(); if (!ctx) return;
    var t = ctx.currentTime;
    for (var i = 0; i < 2; i++) {
      var osc = ctx.createOscillator(), g = ctx.createGain(), s = t + i * 0.16;
      osc.type = "square";
      osc.frequency.setValueAtTime(1046, s);
      g.gain.setValueAtTime(0.001, s);
      g.gain.exponentialRampToValueAtTime(0.14, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.14);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(s); osc.stop(s + 0.15);
    }
  }

  function haversine(aLat, aLng, bLat, bLng) {
    var R = 6371000, toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function roundm(d) { return Math.max(10, Math.round(d / 10) * 10); }

  // ---------------- costruzione istruzione (OSRM maneuver) ----------------
  var ORD = ["", "prima", "seconda", "terza", "quarta", "quinta", "sesta", "settima"];
  function side(mod) {
    if (!mod) return "";
    if (/left/.test(mod)) return "a sinistra";
    if (/right/.test(mod)) return "a destra";
    if (mod === "uturn") return "inversione a U";
    return "";
  }
  function onStreet(name) {
    return (name && !/^(strada principale|rotonda)/i.test(name)) ? (" su " + name) : "";
  }
  function instruction(step) {
    var m = step.maneuver || {}, t = m.type || "turn", mod = m.modifier || "", name = step.name || "";
    switch (t) {
      case "turn":
      case "end of road":
        if (mod === "straight") return "Prosegui dritto" + onStreet(name);
        if (/slight/.test(mod)) return "Mantieni " + (/left/.test(mod) ? "la sinistra" : "la destra") + onStreet(name);
        if (/sharp/.test(mod)) return "Svolta stretta " + side(mod) + onStreet(name);
        if (mod === "uturn") return "Fai inversione a U";
        return "Svolta " + side(mod) + onStreet(name);
      case "roundabout":
      case "rotary":
      case "roundabout turn":
        var ex = m.exit || 2, o = ORD[ex] || (ex + "ª");
        return "Alla rotonda prendi la " + o + " uscita" + onStreet(name);
      case "fork":
        return "Al bivio tieni " + (/left/.test(mod) ? "la sinistra" : "la destra") + onStreet(name);
      case "on ramp": return "Immettiti in rampa" + onStreet(name);
      case "off ramp": return "Prendi l'uscita" + onStreet(name);
      case "merge": return "Immettiti" + onStreet(name);
      case "arrive": return "Sei arrivato a destinazione";
      default:
        return (side(mod) && mod !== "straight") ? ("Prosegui " + side(mod) + onStreet(name)) : ("Prosegui" + onStreet(name));
    }
  }
  function announceable(step) {
    var t = (step.maneuver && step.maneuver.type) || "";
    if (t === "depart" || t === "continue" || t === "new name") return false;
    return !!(step.maneuver && step.maneuver.location);
  }

  // ---------------- ciclo navigazione ----------------
  function startNavigation(navLegs) {
    resetNavigation();
    if (!navLegs) return;
    var drive = null;
    for (var i = 0; i < navLegs.length; i++) { if (navLegs[i] && navLegs[i].steps && navLegs[i].steps.length) { drive = navLegs[i]; break; } }
    if (!drive) return; // solo la modalità auto ha istruzioni turn-by-turn
    nav.steps = drive.steps.filter(announceable).map(function (s) {
      return { loc: s.maneuver.location, text: instruction(s), farFired: false, nearFired: false, nowFired: false };
    });
    nav.idx = 0;
    nav.active = nav.steps.length > 0;
    if (nav.active && enabled()) { ensureAudio(); speak("Guida vocale attiva. Parti pure."); }
  }
  function resetNavigation() { nav.steps = []; nav.idx = 0; nav.active = false; }

  function onPosition(lat, lng) {
    if (!nav.active || !enabled()) return;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    while (nav.idx < nav.steps.length) {
      var s = nav.steps[nav.idx];
      var d = haversine(lat, lng, s.loc[0], s.loc[1]);
      if (d <= PASS) { nav.idx++; continue; }         // manovra superata
      if (!s.nowFired && d <= NOW) { s.nowFired = s.nearFired = s.farFired = true; speak("Ora, " + s.text); }
      else if (!s.nearFired && d <= NEAR) { s.nearFired = s.farFired = true; speak("Tra " + roundm(d) + " metri, " + s.text); }
      else if (!s.farFired && d <= FAR) { s.farFired = true; speak("Tra " + roundm(d) + " metri, " + s.text); }
      break;                                           // valuta solo la prossima manovra
    }
  }
  function announceArrival() { if (enabled()) speak("Sei arrivato a destinazione."); resetNavigation(); }

  // ---------------- radar (autovelox / tutor) ----------------
  function announceCamera(cam, distM) {
    if (!enabled() || !radarOn()) return;
    var kind = ((cam && cam.kind) || "").toLowerCase();
    var isTutor = /tutor|sicve|media/.test(kind);
    var lim = (cam && cam.speedLimit) ? (". Limite " + cam.speedLimit) : "";
    beep();
    if (isTutor) speak("Attenzione, tutor. Controllo di velocità media" + lim + ".", { priority: "high" });
    else speak("Attenzione, autovelox a " + roundm(distM) + " metri" + lim + ".", { priority: "high" });
  }

  // ---------------- setter ----------------
  function setEnabled(on) { lsSet(LS.enabled, on ? "true" : "false"); if (on) { ensureAudio(); speak("Guida vocale attivata.", { force: true }); } else { try { window.speechSynthesis.cancel(); } catch (e) {} } syncUI(); }
  function toggleEnabled() { setEnabled(!enabled()); }
  function setRadar(on) { lsSet(LS.radar, on ? "true" : "false"); syncUI(); }
  function setRate(r) { lsSet(LS.rate, r); syncUI(); }
  function setVoice(uri) {
    if (!isPremium()) { if (typeof window.onPremiumClick === "function") window.onPremiumClick(); return; }
    lsSet(LS.voice, uri || "");
    syncUI();
    speak("Questa è la voce selezionata.", { force: true });
  }

  // ---------------- UI ----------------
  function injectStyles() {
    if (document.getElementById("voiceGuideStyle")) return;
    var st = document.createElement("style");
    st.id = "voiceGuideStyle";
    st.textContent =
      ".geo-voice-btn.active{background:linear-gradient(135deg,#0EA5E9,#0284C7)!important;color:#fff!important;border-color:#0284C7!important}" +
      ".vg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}" +
      ".vg-label{font-size:.86rem;font-weight:700}" +
      ".vg-seg{display:inline-flex;gap:4px;background:rgba(148,163,184,.12);padding:3px;border-radius:999px}" +
      ".vg-seg-btn{border:0;background:transparent;color:inherit;border-radius:999px;padding:4px 12px;font-size:.78rem;font-weight:700;cursor:pointer;opacity:.7}" +
      ".vg-seg-btn.active{background:#0284C7;color:#fff;opacity:1}" +
      ".vg-voices{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}" +
      ".vg-voice-chip{border:1.5px solid rgba(148,163,184,.4);background:rgba(148,163,184,.08);color:inherit;border-radius:10px;padding:5px 10px;font-size:.76rem;font-weight:700;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".vg-voice-chip.active{border-color:#0284C7;background:rgba(2,132,199,.15);color:#0284C7}" +
      ".vg-lock{font-size:.74rem;opacity:.8;margin-top:8px;line-height:1.4}" +
      ".vg-lock i{color:#f59e0b}" +
      ".vg-test{margin-top:10px;border:0;background:#0284C7;color:#fff;border-radius:10px;padding:8px 14px;font-weight:700;font-size:.82rem;cursor:pointer}" +
      ".vg-group.vg-off .vg-sub{opacity:.45;pointer-events:none}";
    document.head.appendChild(st);
  }

  function injectSettings() {
    var body = document.querySelector(".customizer-body");
    if (!body || document.getElementById("vgGroup")) return;
    var g = document.createElement("div");
    g.className = "cz-group vg-group";
    g.id = "vgGroup";
    g.innerHTML =
      '<div class="cz-group-title"><i class="fa-solid fa-volume-high"></i> Guida vocale</div>' +
      '<div class="vg-row"><span class="vg-label">Istruzioni vocali</span>' +
      '  <div class="vg-seg" data-vg="enabled">' +
      '    <button type="button" class="vg-seg-btn" data-vg-val="on">Sì</button>' +
      '    <button type="button" class="vg-seg-btn" data-vg-val="off">No</button>' +
      '  </div></div>' +
      '<div class="vg-sub">' +
      '  <div class="vg-row"><span class="vg-label">Avvisi autovelox &amp; tutor</span>' +
      '    <div class="vg-seg" data-vg="radar">' +
      '      <button type="button" class="vg-seg-btn" data-vg-val="on">Sì</button>' +
      '      <button type="button" class="vg-seg-btn" data-vg-val="off">No</button>' +
      '    </div></div>' +
      '  <div class="vg-row"><span class="vg-label">Velocità voce</span>' +
      '    <div class="vg-seg" data-vg="rate">' +
      '      <button type="button" class="vg-seg-btn" data-vg-val="0.85">Lenta</button>' +
      '      <button type="button" class="vg-seg-btn" data-vg-val="1">Normale</button>' +
      '      <button type="button" class="vg-seg-btn" data-vg-val="1.2">Veloce</button>' +
      '    </div></div>' +
      '  <div class="cz-group-title" style="margin-top:12px;font-size:.82rem;"><i class="fa-solid fa-microphone-lines"></i> Voce' +
      '    <span class="uis-premium-tag"><i class="fa-solid fa-crown"></i> Premium</span></div>' +
      '  <div class="vg-voices" id="vgVoices"></div>' +
      '  <div class="vg-lock" id="vgLock"></div>' +
      '  <button type="button" class="vg-test" id="vgTest"><i class="fa-solid fa-play"></i> Prova la voce</button>' +
      '</div>';
    body.insertBefore(g, body.firstChild);

    g.querySelectorAll('[data-vg="enabled"] .vg-seg-btn').forEach(function (b) {
      b.addEventListener("click", function () { setEnabled(b.getAttribute("data-vg-val") === "on"); });
    });
    g.querySelectorAll('[data-vg="radar"] .vg-seg-btn').forEach(function (b) {
      b.addEventListener("click", function () { setRadar(b.getAttribute("data-vg-val") === "on"); });
    });
    g.querySelectorAll('[data-vg="rate"] .vg-seg-btn').forEach(function (b) {
      b.addEventListener("click", function () { setRate(b.getAttribute("data-vg-val")); });
    });
    var test = g.querySelector("#vgTest");
    if (test) test.addEventListener("click", function () { ensureAudio(); speak("Tra trecento metri, svolta a destra su Via Roma.", { force: true }); });
  }

  function renderVoices() {
    var box = document.getElementById("vgVoices");
    var lock = document.getElementById("vgLock");
    if (!box) return;
    var vs = italianVoices();
    var prem = isPremium();
    var cur = lsGet(LS.voice, "");
    if (!vs.length) {
      box.innerHTML = '<span class="vg-lock">Nessuna voce italiana trovata sul dispositivo. Scaricane una dalle impostazioni del telefono (Sintesi vocale).</span>';
    } else {
      box.innerHTML = vs.map(function (v) {
        var active = prem && (v.voiceURI === cur || (!cur && v === chosenVoice()));
        return '<button type="button" class="vg-voice-chip' + (active ? " active" : "") + '" data-uri="' + String(v.voiceURI).replace(/"/g, "") + '">' +
          (v.name || v.lang) + '</button>';
      }).join("");
      box.querySelectorAll("[data-uri]").forEach(function (b) {
        b.addEventListener("click", function () { setVoice(b.getAttribute("data-uri")); });
      });
    }
    if (lock) {
      lock.innerHTML = prem
        ? "Scegli la voce del navigatore. Le voci disponibili sono quelle installate sul telefono."
        : '<i class="fa-solid fa-crown"></i> Con <b>Premium</b> scegli la voce personalizzata. In versione free si usa la voce italiana standard del telefono.';
    }
  }

  function syncUI() {
    // Bottone al volo nei controlli mappa
    var btn = document.getElementById("geoVoiceBtn");
    if (btn) {
      var on = enabled();
      btn.classList.toggle("active", on);
      var ic = btn.querySelector("i");
      if (ic) ic.className = "fa-solid " + (on ? "fa-volume-high" : "fa-volume-xmark");
      var lb = btn.querySelector(".vgnav-label");
      if (lb) lb.textContent = on ? "Voce attiva" : "Voce off";
    }
    // Gruppo impostazioni
    var g = document.getElementById("vgGroup");
    if (!g) return;
    g.classList.toggle("vg-off", !enabled());
    function seg(name, val) {
      g.querySelectorAll('[data-vg="' + name + '"] .vg-seg-btn').forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-vg-val") === val);
      });
    }
    seg("enabled", enabled() ? "on" : "off");
    seg("radar", radarOn() ? "on" : "off");
    var r = String(getRate()); if (r === "1") r = "1";
    g.querySelectorAll('[data-vg="rate"] .vg-seg-btn').forEach(function (b) {
      b.classList.toggle("active", Math.abs(parseFloat(b.getAttribute("data-vg-val")) - getRate()) < 0.001);
    });
    renderVoices();
  }

  function init() {
    injectStyles();
    injectSettings();
    syncUI();
    try { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = renderVoices; } catch (e) {}
    var czBtn = document.getElementById("customizerToggleBtn");
    if (czBtn) czBtn.addEventListener("click", function () { setTimeout(syncUI, 40); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.voiceGuide = {
    speak: speak,
    startNavigation: startNavigation,
    resetNavigation: resetNavigation,
    onPosition: onPosition,
    announceArrival: announceArrival,
    announceCamera: announceCamera,
    isEnabled: enabled,
    setEnabled: setEnabled,
    toggleEnabled: toggleEnabled,
    setRadar: setRadar,
    setRate: setRate,
    setVoice: setVoice,
    syncUI: syncUI
  };
})();
