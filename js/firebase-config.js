/**
 * ITALIARUN - CONFIGURAZIONE FIREBASE (account + utenti online)
 *
 * >>> DA COMPILARE UNA VOLTA SOLA <<<
 * 1) Vai su https://console.firebase.google.com e crea un progetto (gratis).
 * 2) Aggiungi un'app "Web" (</>) e copia l'oggetto firebaseConfig.
 * 3) Incolla i valori qui sotto in FIREBASE_CONFIG (sostituendo gli "INCOLLA_...").
 * 4) Nel menu "Authentication" attiva il metodo "Email/Password".
 * 5) Nel menu "Realtime Database" crea un database (modalita' bloccata) e incolla
 *    l'URL in databaseURL. Poi imposta le regole di sicurezza (vedi ACCOUNT_RULES
 *    in fondo a questo file).
 *
 * Finche' non e' compilato, l'app funziona lo stesso: la sezione Account resta
 * semplicemente disattivata (login/registrazione mostrano un avviso).
 *
 * NB: questi valori sono PUBBLICI per definizione (stanno nel client). La sicurezza
 * vera la fanno le Regole del Realtime Database, non la segretezza di questi campi.
 */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAqvzmaAO__pwNV13IEd84iyWqFXijwvL4",
  authDomain: "italiarun.firebaseapp.com",
  databaseURL: "https://italiarun-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "italiarun",
  storageBucket: "italiarun.firebasestorage.app",
  messagingSenderId: "8433365051",
  appId: "1:8433365051:web:38a9b031d0efd5d8152c1e",
  measurementId: "G-KJP2FJPTC1"
};

// Account PROPRIETARIO (owner): questa email vede il pannello "Utenti Online".
// L'owner NON deve verificare l'email per entrare (comodo se non controlli quella casella).
window.ACCOUNT_CONFIG = {
  // Email del PROPRIETARIO. Chi accede con QUESTA email (dal normale form di login,
  // scrivendo email + password) diventa owner e vede il pannello "Utenti Online".
  // Nessun pulsante speciale: basta conoscere email e password dell'account owner.
  ownerEmail: "notexist@gmail.com",
  // Verifica email obbligatoria per gli utenti normali (l'owner e' sempre esente).
  requireEmailVerified: true
};

// True solo se la config e' stata davvero compilata (niente placeholder "INCOLLA_").
window.firebaseConfigured = function () {
  var c = window.FIREBASE_CONFIG || {};
  return !!(c.apiKey && c.projectId && c.databaseURL) &&
         c.apiKey.indexOf("INCOLLA_") !== 0 &&
         c.projectId.indexOf("INCOLLA_") !== 0 &&
         c.databaseURL.indexOf("https://INCOLLA_") !== 0;
};

/*
  ============================================================================
  REGOLE DI SICUREZZA da incollare nel Realtime Database (scheda "Regole"):
  (sostituisci OWNER_EMAIL con la stessa email di ownerEmail qui sopra)
  ============================================================================
  {
    "rules": {
      "users": {
        "$uid": {
          ".read":  "auth != null && (auth.uid === $uid || auth.token.email === 'OWNER_EMAIL')",
          ".write": "auth != null && auth.uid === $uid"
        }
      },
      "presence": {
        ".read": "auth != null && auth.token.email === 'OWNER_EMAIL'",
        "$uid": {
          ".read":  "auth != null && auth.uid === $uid",
          ".write": "auth != null && auth.uid === $uid"
        }
      }
    }
  }
  ============================================================================
*/
