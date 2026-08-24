/**
 * ITALIABUS - GESTORE PUBBLICITA' UNIFICATO
 *
 * Una sola porta per mostrare una pubblicita', con scelta AUTOMATICA del canale:
 *   - Dentro l'app Unity (window.Unity presente): usa UNITY ADS (invokeUnity('show_ad')).
 *   - Versione WEB / repo (nessun Unity): usa GOOGLE ADS (AdSense). Unity Ads viene
 *     COSI' disabilitato automaticamente quando NON si e' nell'app nativa.
 *
 * Premium (localStorage premium_unlocked) => niente pubblicita', in entrambi i casi.
 *
 * >>> ATTIVARE ADSENSE (versione web) <<<
 *   imposta window.ADSENSE_CONFIG = { client: "ca-pub-XXXXXXXXXXXXXXXX", slot: "0000000000" }
 *   (l'ID AdSense e' pubblico per definizione). Vuoto = nessuna pubblicita' web.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

window.ADSENSE_CONFIG = window.ADSENSE_CONFIG || { client: "", slot: "" };

(function () {
  "use strict";

  var loaded = false, loading = false;

  function inUnity() {
    return !!(window.Unity || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.unityControl));
  }
  function isPremium() {
    try { return localStorage.getItem('premium_unlocked') === 'true'; } catch (e) { return false; }
  }
  function configured() {
    return !!(window.ADSENSE_CONFIG && window.ADSENSE_CONFIG.client);
  }

  function ensureAdSenseScript(cb) {
    if (loaded) { if (cb) cb(); return; }
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(window.ADSENSE_CONFIG.client);
    s.onload = function () { loaded = true; if (cb) cb(); };
    s.onerror = function () { loading = false; };
    document.head.appendChild(s);
  }

  var WebAds = {
    // Disponibile solo fuori dall'app, con AdSense configurato e utente non premium
    available: function () {
      return !inUnity() && configured() && !isPremium();
    },

    showInterstitial: function () {
      if (!this.available()) return false;
      var self = this;
      ensureAdSenseScript(function () { self._openModal(); });
      if (loaded) self._openModal();
      return true;
    },

    _openModal: function () {
      if (document.getElementById('webAdOverlay')) return;
      var ov = document.createElement('div');
      ov.id = 'webAdOverlay';
      ov.className = 'web-ad-overlay';
      ov.innerHTML =
        '<div class="web-ad-box">' +
          '<div class="web-ad-head"><span><i class="fa-solid fa-rectangle-ad"></i> Pubblicità</span>' +
          '<button id="webAdClose" class="web-ad-close" disabled>Chiudi <span id="webAdCd">5</span></button></div>' +
          '<ins class="adsbygoogle web-ad-ins" style="display:block" ' +
            'data-ad-client="' + window.ADSENSE_CONFIG.client + '" ' +
            'data-ad-slot="' + (window.ADSENSE_CONFIG.slot || '') + '" ' +
            'data-ad-format="auto" data-full-width-responsive="true"></ins>' +
        '</div>';
      document.body.appendChild(ov);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}

      var cd = 5;
      var cdEl = document.getElementById('webAdCd');
      var btn = document.getElementById('webAdClose');
      var timer = setInterval(function () {
        cd--;
        if (cdEl) cdEl.textContent = cd;
        if (cd <= 0) {
          clearInterval(timer);
          if (btn) { btn.disabled = false; btn.innerHTML = 'Chiudi'; }
        }
      }, 1000);
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      if (btn) btn.addEventListener('click', function () { if (!btn.disabled) close(); });
    }
  };

  window.webAds = WebAds;

  // Punto UNICO per mostrare una pubblicita' (usato da app.js e geo-locator.js).
  window.showAppAd = function () {
    if (isPremium()) return;
    if (inUnity()) {
      if (window.invokeUnity) window.invokeUnity('show_ad'); // Unity Ads (solo in-app)
      return;
    }
    WebAds.showInterstitial(); // Google AdSense (versione web / repo)
  };
})();
