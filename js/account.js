/**
 * ITALIARUN - SISTEMA ACCOUNT
 *  - Registrazione: username + email + password + email di verifica
 *  - Login / logout, reset password
 *  - Presenza ONLINE in tempo reale (onDisconnect)
 *  - Profilo con flag free/premium (aggancia unlockPremium esistente)
 *  - Pannello OWNER: elenco degli utenti attualmente online
 *
 * Tutto protetto: se Firebase non e' configurato (js/firebase-config.js con
 * placeholder), l'app funziona lo stesso e l'account resta disattivato.
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";

  var auth = null, db = null;
  var enabled = false;
  var currentUser = null;
  var currentProfile = null;
  var presenceRef = null, connectedRef = null, adminRef = null, profileRef = null, pendingCreate = null;
  var sessionId = null; // id univoco di QUESTA scheda/sessione (stabile tra le riconnessioni)
  var anonInFlight = false; // evita doppioni di login anonimo (ospite)

  // ---------- helpers ----------
  function cfg() { return window.ACCOUNT_CONFIG || {}; }
  function ownerEmail() { return (cfg().ownerEmail || "").toLowerCase(); }
  function requireVerified() { return cfg().requireEmailVerified !== false; }
  function isOwner(user) { return !!(user && user.email && user.email.toLowerCase() === ownerEmail()); }
  function fullyLogged(user) { return !!user && !user.isAnonymous && (isOwner(user) || !requireVerified() || user.emailVerified); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function authError(e) {
    var m = { "auth/invalid-email": "Email non valida.",
      "auth/email-already-in-use": "Questa email ha gia' un account.",
      "auth/weak-password": "Password troppo debole (min 6 caratteri).",
      "auth/user-not-found": "Nessun account con questa email.",
      "auth/wrong-password": "Password errata.",
      "auth/invalid-credential": "Email o password errate.",
      "auth/too-many-requests": "Troppi tentativi, riprova tra poco.",
      "auth/network-request-failed": "Nessuna connessione a internet." };
    return (e && m[e.code]) || (e && e.message) || "Errore, riprova.";
  }

  // ---------- init ----------
  function init() {
    injectDom();
    try {
      if (typeof firebase === "undefined" || !window.firebaseConfigured || !window.firebaseConfigured()) {
        enabled = false; renderNav(); renderModal(); return;
      }
      firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.database();
      try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}
      enabled = true;
      auth.onAuthStateChanged(onAuthChanged);
      watchConnection();
    } catch (e) {
      console.warn("[account] init fallito:", e);
      enabled = false;
    }
    renderNav(); renderModal();
  }

  function notConfigured() {
    msg("Account non ancora configurato dall'amministratore (Firebase mancante).", false);
    return Promise.resolve();
  }

  // ---------- azioni auth ----------
  function register(username, email, password) {
    if (!enabled) return notConfigured();
    username = (username || "").trim();
    if (username.length < 3) { msg("Username di almeno 3 caratteri.", false); return Promise.resolve(); }
    if ((password || "").length < 6) { msg("Password di almeno 6 caratteri.", false); return Promise.resolve(); }
    clearPresence(); // rimuove la presenza "ospite" finche' siamo ancora anonimi
    busy(true);
    return auth.createUserWithEmailAndPassword((email || "").trim(), password)
      .then(function (cred) {
        var user = cred.user;
        return user.updateProfile({ displayName: username })
          .then(function () {
            return db.ref("users/" + user.uid).set({
              username: username, email: user.email, premium: false,
              role: isOwner(user) ? "owner" : "user",
              createdAt: firebase.database.ServerValue.TIMESTAMP
            });
          })
          .then(function () { return user.sendEmailVerification(); });
      })
      .then(function () {
        msg("Registrazione completata! Ti abbiamo inviato un'email di conferma: verificala, poi potrai usare l'account.", true);
      })
      .catch(function (e) { msg(authError(e), false); })
      .then(function () { busy(false); });
  }

  function login(email, password) {
    if (!enabled) return notConfigured();
    clearPresence(); // rimuove la presenza "ospite" finche' siamo ancora anonimi
    busy(true);
    return auth.signInWithEmailAndPassword((email || "").trim(), password)
      .catch(function (e) { msg(authError(e), false); })
      .then(function () { busy(false); });
  }

  function resetPassword(email) {
    if (!enabled) return notConfigured();
    email = (email || "").trim();
    if (!email) { msg("Scrivi la tua email nel campo, poi premi 'Password dimenticata'.", false); return; }
    auth.sendPasswordResetEmail(email)
      .then(function () { msg("Ti abbiamo inviato l'email per reimpostare la password.", true); })
      .catch(function (e) { msg(authError(e), false); });
  }

  function resendVerification() {
    if (auth && auth.currentUser) {
      auth.currentUser.sendEmailVerification()
        .then(function () { msg("Email di conferma reinviata.", true); })
        .catch(function (e) { msg(authError(e), false); });
    }
  }

  function refreshVerification() {
    if (auth && auth.currentUser) {
      auth.currentUser.reload().then(function () { onAuthChanged(auth.currentUser); })
        .catch(function (e) { msg(authError(e), false); });
    }
  }

  function logout() {
    if (!enabled || !auth) return;
    clearPresence();
    auth.signOut().then(function () {
      // Da sloggato l'utente e' "free": riattiva le pubblicita' (esperienza utente normale).
      // Su app nativa, un eventuale abbonamento reale viene ri-verificato al riavvio.
      if (typeof window.lockPremium === "function") window.lockPremium();
      msg("Disconnesso.", true);
    });
  }

  // ---------- stato auth ----------
  function onAuthChanged(user) {
    currentUser = user;
    currentProfile = null;
    clearPresence();
    detachProfile();
    stopAdmin();

    if (!user) { renderNav(); renderModal(); ensureGuestAuth(); return; }

    // Ospite: connesso ma NON autenticato con un account reale (login anonimo).
    // Lo tracciamo comunque come sessione "non loggata".
    if (user.isAnonymous) { renderNav(); renderModal(); setPresence(); return; }

    // L'owner entra sempre; gli utenti normali devono aver verificato l'email.
    // In attesa di verifica compaiono comunque come sessione (ospite con email).
    if (requireVerified() && !user.emailVerified && !isOwner(user)) { renderNav(); renderModal("pending"); setPresence(); return; }

    if (isOwner(user)) startAdmin();

    // Profilo REATTIVO: appena register/devLogin scrive il profilo (o l'admin cambia
    // il premium), presenza/premium/UI si aggiornano da soli. Evita la race di timing.
    profileRef = db.ref("users/" + user.uid);
    profileRef.on("value", function (snap) {
      var val = snap.val();
      if (val) {
        if (pendingCreate) { clearTimeout(pendingCreate); pendingCreate = null; }
        currentProfile = val;
      } else {
        // Profilo non ancora presente: attendo che register/devLogin lo scriva.
        // Se dopo 2.5s ancora niente (account legacy senza profilo), lo creo io.
        currentProfile = { username: user.displayName || "utente", email: user.email,
          premium: false, role: isOwner(user) ? "owner" : "user" };
        if (!pendingCreate) {
          pendingCreate = setTimeout(function () {
            pendingCreate = null;
            db.ref("users/" + user.uid).update({
              username: user.displayName || "utente", email: user.email, premium: false,
              role: isOwner(user) ? "owner" : "user",
              createdAt: firebase.database.ServerValue.TIMESTAMP });
          }, 2500);
        }
      }
      applyProfile(user);
    }, function (err) {
      console.warn("[account] profilo:", err);
      currentProfile = { username: user.displayName || "utente", email: user.email, premium: false };
      applyProfile(user);
    });
  }

  function applyProfile(user) {
    if (currentProfile && currentProfile.premium === true && typeof window.unlockPremium === "function") window.unlockPremium();
    setPresence();
    renderNav();
    renderModal("in");
  }

  function detachProfile() {
    if (profileRef) { profileRef.off(); profileRef = null; }
    if (pendingCreate) { clearTimeout(pendingCreate); pendingCreate = null; }
  }

  // ---------- presenza ----------
  function watchConnection() {
    connectedRef = db.ref(".info/connected");
    connectedRef.on("value", function (snap) {
      if (snap.val() === true && presenceKind()) setPresence();
    });
  }
  // Se non c'e' nessun contesto auth, entra come ospite (login anonimo) per poter
  // scrivere la presenza. Richiede che "Anonimo" sia abilitato in Firebase Auth;
  // se non lo e', fallisce in silenzio e gli ospiti semplicemente non si vedono.
  function ensureGuestAuth() {
    if (!enabled || !auth || auth.currentUser || anonInFlight) return;
    anonInFlight = true;
    auth.signInAnonymously()
      .catch(function (e) {
        console.warn("[account] login ospite non riuscito (abilita 'Anonimo' in Firebase Authentication):", e && e.code);
      })
      .then(function () { anonInFlight = false; });
  }
  // Che tipo di presenza scrivere per l'utente corrente: "logged", "guest" o null.
  function presenceKind() {
    if (!currentUser) return null;
    return fullyLogged(currentUser) ? "logged" : "guest";
  }
  // "mobile" o "desktop": app nativa (WebView) = sempre mobile; altrimenti euristica UA + touch.
  function deviceType() {
    try {
      if (window.Unity) return "mobile"; // WebView Unity (Android) iniettata
      var ua = navigator.userAgent || "";
      var mobileUA = /Mobi|Android|iPhone|iPod|iPad|IEMobile|BlackBerry|Opera Mini|Windows Phone|webOS/i.test(ua);
      var coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
      var touch = (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
      return (mobileUA || (coarse && touch)) ? "mobile" : "desktop";
    } catch (e) { return "desktop"; }
  }
  // Id di sessione univoco e ordinato cronologicamente (push key) con fallback.
  function newSessionId() {
    try { var k = db.ref("presence").push().key; if (k) return k; } catch (e) {}
    return "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  function setPresence() {
    var kind = presenceKind();
    if (!kind) return;
    if (!sessionId) sessionId = newSessionId();
    // Una sessione per dispositivo: presence/<uid>/<sessionId>. Cosi' due login dello
    // stesso account (mobile + desktop) coesistono senza sovrascriversi.
    presenceRef = db.ref("presence/" + currentUser.uid + "/" + sessionId);
    try { presenceRef.onDisconnect().remove(); } catch (e) {}
    if (kind === "logged") {
      presenceRef.set({
        username: (currentProfile && currentProfile.username) || currentUser.displayName || "utente",
        email: currentUser.email,
        premium: !!(currentProfile && currentProfile.premium),
        device: deviceType(),
        since: firebase.database.ServerValue.TIMESTAMP
      });
      try { db.ref("users/" + currentUser.uid + "/lastOnline").set(firebase.database.ServerValue.TIMESTAMP); } catch (e) {}
    } else {
      // ospite: connesso ma non loggato (anonimo) o in attesa di verifica email.
      presenceRef.set({
        guest: true,
        email: currentUser.email || null, // presente solo se in attesa di verifica
        device: deviceType(),
        since: firebase.database.ServerValue.TIMESTAMP
      });
    }
  }
  function clearPresence() {
    if (presenceRef) {
      try { presenceRef.onDisconnect().cancel(); presenceRef.remove(); } catch (e) {}
      presenceRef = null;
    }
    sessionId = null; // la prossima presenza (nuovo login) ottiene una sessione nuova
  }

  // ---------- pannello owner: utenti online ----------
  function startAdmin() {
    adminRef = db.ref("presence");
    adminRef.on("value", function (snap) { renderAdmin(snap.val() || {}); },
      function (err) { console.warn("[account] admin read:", err); });
  }
  function stopAdmin() { if (adminRef) { adminRef.off(); adminRef = null; } }

  // ============================================================
  //  UI (auto-iniettata)
  // ============================================================
  function injectDom() {
    if (document.getElementById("accountModal")) return;
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="acc-overlay" id="accountModal" aria-hidden="true">' +
      '  <div class="acc-box" role="dialog" aria-modal="true">' +
      '    <div class="acc-head"><span id="accTitle"><i class="fa-solid fa-user"></i> Account</span>' +
      '      <button class="acc-x" id="accClose" aria-label="Chiudi">&times;</button></div>' +
      '    <div class="acc-body" id="accBody"></div>' +
      '    <div class="acc-msg" id="accMsg"></div>' +
      '  </div>' +
      '</div>' +
      '<div class="acc-overlay" id="accountAdmin" aria-hidden="true">' +
      '  <div class="acc-box acc-box-admin" role="dialog" aria-modal="true">' +
      '    <div class="acc-head"><span><i class="fa-solid fa-users-viewfinder"></i> Utenti Online ' +
      '      <span class="acc-count" id="accOnlineCount">0</span></span>' +
      '      <button class="acc-x" id="accAdminClose" aria-label="Chiudi">&times;</button></div>' +
      '    <div class="acc-admin-list" id="accAdminList"></div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(wrap);

    document.getElementById("accClose").addEventListener("click", close);
    document.getElementById("accountModal").addEventListener("click", function (e) {
      if (e.target && e.target.id === "accountModal") close();
    });
    document.getElementById("accAdminClose").addEventListener("click", closeAdmin);
    document.getElementById("accountAdmin").addEventListener("click", function (e) {
      if (e.target && e.target.id === "accountAdmin") closeAdmin();
    });
  }

  function renderNav() {
    // Aggiorna l'etichetta del bottone Account nella nav (desktop + drawer).
    var label = fullyLogged(currentUser)
      ? ((currentProfile && currentProfile.username) || (currentUser && currentUser.displayName) || "Account")
      : "Accedi";
    var icon = fullyLogged(currentUser) ? "fa-circle-user" : "fa-right-to-bracket";
    document.querySelectorAll(".acc-nav-label").forEach(function (el) { el.textContent = label; });
    document.querySelectorAll(".acc-nav-icon").forEach(function (el) {
      el.className = "acc-nav-icon fa-solid " + icon;
    });
    // Voce "Utenti Online" visibile SOLO all'owner loggato.
    var showOwner = fullyLogged(currentUser) && isOwner(currentUser);
    document.querySelectorAll(".acc-owner-nav").forEach(function (el) { el.style.display = showOwner ? "" : "none"; });
  }

  var _tab = "login";
  function renderModal(state) {
    var body = document.getElementById("accBody");
    var title = document.getElementById("accTitle");
    if (!body) return;

    if (!enabled) {
      title.innerHTML = '<i class="fa-solid fa-user"></i> Account';
      body.innerHTML = '<p class="acc-note">Il sistema account non e\' ancora configurato dall\'amministratore.</p>';
      return;
    }

    if (state === "in" && fullyLogged(currentUser)) {
      var prem = currentProfile && currentProfile.premium;
      title.innerHTML = '<i class="fa-solid fa-circle-user"></i> Il mio Account';
      body.innerHTML =
        '<div class="acc-profile">' +
        '  <div class="acc-avatar">' + esc((((currentProfile && currentProfile.username) || "U")[0] || "U").toUpperCase()) + '</div>' +
        '  <div class="acc-uname">' + esc((currentProfile && currentProfile.username) || currentUser.displayName || "utente") + '</div>' +
        '  <div class="acc-uemail">' + esc(currentUser.email) + '</div>' +
        '  <div class="acc-badge ' + (prem ? "acc-badge-prem" : "acc-badge-free") + '">' +
             (prem ? '<i class="fa-solid fa-crown"></i> Premium' : 'Free') + '</div>' +
        '</div>' +
        (isOwner(currentUser)
          ? '<button class="acc-btn acc-btn-owner" id="accOwnerBtn"><i class="fa-solid fa-users-viewfinder"></i> Pannello Utenti Online</button>'
          : '') +
        '<button class="acc-btn acc-btn-ghost" id="accLogout"><i class="fa-solid fa-right-from-bracket"></i> Esci</button>';
      body.querySelector("#accLogout").addEventListener("click", logout);
      var ob = body.querySelector("#accOwnerBtn");
      if (ob) ob.addEventListener("click", function () { close(); openAdmin(); });
      return;
    }

    if (state === "pending") {
      title.innerHTML = '<i class="fa-solid fa-envelope-circle-check"></i> Conferma email';
      body.innerHTML =
        '<p class="acc-note">Ti abbiamo inviato un\'email di conferma a <b>' + esc(currentUser ? currentUser.email : "") + '</b>.' +
        ' Aprila e clicca sul link, poi torna qui.</p>' +
        '<button class="acc-btn" id="accVerified"><i class="fa-solid fa-rotate-right"></i> Ho confermato, controlla</button>' +
        '<button class="acc-btn acc-btn-ghost" id="accResend"><i class="fa-solid fa-paper-plane"></i> Reinvia email</button>' +
        '<button class="acc-btn acc-btn-ghost" id="accLogout2"><i class="fa-solid fa-right-from-bracket"></i> Esci</button>';
      body.querySelector("#accVerified").addEventListener("click", refreshVerification);
      body.querySelector("#accResend").addEventListener("click", resendVerification);
      body.querySelector("#accLogout2").addEventListener("click", logout);
      return;
    }

    // logged out: login / register
    title.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Accedi o Registrati';
    body.innerHTML =
      '<div class="acc-tabs">' +
      '  <button class="acc-tab' + (_tab === "login" ? " active" : "") + '" data-t="login">Accedi</button>' +
      '  <button class="acc-tab' + (_tab === "register" ? " active" : "") + '" data-t="register">Registrati</button>' +
      '</div>' +
      (_tab === "register"
        ? '<input class="acc-in" id="accRegUser" type="text" placeholder="Username" autocomplete="username">' +
          '<input class="acc-in" id="accRegEmail" type="email" placeholder="Email" autocomplete="email">' +
          '<input class="acc-in" id="accRegPass" type="password" placeholder="Password (min 6)" autocomplete="new-password">' +
          '<button class="acc-btn" id="accDoReg"><i class="fa-solid fa-user-plus"></i> Crea account</button>'
        : '<input class="acc-in" id="accLogEmail" type="email" placeholder="Email" autocomplete="email">' +
          '<input class="acc-in" id="accLogPass" type="password" placeholder="Password" autocomplete="current-password">' +
          '<button class="acc-btn" id="accDoLog"><i class="fa-solid fa-right-to-bracket"></i> Accedi</button>' +
          '<button class="acc-link" id="accForgot">Password dimenticata?</button>');

    body.querySelectorAll(".acc-tab").forEach(function (b) {
      b.addEventListener("click", function () { _tab = b.getAttribute("data-t"); msg("", true); renderModal(); });
    });
    if (_tab === "register") {
      body.querySelector("#accDoReg").addEventListener("click", function () {
        register(val("accRegUser"), val("accRegEmail"), val("accRegPass"));
      });
    } else {
      body.querySelector("#accDoLog").addEventListener("click", function () {
        login(val("accLogEmail"), val("accLogPass"));
      });
      body.querySelector("#accForgot").addEventListener("click", function () { resetPassword(val("accLogEmail")); });
    }
  }

  // Estrae l'elenco delle sessioni di un nodo presence/<uid>.
  // Nuovo formato: { <sessionId>: { ...sessione } }. Vecchio formato (legacy):
  // { username, email, premium, since } -> trattato come singola sessione.
  function sessionsOf(node) {
    var out = [];
    if (!node || typeof node !== "object") return out;
    var keys = Object.keys(node);
    var nested = keys.some(function (k) { return node[k] && typeof node[k] === "object"; });
    if (nested) {
      keys.forEach(function (k) { var s = node[k]; if (s && typeof s === "object") out.push(s); });
    } else {
      out.push(node); // presenza legacy a nodo singolo
    }
    // piu' recente in cima
    out.sort(function (a, b) { return (b.since || 0) - (a.since || 0); });
    return out;
  }

  function deviceChip(s) {
    var mobile = s && s.device === "mobile";
    var desktop = s && s.device === "desktop";
    var icon = mobile ? "fa-mobile-screen-button" : desktop ? "fa-desktop" : "fa-circle-question";
    var label = mobile ? "Mobile" : desktop ? "Desktop" : "Sconosciuto";
    var cls = mobile ? "acc-sess-mobile" : desktop ? "acc-sess-desktop" : "acc-sess-unknown";
    var t = s && s.since ? new Date(s.since).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    return '<span class="acc-sess ' + cls + '">' +
      '<i class="fa-solid ' + icon + '"></i> ' + label +
      (t ? ' <em>da ' + esc(t) + '</em>' : '') +
    '</span>';
  }

  function renderAdmin(presence) {
    var list = document.getElementById("accAdminList");
    var count = document.getElementById("accOnlineCount");
    if (!list) return;

    var accounts = Object.keys(presence || {}).map(function (uid) {
      var sessions = sessionsOf(presence[uid]);
      var head = sessions[0] || {};
      var guest = !!head.guest || !head.username;
      return { uid: uid, sessions: sessions, head: head, guest: guest };
    }).filter(function (a) { return a.sessions.length; });

    // Prima gli account loggati, poi gli ospiti; a parita', chi ha piu' sessioni in cima.
    accounts.sort(function (x, y) {
      if (x.guest !== y.guest) return x.guest ? 1 : -1;
      return y.sessions.length - x.sessions.length;
    });

    var logged = accounts.filter(function (a) { return !a.guest; }).length;
    var guests = accounts.length - logged;
    if (count) count.textContent = accounts.length;
    if (!accounts.length) { list.innerHTML = '<p class="acc-note">Nessun utente online in questo momento.</p>'; return; }

    var summary = '<p class="acc-admin-summary">' +
      '<i class="fa-solid fa-user-check"></i> ' + logged + ' loggati' +
      ' &nbsp;•&nbsp; <i class="fa-solid fa-user-slash"></i> ' + guests + ' non loggati</p>';

    list.innerHTML = summary + accounts.map(function (a) {
      var head = a.head;
      var n = a.sessions.length;
      var chips = a.sessions.map(deviceChip).join("");
      var name = a.guest ? "Utente non loggato" : (head.username || "utente");
      return '<div class="acc-online-row' + (n > 1 ? ' acc-online-multi' : '') + (a.guest ? ' acc-online-guest' : '') + '">' +
        '<span class="acc-dot"></span>' +
        '<div class="acc-online-main">' +
          '<div class="acc-online-top">' +
            '<span class="acc-online-name">' +
              (a.guest ? '<i class="fa-solid fa-user-slash acc-guest-ic"></i> ' : '') + esc(name) +
              (head.premium ? ' <i class="fa-solid fa-crown acc-crown"></i>' : '') + '</span>' +
            '<span class="acc-online-mail">' + esc(head.email || "") + '</span>' +
          '</div>' +
          '<div class="acc-sessions">' + chips + '</div>' +
        '</div>' +
        '<span class="acc-sess-count" title="Sessioni attive">' +
          '<i class="fa-solid fa-layer-group"></i> ' + n +
        '</span>' +
      '</div>';
    }).join("");
  }

  // ---------- open/close + util ----------
  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }
  function open() { msg("", true); var real = currentUser && !currentUser.isAnonymous; if (!fullyLogged(currentUser)) _tab = "login"; renderModal(real ? (fullyLogged(currentUser) ? "in" : "pending") : undefined); var m = document.getElementById("accountModal"); if (m) { m.classList.add("open"); m.setAttribute("aria-hidden", "false"); } }
  function close() { var m = document.getElementById("accountModal"); if (m) { m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); } }
  function openAdmin() { var m = document.getElementById("accountAdmin"); if (m) { m.classList.add("open"); m.setAttribute("aria-hidden", "false"); } }
  function closeAdmin() { var m = document.getElementById("accountAdmin"); if (m) { m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); } }
  function msg(text, ok) { var e = document.getElementById("accMsg"); if (!e) return; e.textContent = text || ""; e.className = "acc-msg" + (text ? (ok ? " ok" : " err") : ""); }
  function busy(b) { var e = document.getElementById("accBody"); if (e) e.style.opacity = b ? "0.55" : "1"; }

  // API pubblica (usata dai bottoni della nav)
  window.accountSystem = { open: open, close: close, openAdmin: openAdmin, logout: logout, isEnabled: function () { return enabled; }, isOwner: function () { return isOwner(currentUser); } };
  window.openAccount = open; // comodo per onclick

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
