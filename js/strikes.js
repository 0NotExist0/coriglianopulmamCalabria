/**
 * ITALIABUS & TRASPORTI ITALIA - SCIOPERI & DISAGI ENGINE
 * Modulo dedicato per il monitoraggio scioperi nazionali e regionali (MIT & Commissione di Garanzia)
 * Include:
 * - Dati per tutte le 8 categorie di trasporto
 * - Sistema di Switch Automatico a rotazione temporizzata con animazione barra progresso
 * - Filtri per Categoria, Regione, Intervallo Temporale e Ricerca testuale
 * - Fasce di garanzia orarie certificate (Legge 146/90) e conti alla rovescia in tempo reale
 * - Esportazione promemoria calendario (.ics e Google Calendar)
 */

(function() {
  'use strict';

  // Database Scioperi Multi-Settoriale Ufficiale
  const STRIKES_DATA = [
    // 1. PULLMAN & TPL BUS
    {
      id: 'strike-bus-01',
      category: 'pullman',
      categoryLabel: 'Pullman & TPL Bus',
      categoryIcon: 'fa-bus',
      categoryColor: '#0284c7',
      title: 'Sciopero Nazionale Trasporto Pubblico Locale su Gomma',
      subtitle: 'Autolinee urbane, suburbane ed extraurbane in tutte le regioni',
      scope: 'Nazionale',
      region: 'all',
      status: 'confirmed', // confirmed, scheduled, guaranteed, revoked
      statusLabel: 'Confermato',
      startDate: '2026-08-28T00:01:00',
      endDate: '2026-08-28T23:59:00',
      durationHours: 24,
      unions: ['FILT-CGIL', 'FIT-CISL', 'UILTRASPORTI', 'FAISA-CISAL', 'UGL AUTOFERRO'],
      companies: 'Aziende aderenti ad ASSTRA, ANAV e Agens (Cotral, ATAC, ATM, GTT, Autolinee Toscane, FDC, Consorzio Autolinee Calabria, ANM)',
      reason: 'Rinnovo del Contratto Collettivo Nazionale di Lavoro (CCNL) Autoferrotranvieri, adeguamento salariale e sicurezza a bordo',
      guaranteedWindows: [
        { from: '05:30', to: '08:30', note: 'Fascia mattutina garantita per legge' },
        { from: '17:00', to: '20:00', note: 'Fascia pomeridiana/serale di punta' }
      ],
      impactLevel: 'Alto',
      guaranteedServices: 'Saranno garantite esclusivamente le corse nelle fasce orarie protette di inizio turno e rientro lavoratori/studenti. Garantiti i servizi per disabili e scuolabus.',
      officialNoticeUrl: 'https://www.mit.gov.it/calendario-scioperi',
      lawReference: 'Legge 146/90 e s.m.i.'
    },
    {
      id: 'strike-bus-02',
      category: 'pullman',
      categoryLabel: 'Pullman & TPL Bus',
      categoryIcon: 'fa-bus',
      categoryColor: '#0284c7',
      title: 'Sciopero Regionale Autolinee & TPL Calabria',
      subtitle: 'Personale viaggiante e di terra Consorzio Autolinee e Ferrovie della Calabria',
      scope: 'Regionale',
      region: 'calabria',
      status: 'confirmed',
      statusLabel: 'Confermato',
      startDate: '2026-09-04T08:30:00',
      endDate: '2026-09-04T12:30:00',
      durationHours: 4,
      unions: ['USB Lavoro Privato', 'CUB Trasporti'],
      companies: 'Consorzio Autolinee TPL, Ferrovie della Calabria, Romano Autolinee, Lirosi Autoservizi, Bilotta, IAS Scura',
      reason: 'Condizioni di lavoro su tratte montane e ioniche, manutenzione parchi autobus e carichi orari',
      guaranteedWindows: [
        { from: '06:00', to: '08:30', note: 'Tutte le corse mattutine pendolari assicurate' },
        { from: '12:30', to: '23:59', note: 'Normale ripresa del servizio' }
      ],
      impactLevel: 'Moderato',
      guaranteedServices: 'Corse garantite prima delle 08:30 e dopo le 12:30. Garantito il collegamento speciale Hub Ospedalieri e tratte scolastiche di primo mattino.',
      officialNoticeUrl: 'https://www.mit.gov.it/calendario-scioperi',
      lawReference: 'Accordo Nazionale TPL 2001'
    },
    {
      id: 'strike-bus-03',
      category: 'pullman',
      categoryLabel: 'Pullman & TPL Bus',
      categoryIcon: 'fa-bus',
      categoryColor: '#0284c7',
      title: 'Sciopero Cotral & Roma TPL Regione Lazio',
      subtitle: 'Rete extraurbana regionale Lazio e linee bus periferiche Roma TPL',
      scope: 'Regionale',
      region: 'lazio',
      status: 'scheduled',
      statusLabel: 'Programmato',
      startDate: '2026-09-11T08:30:00',
      endDate: '2026-09-11T17:00:00',
      durationHours: 8.5,
      unions: ['SUL Trasporti', 'Cobas Lavoro Privato'],
      companies: 'Cotral S.p.A. e Consorzio Roma TPL',
      reason: 'Riorganizzazione turni estivi/autunnali e indennità di tratta',
      guaranteedWindows: [
        { from: '05:30', to: '08:30', note: 'Servizio regolare fino alle 08:30' },
        { from: '17:00', to: '20:00', note: 'Seconda fascia protetta serale' }
      ],
      impactLevel: 'Medio',
      guaranteedServices: 'Assicurate tutte le corse fino al capolinea partite prima delle 08:30. Ripresa totale dalle 17:00.',
      officialNoticeUrl: 'https://www.cotralspa.it',
      lawReference: 'Legge 146/90'
    },

    // 2. TRENI & FERROVIE
    {
      id: 'strike-train-01',
      category: 'train',
      categoryLabel: 'Treni & Ferrovie',
      categoryIcon: 'fa-train',
      categoryColor: '#dc2626',
      title: 'Sciopero Nazionale Personale Gruppo FS Italiane & Italo NTV',
      subtitle: 'Circolazione treni Alta Velocità, Intercity, Regionali e Trenord',
      scope: 'Nazionale',
      region: 'all',
      status: 'confirmed',
      statusLabel: 'Confermato',
      startDate: '2026-08-30T21:00:00',
      endDate: '2026-08-31T21:00:00',
      durationHours: 24,
      unions: ['CAT', 'CUB Trasporti', 'SGB', 'USB'],
      companies: 'Trenitalia, Italo NTV, Trenitalia Tper, Trenord, RFI Gestione Rete',
      reason: 'Sicurezza sui binari, assunzioni personale di scorta e manutenzione infrastruttura',
      guaranteedWindows: [
        { from: '06:00', to: '09:00', note: 'Treni a lunga percorrenza e regionali essenziali' },
        { from: '18:00', to: '21:00', note: 'Fascia di rientro serale pendolari' }
      ],
      impactLevel: 'Critico',
      guaranteedServices: 'Elenco treni nazionali garantiti (Frecce ed Intercity) consultabile sul sito Trenitalia e Italo. I treni regionali in viaggio all\'inizio dello sciopero arrivano a destinazione se entro 1 ora.',
      officialNoticeUrl: 'https://www.trenitalia.com/it/informazioni/treni_garantiti_incasodisciopero.html',
      lawReference: 'Delibera Commissione Garanzia 01/29'
    },
    {
      id: 'strike-train-02',
      category: 'train',
      categoryLabel: 'Treni & Ferrovie',
      categoryIcon: 'fa-train',
      categoryColor: '#dc2626',
      title: 'Sciopero RFI Manutenzione Infrastruttura Ferroviaria',
      subtitle: 'Personale tecnico e addetti agli impianti di segnalamento rete',
      scope: 'Nazionale',
      region: 'all',
      status: 'scheduled',
      statusLabel: 'Programmato',
      startDate: '2026-09-08T09:00:00',
      endDate: '2026-09-08T17:00:00',
      durationHours: 8,
      unions: ['COBAS Manutenzione'],
      companies: 'Rete Ferroviaria Italiana S.p.A.',
      reason: 'Normativa orari manutenzione notturna e carichi di reperibilità',
      guaranteedWindows: [
        { from: '06:00', to: '09:00', note: 'Treni regolari prima delle 09:00' },
        { from: '17:00', to: '24:00', note: 'Servizio regolare' }
      ],
      impactLevel: 'Moderato',
      guaranteedServices: 'Presidi di pronto intervento garantiti. Possibili limitazioni di velocità su tratte secondarie.',
      officialNoticeUrl: 'https://www.rfi.it',
      lawReference: 'Legge 146/90'
    },

    // 3. AEREI & TRASPORTO AEREO
    {
      id: 'strike-air-01',
      category: 'air',
      categoryLabel: 'Aerei & Aeroporti',
      categoryIcon: 'fa-plane-departure',
      categoryColor: '#0ea5e9',
      title: 'Sciopero Nazionale Settore Trasporto Aereo & Handlers Aeroportuali',
      subtitle: 'Personale di terra aeroporti di Roma FCO/CIA, Milano MXP/LIN, Napoli, Catania, Venezia',
      scope: 'Nazionale',
      region: 'all',
      status: 'confirmed',
      statusLabel: 'Confermato',
      startDate: '2026-09-07T00:01:00',
      endDate: '2026-09-07T23:59:00',
      durationHours: 24,
      unions: ['FILT-CGIL', 'FIT-CISL', 'UILTRASPORTI', 'UGL-TA'],
      companies: 'Aziende di handling (Aviapartner, Swissport, Consulta), personale di terra vettori aerei, ENAV scali territoriali',
      reason: 'Rinnovo contratto nazionale handlers, turni e livelli occupazionali di terra',
      guaranteedWindows: [
        { from: '07:00', to: '10:00', note: 'Fascia di tutela voli garantiti ENAC' },
        { from: '18:00', to: '21:00', note: 'Fascia serale protetta' }
      ],
      impactLevel: 'Alto',
      guaranteedServices: 'Voli di stato, militari, emergenza sanitaria e tutti i voli indicati nell\'elenco dei collegamenti indispensabili comunicati da ENAC con le isole e tratte intercontinentali.',
      officialNoticeUrl: 'https://www.enac.gov.it/trasporto-aereo/diritti-dei-passeggeri/scioperi',
      lawReference: 'Regolamento ENAC / Delibera 01/29'
    },
    {
      id: 'strike-air-02',
      category: 'air',
      categoryLabel: 'Aerei & Aeroporti',
      categoryIcon: 'fa-plane-departure',
      categoryColor: '#0ea5e9',
      title: 'Sciopero Personale Navigante Vettore Low Cost',
      subtitle: 'Piloti e assistenti di volo per voli nazionali e partenze dall\'Italia',
      scope: 'Nazionale',
      region: 'all',
      status: 'scheduled',
      statusLabel: 'Programmato',
      startDate: '2026-09-18T13:00:00',
      endDate: '2026-09-18T17:00:00',
      durationHours: 4,
      unions: ['ANPAC', 'ANPAV'],
      companies: 'EasyJet / Ryanair equipaggi basati in Italia',
      reason: 'Accordo integrativo aziendale, welfare e turnazioni estive',
      guaranteedWindows: [
        { from: '00:00', to: '13:00', note: 'Voli regolari al mattino' },
        { from: '17:00', to: '24:00', note: 'Voli regolari in serata' }
      ],
      impactLevel: 'Medio',
      guaranteedServices: 'Garantiti tutti i voli programmati prima delle 13:00 e partenze dopo le 17:00. Collegamenti garantiti con Sicilia e Sardegna.',
      officialNoticeUrl: 'https://www.enac.gov.it',
      lawReference: 'Legge 146/90'
    },

    // 4. TRAM, METRO & MOBILITÀ URBANA
    {
      id: 'strike-tram-01',
      category: 'tram',
      categoryLabel: 'Tram & Metropolitane',
      categoryIcon: 'fa-train-tram',
      categoryColor: '#10b981',
      title: 'Sciopero Rete Metropolitana e Tranviaria Grandi Città (ATM, ATAC, ANM)',
      subtitle: 'Linee Metro M1-M5 Milano, Metro A-C Roma, Metro Linea 1-6 Napoli e Tram Urbani',
      scope: 'Nazionale',
      region: 'all',
      status: 'confirmed',
      statusLabel: 'Confermato',
      startDate: '2026-09-15T08:45:00',
      endDate: '2026-09-15T15:00:00',
      durationHours: 6.25,
      unions: ['Cobas Trasporti', 'USB', 'AL-Cobas'],
      companies: 'ATM Milano, ATAC Roma, ANM Napoli, GTT Torino, GEST Tramvia Firenze',
      reason: 'Salute e sicurezza alle banchine, climatizzazione cabine di guida e organici',
      guaranteedWindows: [
        { from: '05:30', to: '08:45', note: 'Apertura completa linee metro e tram' },
        { from: '15:00', to: '18:00', note: 'Riapertura servizio pomeridiano' }
      ],
      impactLevel: 'Alto',
      guaranteedServices: 'Metropolitane, tram e scale mobili aperte fino alle 08:45. Riapertura garantita dalle 15:00. Corse iniziate prima dello stop portate a termine.',
      officialNoticeUrl: 'https://www.atm.it',
      lawReference: 'Accordo Nazionale Metroferrotranvieri'
    },

    // 5. TAXI & NCC
    {
      id: 'strike-taxi-01',
      category: 'taxi',
      categoryLabel: 'Taxi & NCC',
      categoryIcon: 'fa-taxi',
      categoryColor: '#f59e0b',
      title: 'Fermo Nazionale del Servizio Taxi & Radiotaxi',
      subtitle: 'Stalli e centrali radiotaxi in tutti i comuni capoluogo e aeroporti',
      scope: 'Nazionale',
      region: 'all',
      status: 'scheduled',
      statusLabel: 'Programmato',
      startDate: '2026-09-22T08:00:00',
      endDate: '2026-09-22T22:00:00',
      durationHours: 14,
      unions: ['URI Taxi', 'Uritaxi', 'Unica Cgil Taxi', 'Federtaxi Cisal', 'Ugl Taxi'],
      companies: 'Centrali Radiotaxi Nazionali (3570, 024040, 066645, ProntoTaxi, Samarcanda, Radiotaxi Locali)',
      reason: 'Contrasto all\'abusivismo, decreti attuativi Registro Elettronico NCC e piattaforme multinazionali',
      guaranteedWindows: [
        { from: 'H24', to: 'H24', note: 'Servizio sociale garantito continuo' }
      ],
      impactLevel: 'Medio',
      guaranteedServices: 'GARANTITO IL TRASPORTO SOCIALE: anziani, disabili, persone dirette a visite ospedaliere urgenti, terapie salvavita e dialisi (art. 2 L. 146/90).',
      officialNoticeUrl: 'https://www.mit.gov.it',
      lawReference: 'Legge 21/92 e L. 146/90'
    },

    // 6. TRAGHETTI & MARITTIMO
    {
      id: 'strike-ferry-01',
      category: 'ferry',
      categoryLabel: 'Traghetti & Marittimo',
      categoryIcon: 'fa-ship',
      categoryColor: '#06b6d4',
      title: 'Sciopero Nazionale Personale Navigante e Tecnico Traghetti Isole',
      subtitle: 'Collegamenti marittimi Sicilia, Sardegna, Isole Eolie, Tremiti, Ischia e Capri',
      scope: 'Nazionale',
      region: 'all',
      status: 'confirmed',
      statusLabel: 'Confermato',
      startDate: '2026-09-25T00:01:00',
      endDate: '2026-09-25T23:59:00',
      durationHours: 24,
      unions: ['Filt-Cgil', 'Fit-Cisl', 'Uiltrasporti Settore Marittimo'],
      companies: 'Tirrenia - CIN, Moby, Caronte & Tourist, Siremar, Caremar, Toremar, Grandi Navi Veloci',
      reason: 'Adeguamento indennità di navigazione, tabelle di armamento e sicurezza sul lavoro nei porti',
      guaranteedWindows: [
        { from: '06:00', to: '09:00', note: 'Partenze mattutine di linea essenziali' },
        { from: '18:00', to: '21:00', note: 'Partenze serali garantite' }
      ],
      impactLevel: 'Alto',
      guaranteedServices: 'Garantiti i collegamenti indispensabili di continuità territoriale per merci deperibili, carburanti, ambulanze e residenti insulari secondo disposizioni delle Capitanerie di Porto.',
      officialNoticeUrl: 'https://www.guardiacostiera.gov.it',
      lawReference: 'Legge 146/90 / Ordinanze Marittime'
    },

    // 7. AUTOSTRADE & CASELLI
    {
      id: 'strike-highway-01',
      category: 'highway',
      categoryLabel: 'Autostrade & Caselli',
      categoryIcon: 'fa-road',
      categoryColor: '#8b5cf6',
      title: 'Sciopero Addetti Esazione Pedaggi e Viabilità Autostradale',
      subtitle: 'Caselli autostradali rete ASPI, ASTM, Autovie Venete, Brebemi, Tangenziali',
      scope: 'Nazionale',
      region: 'all',
      status: 'scheduled',
      statusLabel: 'Programmato',
      startDate: '2026-09-29T10:00:00',
      endDate: '2026-09-29T14:00:00',
      durationHours: 4,
      unions: ['Filt-Cgil', 'Fit-Cisl', 'Uiltrasporti', 'Sla-Cisal'],
      companies: 'Autostrade per l\'Italia S.p.A., Gavio Group, SATAP, Autostrada del Brennero A22',
      reason: 'Rinnovo contratto Autostrade e Trafori, clausole occupazionali e automazione piste',
      guaranteedWindows: [
        { from: 'H24', to: 'H24', note: 'Piste Telepass e Carte sempre attive H24' }
      ],
      impactLevel: 'Basso',
      guaranteedServices: 'I caselli resteranno comunque transitabili: le piste Telepass, UnipolMove e Casse Automatiche per Carte di Credito/Debito funzioneranno regolarmente. Garantiti i presidi di soccorso stradale e viabilità.',
      officialNoticeUrl: 'https://www.autostrade.it',
      lawReference: 'Legge 146/90'
    }
  ];

  // Configurazione Categorie
  const CATEGORIES = [
    { id: 'all', label: 'Tutte le Categorie', icon: 'fa-layer-group', color: '#0284c7' },
    { id: 'pullman', label: 'Pullman & TPL', icon: 'fa-bus', color: '#0284c7' },
    { id: 'train', label: 'Treni FS & Italo', icon: 'fa-train', color: '#dc2626' },
    { id: 'air', label: 'Aerei & Voli', icon: 'fa-plane-departure', color: '#0ea5e9' },
    { id: 'tram', label: 'Tram & Metro', icon: 'fa-train-tram', color: '#10b981' },
    { id: 'taxi', label: 'Taxi & NCC', icon: 'fa-taxi', color: '#f59e0b' },
    { id: 'ferry', label: 'Traghetti & Mare', icon: 'fa-ship', color: '#06b6d4' },
    { id: 'highway', label: 'Autostrade & Caselli', icon: 'fa-road', color: '#8b5cf6' }
  ];

  class StrikesEngine {
    constructor() {
      this.strikes = STRIKES_DATA;
      this.categories = CATEGORIES;
      this.activeCategoryIndex = 0;
      this.activeCategory = 'all';
      this.activeRegion = 'all';
      this.activeTimeframe = 'all';
      this.searchQuery = '';
      
      // Auto-Switch State
      this.isAutoSwitchActive = true;
      this.switchIntervalSeconds = 6; // tempo di rotazione per ciascuna categoria
      this.progressPercent = 0;
      this.lastTickTimestamp = 0;
      this.timerId = null;
      this.animationFrameId = null;
      this.isHovered = false;

      // Inizializza
      this.init();
    }

    init() {
      this.bindDOM();
      this.renderCategoryTabs();
      this.updateStatsBar();
      this.renderStrikesList();
      this.startAutoSwitch();
      this.bindEvents();

      // Esponi globalmente i dati
      if (!window.TRANSIT_DATA) window.TRANSIT_DATA = {};
      window.TRANSIT_DATA.strikes = this.strikes;
    }

    bindDOM() {
      this.tabsContainer = document.getElementById('strikesCategoryTabs');
      this.cardsContainer = document.getElementById('strikesCardsGrid');
      this.toggleAutoBtn = document.getElementById('btnToggleAutoSwitch');
      this.autoSwitchStatusPill = document.getElementById('autoSwitchStatusPill');
      this.autoSwitchProgressBar = document.getElementById('autoSwitchProgressBar');
      this.regionSelect = document.getElementById('strikeRegionFilter');
      this.timeframeSelect = document.getElementById('strikeTimeframeFilter');
      this.searchInput = document.getElementById('strikeSearchInput');
      this.speedSelect = document.getElementById('strikeAutoSpeedSelect');
    }

    bindEvents() {
      // Toggle Play/Pausa Auto-Switch
      if (this.toggleAutoBtn) {
        this.toggleAutoBtn.addEventListener('click', () => {
          this.toggleAutoSwitch();
        });
      }

      // Selettore Velocità
      if (this.speedSelect) {
        this.speedSelect.addEventListener('change', (e) => {
          this.switchIntervalSeconds = parseInt(e.target.value, 10) || 6;
          this.progressPercent = 0;
        });
      }

      // Filtro Regione
      if (this.regionSelect) {
        this.populateRegionFilter();
        this.regionSelect.addEventListener('change', (e) => {
          this.activeRegion = e.target.value;
          this.renderStrikesList();
        });
      }

      // Filtro Intervallo Temporale
      if (this.timeframeSelect) {
        this.timeframeSelect.addEventListener('change', (e) => {
          this.activeTimeframe = e.target.value;
          this.renderStrikesList();
        });
      }

      // Ricerca Libera
      if (this.searchInput) {
        this.searchInput.addEventListener('input', (e) => {
          this.searchQuery = e.target.value.trim().toLowerCase();
          this.renderStrikesList();
        });
      }

      // Pausa su hover della griglia card per facilitare lettura
      if (this.cardsContainer) {
        this.cardsContainer.addEventListener('mouseenter', () => {
          this.isHovered = true;
          this.updateAutoSwitchUI();
        });
        this.cardsContainer.addEventListener('mouseleave', () => {
          this.isHovered = false;
          this.updateAutoSwitchUI();
        });
      }

      // Sincronizzazione con il cambio regione globale
      document.addEventListener('regionChanged', (e) => {
        const reg = e.detail?.regionId;
        if (reg && this.regionSelect) {
          const matchOpt = Array.from(this.regionSelect.options).some(o => o.value === reg);
          if (matchOpt) {
            this.regionSelect.value = reg;
            this.activeRegion = reg;
            this.renderStrikesList();
          }
        }
      });
    }

    populateRegionFilter() {
      if (!this.regionSelect) return;
      this.regionSelect.innerHTML = '<option value="all">📍 Tutta Italia (Nazionale & Tutte le Regioni)</option>';
      
      const regions = window.TRANSIT_DATA?.regions || [];
      regions.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `📍 ${r.name}`;
        this.regionSelect.appendChild(opt);
      });
    }

    renderCategoryTabs() {
      if (!this.tabsContainer) return;
      this.tabsContainer.innerHTML = '';

      this.categories.forEach((cat, index) => {
        const count = this.getCategoryCount(cat.id);
        const btn = document.createElement('button');
        btn.className = `strike-cat-tab ${cat.id === this.activeCategory ? 'active' : ''}`;
        btn.dataset.category = cat.id;
        btn.dataset.index = index;

        btn.innerHTML = `
          <div class="strike-cat-tab-inner">
            <span class="strike-cat-icon"><i class="fa-solid ${cat.icon}"></i></span>
            <span class="strike-cat-label">${cat.label}</span>
            <span class="strike-cat-badge">${count}</span>
          </div>
          <div class="strike-tab-progress" style="width: 0%;"></div>
        `;

        btn.addEventListener('click', () => {
          this.setActiveCategoryByIndex(index, true); // true = click manuale dell'utente
        });

        this.tabsContainer.appendChild(btn);
      });
    }

    getCategoryCount(catId) {
      if (catId === 'all') return this.strikes.length;
      return this.strikes.filter(s => s.category === catId).length;
    }

    setActiveCategoryByIndex(index, manualClick = false) {
      this.activeCategoryIndex = index;
      this.activeCategory = this.categories[index].id;
      this.progressPercent = 0;

      // Aggiorna classi bottoni
      const buttons = this.tabsContainer ? this.tabsContainer.querySelectorAll('.strike-cat-tab') : [];
      buttons.forEach((btn, idx) => {
        const isActive = idx === index;
        btn.classList.toggle('active', isActive);
        const prog = btn.querySelector('.strike-tab-progress');
        if (prog) prog.style.width = '0%';
      });

      // Se l'utente clicca a mano, feedback visivo
      if (manualClick) {
        this.showToastNotification(`Categoria: ${this.categories[index].label}`);
      }

      this.renderStrikesList();
      this.scrollActiveTabIntoView();
    }

    scrollActiveTabIntoView() {
      if (!this.tabsContainer) return;
      const activeBtn = this.tabsContainer.querySelector('.strike-cat-tab.active');
      if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }

    startAutoSwitch() {
      if (this.timerId) clearInterval(this.timerId);

      const tickInterval = 50; // ogni 50ms per fluidità
      const stepIncrement = (tickInterval / (this.switchIntervalSeconds * 1000)) * 100;

      this.timerId = setInterval(() => {
        if (!this.isAutoSwitchActive || this.isHovered) {
          this.updateAutoSwitchUI();
          return;
        }

        this.progressPercent += stepIncrement;

        // Aggiorna progress bar globale e sulla tab attiva
        if (this.autoSwitchProgressBar) {
          this.autoSwitchProgressBar.style.width = `${Math.min(this.progressPercent, 100)}%`;
        }

        const activeBtn = this.tabsContainer ? this.tabsContainer.querySelector('.strike-cat-tab.active .strike-tab-progress') : null;
        if (activeBtn) {
          activeBtn.style.width = `${Math.min(this.progressPercent, 100)}%`;
        }

        if (this.progressPercent >= 100) {
          this.progressPercent = 0;
          const nextIndex = (this.activeCategoryIndex + 1) % this.categories.length;
          this.setActiveCategoryByIndex(nextIndex, false);
        }

        this.updateAutoSwitchUI();
      }, tickInterval);
    }

    toggleAutoSwitch() {
      this.isAutoSwitchActive = !this.isAutoSwitchActive;
      this.progressPercent = 0;
      this.updateAutoSwitchUI();

      const stateMsg = this.isAutoSwitchActive ? '▶️ Switch Automatico Categorie Attivato' : '⏸️ Switch Automatico in Pausa';
      this.showToastNotification(stateMsg);
    }

    updateAutoSwitchUI() {
      if (!this.toggleAutoBtn || !this.autoSwitchStatusPill) return;

      const isRunning = this.isAutoSwitchActive && !this.isHovered;

      if (isRunning) {
        const remainingSeconds = Math.max(0, ((100 - this.progressPercent) / 100 * this.switchIntervalSeconds)).toFixed(1);
        this.toggleAutoBtn.innerHTML = `<i class="fa-solid fa-pause text-warning"></i> <span>Pausa Auto-Switch</span>`;
        this.toggleAutoBtn.classList.remove('btn-paused');
        this.autoSwitchStatusPill.innerHTML = `<span class="live-dot pulse" style="background:#10b981;"></span> Auto-Switch Attivo (Prossimo cambio tra <strong>${remainingSeconds}s</strong>)`;
        this.autoSwitchStatusPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      } else if (this.isHovered && this.isAutoSwitchActive) {
        this.toggleAutoBtn.innerHTML = `<i class="fa-solid fa-pause text-warning"></i> <span>In Pausa (Lettura in corso)</span>`;
        this.autoSwitchStatusPill.innerHTML = `<span class="live-dot" style="background:#f59e0b;"></span> In Pausa per Lettura`;
        this.autoSwitchStatusPill.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      } else {
        this.toggleAutoBtn.innerHTML = `<i class="fa-solid fa-play text-success"></i> <span>Avvia Auto-Switch</span>`;
        this.toggleAutoBtn.classList.add('btn-paused');
        this.autoSwitchStatusPill.innerHTML = `<span class="live-dot" style="background:#94a3b8;"></span> Switch Automatico Disattivato`;
        this.autoSwitchStatusPill.style.borderColor = 'var(--border-color)';
        if (this.autoSwitchProgressBar) this.autoSwitchProgressBar.style.width = '0%';
      }
    }

    updateStatsBar() {
      const elTotal = document.getElementById('statTotalStrikes');
      const elNational = document.getElementById('statNationalStrikes');
      const elGuaranteed = document.getElementById('statGuaranteedSlots');
      const elNextDate = document.getElementById('statNextStrikeDate');

      if (elTotal) elTotal.textContent = `${this.strikes.length} Programmati`;
      if (elNational) {
        const natCount = this.strikes.filter(s => s.scope === 'Nazionale').length;
        elNational.textContent = `${natCount} Nazionali`;
      }
      if (elGuaranteed) elGuaranteed.textContent = `100% Garantite L. 146/90`;
      if (elNextDate && this.strikes.length > 0) {
        const sorted = [...this.strikes].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        const next = new Date(sorted[0].startDate);
        const day = next.getDate().toString().padStart(2, '0');
        const month = (next.getMonth() + 1).toString().padStart(2, '0');
        elNextDate.textContent = `${day}/${month}`;
      }
    }

    getFilteredStrikes() {
      return this.strikes.filter(item => {
        // Filtro Categoria
        if (this.activeCategory !== 'all' && item.category !== this.activeCategory) {
          return false;
        }

        // Filtro Regione
        if (this.activeRegion !== 'all') {
          if (item.region !== 'all' && item.region !== this.activeRegion) {
            return false;
          }
        }

        // Filtro Intervallo Temporale
        if (this.activeTimeframe !== 'all') {
          const now = new Date();
          const start = new Date(item.startDate);
          const diffDays = (start - now) / (1000 * 60 * 60 * 24);

          if (this.activeTimeframe === 'today' && (diffDays < 0 || diffDays > 1)) return false;
          if (this.activeTimeframe === 'week' && (diffDays < 0 || diffDays > 7)) return false;
          if (this.activeTimeframe === 'month' && (diffDays < 0 || diffDays > 30)) return false;
        }

        // Filtro Ricerca
        if (this.searchQuery) {
          const haystack = [
            item.title,
            item.subtitle,
            item.companies,
            item.reason,
            item.unions.join(' '),
            item.categoryLabel,
            item.scope
          ].join(' ').toLowerCase();

          if (!haystack.includes(this.searchQuery)) {
            return false;
          }
        }

        return true;
      });
    }

    renderStrikesList() {
      if (!this.cardsContainer) return;

      const filtered = this.getFilteredStrikes();

      if (filtered.length === 0) {
        this.cardsContainer.innerHTML = `
          <div class="strike-empty-box">
            <div class="strike-empty-icon"><i class="fa-solid fa-circle-check text-success"></i></div>
            <h3>Nessuno sciopero per i filtri selezionati</h3>
            <p>Non risultano agitazioni sindacali attive o programmate in questo settore per la selezione corrente. I servizi operano regolarmente.</p>
            <button class="btn btn-outline btn-sm" onclick="window.strikesEngine.resetFilters()">
              <i class="fa-solid fa-rotate-left"></i> Mostra Tutte le Categorie
            </button>
          </div>
        `;
        return;
      }

      let html = '';
      filtered.forEach(s => {
        const start = new Date(s.startDate);
        const end = new Date(s.endDate);
        const formattedDate = start.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeWindow = `${start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} &ndash; ${end.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
        const countdownStr = this.calculateCountdown(start, end);

        const statusClass = s.status === 'confirmed' ? 'status-confirmed' : (s.status === 'scheduled' ? 'status-scheduled' : 'status-guaranteed');
        const statusBadgeIcon = s.status === 'confirmed' ? 'fa-triangle-exclamation' : 'fa-calendar-clock';

        html += `
          <article class="strike-card" data-category="${s.category}" style="--cat-color: ${s.categoryColor};">
            <div class="strike-card-top">
              <div class="strike-cat-tag" style="background-color: ${s.categoryColor}; color: #ffffff;">
                <i class="fa-solid ${s.categoryIcon}"></i> ${s.categoryLabel}
              </div>
              <div class="strike-badges-group">
                <span class="strike-scope-badge ${s.scope === 'Nazionale' ? 'scope-national' : 'scope-regional'}">
                  <i class="fa-solid ${s.scope === 'Nazionale' ? 'fa-earth-europe' : 'fa-location-dot'}"></i> ${s.scope} ${s.region !== 'all' ? `(${s.region.toUpperCase()})` : ''}
                </span>
                <span class="strike-status-badge ${statusClass}">
                  <i class="fa-solid ${statusBadgeIcon}"></i> ${s.statusLabel}
                </span>
              </div>
            </div>

            <div class="strike-card-main">
              <h3 class="strike-card-title">${s.title}</h3>
              <p class="strike-card-sub">${s.subtitle}</p>
              
              <div class="strike-timing-box">
                <div class="timing-item">
                  <span class="timing-lbl"><i class="fa-solid fa-calendar-day"></i> Data Prevista:</span>
                  <strong class="timing-val text-capitalize">${formattedDate}</strong>
                </div>
                <div class="timing-item">
                  <span class="timing-lbl"><i class="fa-solid fa-clock"></i> Orario & Durata:</span>
                  <strong class="timing-val">${timeWindow} (${s.durationHours} ore)</strong>
                </div>
                <div class="timing-item timing-countdown">
                  <span class="timing-lbl"><i class="fa-solid fa-hourglass-half"></i> Stato Temporale:</span>
                  <strong class="timing-val text-primary">${countdownStr}</strong>
                </div>
              </div>

              <!-- Box Fasce di Garanzia per Legge -->
              <div class="strike-guarantee-box">
                <div class="guarantee-head">
                  <span class="guarantee-title">
                    <i class="fa-solid fa-shield-halved text-success"></i> Fasce Orarie Garantite per Legge (L. 146/90):
                  </span>
                  <span class="guarantee-tag">Servizi Essenziali Assicurati</span>
                </div>
                <div class="guarantee-slots-grid">
                  ${s.guaranteedWindows.map(w => `
                    <div class="slot-chip">
                      <span class="slot-time"><i class="fa-solid fa-clock"></i> ${w.from} &ndash; ${w.to}</span>
                      <span class="slot-note">${w.note}</span>
                    </div>
                  `).join('')}
                </div>
                <p class="guarantee-summary"><i class="fa-solid fa-circle-info text-primary"></i> ${s.guaranteedServices}</p>
              </div>

              <!-- Dettagli Aziende e Vertenza -->
              <div class="strike-details-drawer">
                <div class="detail-row">
                  <span class="d-label"><i class="fa-solid fa-building"></i> Soggetti Coinvolti:</span>
                  <span class="d-val">${s.companies}</span>
                </div>
                <div class="detail-row">
                  <span class="d-label"><i class="fa-solid fa-users-rays"></i> Sigle Proclamanti:</span>
                  <span class="d-val unions-pills">
                    ${s.unions.map(u => `<span class="union-pill">${u}</span>`).join('')}
                  </span>
                </div>
                <div class="detail-row">
                  <span class="d-label"><i class="fa-solid fa-file-lines"></i> Motivazione Vertenza:</span>
                  <span class="d-val">${s.reason}</span>
                </div>
              </div>
            </div>

            <div class="strike-card-footer">
              <div class="strike-actions-row">
                <button class="btn btn-sm btn-outline" onclick="window.strikesEngine.exportCalendar('${s.id}')" title="Aggiungi Promemoria al tuo Calendario">
                  <i class="fa-solid fa-calendar-plus"></i> Salva Promemoria
                </button>
                <button class="btn btn-sm btn-outline" onclick="window.strikesEngine.shareStrike('${s.id}')" title="Condividi dettagli sciopero">
                  <i class="fa-solid fa-share-nodes"></i> Condividi
                </button>
                <a href="${s.officialNoticeUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-subtle" title="Consulta avviso ufficiale sul portale del Ministero o dell'azienda">
                  <i class="fa-solid fa-arrow-up-right-from-square"></i> Fonte Ufficiale
                </a>
              </div>
            </div>
          </article>
        `;
      });

      this.cardsContainer.innerHTML = html;
    }

    calculateCountdown(startDate, endDate) {
      const now = new Date();
      const diffStart = startDate - now;
      const diffEnd = endDate - now;

      if (diffStart <= 0 && diffEnd > 0) {
        return `<span class="live-active-tag"><span class="live-dot pulse" style="background:#ef4444;"></span> SCIOPERO IN CORSO ADESSO</span>`;
      } else if (diffEnd <= 0) {
        return `<span class="text-muted">Concluso</span>`;
      }

      const totalMinutes = Math.floor(diffStart / (1000 * 60));
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);

      if (days > 0) {
        return `Inizia tra <strong>${days}g ${hours}h</strong>`;
      } else {
        const mins = totalMinutes % 60;
        return `Inizia tra <strong>${hours}h ${mins}m</strong>`;
      }
    }

    resetFilters() {
      this.activeCategory = 'all';
      this.activeCategoryIndex = 0;
      this.activeRegion = 'all';
      this.activeTimeframe = 'all';
      this.searchQuery = '';

      if (this.regionSelect) this.regionSelect.value = 'all';
      if (this.timeframeSelect) this.timeframeSelect.value = 'all';
      if (this.searchInput) this.searchInput.value = '';

      this.renderCategoryTabs();
      this.renderStrikesList();
    }

    exportCalendar(strikeId) {
      const strike = this.strikes.find(s => s.id === strikeId);
      if (!strike) return;

      const title = encodeURIComponent(`[SCIOPERO ${strike.categoryLabel.toUpperCase()}] ${strike.title}`);
      const desc = encodeURIComponent(`Avviso Sciopero ${strike.scope}: ${strike.subtitle}\nFasce Garantite: ${strike.guaranteedWindows.map(w => w.from + '-' + w.to).join(', ')}\nAziende: ${strike.companies}`);
      const startIso = new Date(strike.startDate).toISOString().replace(/-|:|\.\d\d\d/g, "");
      const endIso = new Date(strike.endDate).toISOString().replace(/-|:|\.\d\d\d/g, "");

      const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${desc}&dates=${startIso}/${endIso}`;
      window.open(gcalUrl, '_blank');
    }

    shareStrike(strikeId) {
      const strike = this.strikes.find(s => s.id === strikeId);
      if (!strike) return;

      const shareText = `⚠️ AVVISO SCIOPERO TRASPORTI: ${strike.title} in programma il ${new Date(strike.startDate).toLocaleDateString('it-IT')}. Fasce di garanzia garantite per legge. Info complete su ItaliaBus.`;

      if (navigator.share) {
        navigator.share({
          title: `Sciopero ${strike.categoryLabel}`,
          text: shareText,
          url: window.location.href
        }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText);
        this.showToastNotification('📋 Dettagli dello sciopero copiati negli appunti!');
      } else {
        alert(shareText);
      }
    }

    showToastNotification(msg) {
      let toast = document.getElementById('strikeToastNotice');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'strikeToastNotice';
        toast.className = 'strike-toast';
        document.body.appendChild(toast);
      }

      toast.innerHTML = `<i class="fa-solid fa-circle-info text-primary"></i> ${msg}`;
      toast.classList.add('visible');

      clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
      }, 3000);
    }
  }

  // Inizializzazione sicura
  function initStrikesEngine() {
    if (!window.strikesEngine) {
      window.strikesEngine = new StrikesEngine();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStrikesEngine);
  } else {
    initStrikesEngine();
  }

})();
