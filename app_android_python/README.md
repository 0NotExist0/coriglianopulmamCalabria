# 📱 ItaliaBus - Applicazione Android in Python (Flet)

Applicazione mobile nativa per Android sviluppata in **Python** con framework **Flet (Flutter Engine)**, separata e indipendente dal sito web.

---

## 🚀 1. Come eseguire l'App su PC per i Test

1. Installa le dipendenze:
   ```bash
   pip install -r requirements.txt
   ```

2. Avvia l'applicazione:
   ```bash
   python main.py
   ```

---

## 📦 2. Come compilare l'App in formato APK per Android

Per generare il file installabile **`.apk`** da installare direttamente su smartphone Android:

1. Installa Flet CLI:
   ```bash
   pip install flet[all]
   ```

2. Esegui il comando di build per Android:
   ```bash
   flet build apk
   ```

Il file `.apk` compilato verrà generato nella cartella `build/apk/` pronto per essere installato sul telefono!

---

## 🌟 Funzionalità Incluse
- 📍 **Navigatore Fermata Più Vicina**: calcolo geodesico della fermata fisica più vicina alla posizione GPS.
- 🕒 **Tabellone Live**: partenze in tempo reale con orari e conto alla rovescia.
- 🔍 **Pianificatore Itinerari**: ricerca corse tra fermate con prezzi e tempi di percorrenza.
- 🎫 **Portafoglio Biglietti Virtuali**: QR code per il controllo a bordo.
- ⚙️ **Configurazione Territoriale**: supporto multi-regione (Calabria, Piemonte, Lombardia, Lazio, ecc.).
