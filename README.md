# ItaliaBus & Mobilità Italia 🚌 🇮🇹

Portale web moderno e reattivo per il trasporto su gomma e pullman di **tutte le 20 regioni d'Italia** con oltre **280 città, comuni, frazioni e borghi collegati**, partenze live con timer a scalare al secondo, mappa satellitare interattiva, pianificatore di viaggio multi-livello e acquisto biglietti.

---

## 🌟 Funzionalità Principali

1. **Copertura Completa di tutte le 20 Regioni Italiane**:
   - Selettore gerarchico: **Regione ➔ Città / Comune ➔ Fermata / Via di Riferimento**.
   - Database integrato con oltre 280 località da nord a sud.

2. **Tabellone Partenze & Arrivi Live con Timer al Secondo**:
   - Conto alla rovescia in tempo reale per ogni corsa (`IN ARRIVO`, `IN BANCHINA`, `03:45 min`).
   - Monitoraggio dello stato (`In Orario`, `Ritardo +3'`, `Al Capolinea`).
   - Assegnazione banchine, modello del veicolo e sintetizzatore vocale per annunci audio bilingue.

3. **Pianificatore di Viaggio Multi-Livello (Intra-regionale & Interregionale)**:
   - Partenza (Regione, Città, Fermata) ➔ Arrivo (Regione, Città, Fermata).
   - Calcolo tratte urbane, regionali e collegamenti Gran Turismo a lunga percorrenza tra qualsiasi città italiana.
   - Pulsante inverti ⇄ istantaneo e visualizzazione timeline dettagliata fermata per fermata.

4. **Mappa Satellitare Interattiva con Bus Live in Movimento**:
   - Mappa OpenStreetMap/Leaflet con zoom dinamico sulla regione selezionata.
   - Percorsi stradali con polylines colorate e pullman geolocalizzati in movimento in tempo reale.

5. **Acquisto Biglietti & Abbonamenti (Coming Soon)**:
   - Tariffe ufficiali aggiornate (urbane, giornaliere, settimanali, abbonamenti studenti UNICAL/universitari e ItaliaPass Annuale).
   - Badge `Coming Soon` integrato per l'acquisto digitale.

6. **Design 100% Mobile Responsive & PWA Ready**:
   - Perfetto su tutti gli smartphone Android, iPhone (iOS Safe Area, notch, dynamic island) e tablet.
   - Dark Mode / Light Mode con memorizzazione automatica.
   - Cache-busting automatico ad ogni ingresso per garantire che i file JS/CSS siano sempre aggiornati.

---

## 🚀 Guida al Caricamento su GitHub & Vercel

Il progetto è ottimizzato al 100% per essere importato su GitHub e distribuito su Vercel con un solo clic.

### Passaggio 1: Caricamento su GitHub
1. Crea un nuovo repository su [GitHub](https://github.com/new) (es. `italiabus-italia`).
2. Trascina i file su GitHub via web oppure esegui da terminale:
   ```bash
   git init
   git add .
   git commit -m "Deploy ItaliaBus 20 Regioni"
   git branch -M main
   git remote add origin https://github.com/TUO_USERNAME/italiabus-italia.git
   git push -u origin main
   ```

### Passaggio 2: Deploy su Vercel
1. Accedi a [vercel.com](https://vercel.com/) e clicca su **"Add New..."** ➔ **"Project"**.
2. Seleziona il tuo repository GitHub e clicca **"Deploy"** (non serve modificare alcun parametro, il file `vercel.json` gestisce tutto automaticamente).
3. In meno di 30 secondi il tuo sito sarà online e fruibile su qualsiasi dispositivo.

---
© 2026 ItaliaBus & Mobilità Italia — Not Exist Web Services.
