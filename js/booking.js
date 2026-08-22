/**
 * ITALIABUS - TICKET BOOKING & DIGITAL QR TICKET GENERATION ENGINE
 * Gestione completa prenotazione, mappa interattiva dei posti,
 * simulazione checkout e generazione biglietto elettronico con QR Code dinamico.
 */

class BookingEngine {
  constructor() {
    this.modal = document.getElementById("bookingModal");
    this.ticketViewerModal = document.getElementById("ticketViewerModal");
    this.myTicketsContainer = document.getElementById("myTicketsList");
    this.walletBadgeCount = document.getElementById("walletBadgeCount");

    this.currentTrip = null;
    this.currentStep = 1;
    this.selectedSeats = [];
    this.ticketType = "single"; // 'single', 'roundtrip', 'carnet', 'monthly'
    this.selectedExtras = {
      luggage: false,
      bike: false,
      sms: false
    };

    this.passengerInfo = {
      name: "",
      surname: "",
      email: "",
      phone: "",
      fiscalCode: ""
    };

    this.init();
  }

  init() {
    this.bindGlobalEvents();
    this.updateWalletBadge();
  }

  showComingSoon() {
    alert('🚀 Funzionalità in arrivo! L\'acquisto biglietti online sarà disponibile a breve. Resta aggiornato!');
  }

  bindGlobalEvents() {
    // Chiusura modali su click overlay o tasti close
    document.querySelectorAll(".modal-close-btn, .modal-backdrop").forEach(el => {
      el.addEventListener("click", (e) => {
        if (e.target === el || el.classList.contains("modal-close-btn")) {
          this.closeModals();
        }
      });
    });

    // Tasti navigazione wizard
    const nextBtn = document.getElementById("btnNextStep");
    const prevBtn = document.getElementById("btnPrevStep");
    const submitBtn = document.getElementById("btnConfirmPurchase");

    if (nextBtn) nextBtn.addEventListener("click", () => this.nextStep());
    if (prevBtn) prevBtn.addEventListener("click", () => this.prevStep());
    if (submitBtn) submitBtn.addEventListener("click", () => this.processPayment());
  }

  // Avvio rapido dal tabellone live partenze
  openQuickBooking(lineId, originStopId, timeIso) {
    this.showComingSoon();
    return;
  }

  // Avvio prenotazione da ricerca
  startTripBooking(tripData) {
    this.showComingSoon();
    return;
  }

  openModal() {
    if (this.modal) {
      this.modal.classList.add("show");
      document.body.style.overflow = "hidden";
    }
  }

  closeModals() {
    if (this.modal) this.modal.classList.remove("show");
    if (this.ticketViewerModal) this.ticketViewerModal.classList.remove("show");
    document.body.style.overflow = "auto";
  }

  renderStep(step) {
    this.currentStep = step;
    const wizardContent = document.getElementById("bookingWizardBody");
    const stepIndicators = document.querySelectorAll(".wizard-step-indicator");
    const prevBtn = document.getElementById("btnPrevStep");
    const nextBtn = document.getElementById("btnNextStep");
    const submitBtn = document.getElementById("btnConfirmPurchase");

    stepIndicators.forEach((ind, i) => {
      ind.classList.toggle("active", i + 1 === step);
      ind.classList.toggle("completed", i + 1 < step);
    });

    if (prevBtn) prevBtn.style.display = step > 1 ? "inline-flex" : "none";
    if (nextBtn) nextBtn.style.display = step < 4 ? "inline-flex" : "none";
    if (submitBtn) submitBtn.style.display = step === 4 ? "inline-flex" : "none";

    switch (step) {
      case 1:
        this.renderStep1TripConfig(wizardContent);
        break;
      case 2:
        this.renderStep2SeatSelection(wizardContent);
        break;
      case 3:
        this.renderStep3PassengerData(wizardContent);
        break;
      case 4:
        this.renderStep4CheckoutSummary(wizardContent);
        break;
    }
  }

  // STEP 1: Riepilogo corsa e tipo tariffa
  renderStep1TripConfig(container) {
    const trip = this.currentTrip;
    const line = trip.line || (trip.leg1 && trip.leg1.line);

    container.innerHTML = `
      <div class="step-pane animate-fade">
        <div class="booking-trip-summary-box">
          <div class="trip-summary-head" style="border-left: 4px solid ${line.color}">
            <div class="line-badge" style="background-color: ${line.color}">
              <i class="fa-solid fa-bus"></i> ${line.code}
            </div>
            <div>
              <h4>${trip.origin.name} &rarr; ${trip.destination.name}</h4>
              <p class="text-muted"><i class="fa-regular fa-calendar"></i> ${trip.dateStr} &bull; Partenza ore <strong>${trip.departureTimeStr}</strong> (Arrivo previsto: ${trip.arrivalTimeStr})</p>
            </div>
          </div>
        </div>

        <h4 class="section-subheading"><i class="fa-solid fa-tags"></i> Scegli la Tipologia di Biglietto:</h4>
        <div class="ticket-type-grid">
          <label class="ticket-type-card ${this.ticketType === 'single' ? 'selected' : ''}">
            <input type="radio" name="ticketType" value="single" ${this.ticketType === 'single' ? 'checked' : ''} onchange="window.bookingEngine.setTicketType('single')">
            <div class="type-card-content">
              <span class="type-badge">Corsa Singola</span>
              <div class="type-price">€${trip.price.toFixed(2)}</div>
              <p>Valido per 1 corsa nella fascia oraria prescelta con posto a sedere garantito.</p>
            </div>
          </label>

          <label class="ticket-type-card ${this.ticketType === 'roundtrip' ? 'selected' : ''}">
            <input type="radio" name="ticketType" value="roundtrip" ${this.ticketType === 'roundtrip' ? 'checked' : ''} onchange="window.bookingEngine.setTicketType('roundtrip')">
            <div class="type-card-content">
              <span class="type-badge badge-discount">Andata & Ritorno (-15%)</span>
              <div class="type-price">€${(trip.price * 2 * 0.85).toFixed(2)}</div>
              <p>Include il viaggio di ritorno open utilizzabile entro 7 giorni.</p>
            </div>
          </label>

          <label class="ticket-type-card ${this.ticketType === 'carnet' ? 'selected' : ''}">
            <input type="radio" name="ticketType" value="carnet" ${this.ticketType === 'carnet' ? 'checked' : ''} onchange="window.bookingEngine.setTicketType('carnet')">
            <div class="type-card-content">
              <span class="type-badge badge-save">Carnet 10 Corse</span>
              <div class="type-price">€${(trip.price * 8.2).toFixed(2)}</div>
              <p>Pacchetto 10 viaggi cedibile e senza data di scadenza.</p>
            </div>
          </label>

          <label class="ticket-type-card ${this.ticketType === 'monthly' ? 'selected' : ''}">
            <input type="radio" name="ticketType" value="monthly" ${this.ticketType === 'monthly' ? 'checked' : ''} onchange="window.bookingEngine.setTicketType('monthly')">
            <div class="type-card-content">
              <span class="type-badge badge-sub">Abbonamento Mensile</span>
              <div class="type-price">€${line.type === 'urban' ? '28.00' : '45.00'}</div>
              <p>Corse illimitate per tutto il mese solare per studenti o lavoratori pendolari.</p>
            </div>
          </label>
        </div>

        <h4 class="section-subheading mt-4"><i class="fa-solid fa-cubes"></i> Servizi Extra Opzionali:</h4>
        <div class="extras-checkbox-list">
          <label class="extra-item-row">
            <input type="checkbox" id="extraLuggage" ${this.selectedExtras.luggage ? 'checked' : ''} onchange="window.bookingEngine.toggleExtra('luggage')">
            <span class="extra-icon"><i class="fa-solid fa-suitcase-rolling"></i></span>
            <div class="extra-info">
              <strong>Bagaglio Extra in Stiva (Valigia XL)</strong>
              <small>Fino a 23 kg con etichetta di tracciamento</small>
            </div>
            <span class="extra-cost">+€1.50</span>
          </label>

          <label class="extra-item-row">
            <input type="checkbox" id="extraBike" ${this.selectedExtras.bike ? 'checked' : ''} onchange="window.bookingEngine.toggleExtra('bike')">
            <span class="extra-icon"><i class="fa-solid fa-bicycle"></i></span>
            <div class="extra-info">
              <strong>Posto Bicicletta / Monopattino Elettrico</strong>
              <small>Alloggio sicuro su rastrelliera posteriore</small>
            </div>
            <span class="extra-cost">+€2.00</span>
          </label>

          <label class="extra-item-row">
            <input type="checkbox" id="extraSms" ${this.selectedExtras.sms ? 'checked' : ''} onchange="window.bookingEngine.toggleExtra('sms')">
            <span class="extra-icon"><i class="fa-solid fa-comment-sms"></i></span>
            <div class="extra-info">
              <strong>Notifica SMS & Biglietto sul Cellulare</strong>
              <small>Avviso in tempo reale in caso di variazione banchina o ritardi</small>
            </div>
            <span class="extra-cost">+€0.30</span>
          </label>
        </div>
      </div>
    `;
  }

  setTicketType(type) {
    this.ticketType = type;
    this.renderStep(1);
  }

  toggleExtra(key) {
    this.selectedExtras[key] = !this.selectedExtras[key];
  }

  // STEP 2: Mappa Interattiva dei Posti a Bordo
  renderStep2SeatSelection(container) {
    const trip = this.currentTrip;
    const line = trip.line || (trip.leg1 && trip.leg1.line);
    const totalSeats = 48; // Standard coach

    // Genera alcuni posti già occupati casuali per realismo (ma sempre gli stessi per la sessione)
    if (!this.occupiedSeatsList) {
      this.occupiedSeatsList = [3, 4, 7, 11, 12, 18, 19, 23, 24, 31, 35, 42];
    }

    container.innerHTML = `
      <div class="step-pane animate-fade">
        <div class="seat-picker-header">
          <div>
            <h4><i class="fa-solid fa-chair"></i> Scegli il tuo posto a bordo:</h4>
            <p class="text-muted">Pullman: <strong>${line.busModel}</strong> &bull; Linea ${line.code}</p>
          </div>
          <div class="seat-legend">
            <span class="leg-item"><span class="leg-box leg-avail"></span> Libero</span>
            <span class="leg-item"><span class="leg-box leg-selected"></span> Selezionato</span>
            <span class="leg-item"><span class="leg-box leg-occupied"></span> Occupato</span>
            <span class="leg-item"><span class="leg-box leg-priority"></span> Riservato PMR</span>
          </div>
        </div>

        <div class="coach-visualizer-container">
          <div class="coach-cockpit">
            <div class="steering-wheel" title="Postazione Autista"><i class="fa-solid fa-dharmachakra"></i> Autista</div>
            <div class="front-door" title="Porta Anteriore di Salita"><i class="fa-solid fa-door-open"></i> Salita</div>
          </div>

          <div class="coach-seats-grid" id="coachSeatsGrid">
            <!-- Renderizzato via loop -->
          </div>

          <div class="coach-rear">
            <div class="rear-door"><i class="fa-solid fa-door-open"></i> Uscita</div>
            <div class="rear-wc"><i class="fa-solid fa-restroom"></i> WC</div>
          </div>
        </div>

        <div class="selected-seats-recap">
          <span>Posti selezionati: <strong id="selectedSeatsLabel">${this.selectedSeats.length > 0 ? this.selectedSeats.join(', ') : 'Nessun posto scelto (assegnazione automatica)'}</strong></span>
        </div>
      </div>
    `;

    // Popola la griglia dei sedili (4 posti per fila: 2 a sinistra, corridoio, 2 a destra)
    const grid = document.getElementById("coachSeatsGrid");
    if (!grid) return;

    let seatNumber = 1;
    const numRows = 12;

    for (let r = 1; r <= numRows; r++) {
      const rowEl = document.createElement("div");
      rowEl.className = "coach-row";

      // Posto A (Finestrino Sinistro)
      rowEl.appendChild(this.createSeatEl(seatNumber++, r <= 2));
      // Posto B (Corridoio Sinistro)
      rowEl.appendChild(this.createSeatEl(seatNumber++, r <= 2));

      // Corridoio
      const aisle = document.createElement("div");
      aisle.className = "coach-aisle";
      aisle.textContent = `Fila ${r}`;
      rowEl.appendChild(aisle);

      // Posto C (Corridoio Destro)
      rowEl.appendChild(this.createSeatEl(seatNumber++, false));
      // Posto D (Finestrino Destro)
      rowEl.appendChild(this.createSeatEl(seatNumber++, false));

      grid.appendChild(rowEl);
    }
  }

  createSeatEl(seatNum, isPriority) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "seat-btn";
    btn.dataset.seat = seatNum;

    const isOccupied = this.occupiedSeatsList.includes(seatNum);
    const isSelected = this.selectedSeats.includes(seatNum);

    if (isOccupied) {
      btn.classList.add("occupied");
      btn.disabled = true;
      btn.innerHTML = `<span class="seat-num">${seatNum}</span><i class="fa-solid fa-user-xmark"></i>`;
    } else if (isPriority) {
      btn.classList.add("priority");
      if (isSelected) btn.classList.add("selected");
      btn.innerHTML = `<span class="seat-num">${seatNum}</span><i class="fa-solid fa-wheelchair"></i>`;
      btn.addEventListener("click", () => this.toggleSeat(seatNum, btn));
    } else {
      if (isSelected) btn.classList.add("selected");
      btn.innerHTML = `<span class="seat-num">${seatNum}</span><i class="fa-solid fa-couch"></i>`;
      btn.addEventListener("click", () => this.toggleSeat(seatNum, btn));
    }

    return btn;
  }

  toggleSeat(seatNum, btn) {
    const idx = this.selectedSeats.indexOf(seatNum);
    const maxSeats = this.currentTrip.passengers || 1;

    if (idx !== -1) {
      this.selectedSeats.splice(idx, 1);
      btn.classList.remove("selected");
    } else {
      if (this.selectedSeats.length >= maxSeats) {
        // Se ha già selezionato il numero massimo di posti, togli il primo
        const first = this.selectedSeats.shift();
        const oldBtn = document.querySelector(`.seat-btn[data-seat="${first}"]`);
        if (oldBtn) oldBtn.classList.remove("selected");
      }
      this.selectedSeats.push(seatNum);
      btn.classList.add("selected");
    }

    const label = document.getElementById("selectedSeatsLabel");
    if (label) {
      label.textContent = this.selectedSeats.length > 0 ? this.selectedSeats.join(', ') : 'Nessun posto scelto (assegnazione automatica)';
    }
  }

  // STEP 3: Dati del Passeggero
  renderStep3PassengerData(container) {
    container.innerHTML = `
      <div class="step-pane animate-fade">
        <h4 class="section-subheading"><i class="fa-solid fa-id-card"></i> Inserisci i dati per l'emissione del biglietto:</h4>
        <form id="passengerDataForm" class="passenger-form-grid">
          <div class="form-group">
            <label>Nome *</label>
            <input type="text" id="passName" class="form-control" placeholder="Es. Mario" value="${this.passengerInfo.name || ''}" required>
          </div>

          <div class="form-group">
            <label>Cognome *</label>
            <input type="text" id="passSurname" class="form-control" placeholder="Es. Rossi" value="${this.passengerInfo.surname || ''}" required>
          </div>

          <div class="form-group">
            <label>Email per invio Biglietto & QR *</label>
            <input type="email" id="passEmail" class="form-control" placeholder="Es. mario.rossi@email.it" value="${this.passengerInfo.email || ''}" required>
          </div>

          <div class="form-group">
            <label>Numero di Telefono *</label>
            <input type="tel" id="passPhone" class="form-control" placeholder="Es. +39 340 1234567" value="${this.passengerInfo.phone || ''}" required>
          </div>

          <div class="form-group full-width">
            <label>Codice Fiscale (Opzionale per detrazione fiscale o abbonamenti)</label>
            <input type="text" id="passFiscal" class="form-control text-uppercase" placeholder="Es. RSSMRA80A01D086X" value="${this.passengerInfo.fiscalCode || ''}">
            <small class="form-hint">Necessario per usufruire del Bonus Trasporti o detrazione fiscale 19%.</small>
          </div>
        </form>
      </div>
    `;
  }

  savePassengerInputs() {
    const nameEl = document.getElementById("passName");
    const surnameEl = document.getElementById("passSurname");
    const emailEl = document.getElementById("passEmail");
    const phoneEl = document.getElementById("passPhone");
    const fiscalEl = document.getElementById("passFiscal");

    if (nameEl) this.passengerInfo.name = nameEl.value.trim();
    if (surnameEl) this.passengerInfo.surname = surnameEl.value.trim();
    if (emailEl) this.passengerInfo.email = emailEl.value.trim();
    if (phoneEl) this.passengerInfo.phone = phoneEl.value.trim();
    if (fiscalEl) this.passengerInfo.fiscalCode = fiscalEl.value.trim().toUpperCase();

    if (!this.passengerInfo.name || !this.passengerInfo.surname || !this.passengerInfo.email) {
      alert("Compila tutti i campi obbligatori (Nome, Cognome ed Email).");
      return false;
    }
    return true;
  }

  // STEP 4: Checkout e Pagamento
  renderStep4CheckoutSummary(container) {
    const trip = this.currentTrip;
    const line = trip.line || (trip.leg1 && trip.leg1.line);

    // Calcolo totale
    let basePrice = trip.price;
    if (this.ticketType === 'roundtrip') basePrice = trip.price * 2 * 0.85;
    if (this.ticketType === 'carnet') basePrice = trip.price * 8.2;
    if (this.ticketType === 'monthly') basePrice = line.type === 'urban' ? 28.00 : 45.00;

    let extrasCost = 0;
    if (this.selectedExtras.luggage) extrasCost += 1.50;
    if (this.selectedExtras.bike) extrasCost += 2.00;
    if (this.selectedExtras.sms) extrasCost += 0.30;

    const totalFinal = (basePrice * (trip.passengers || 1)) + extrasCost;

    container.innerHTML = `
      <div class="step-pane animate-fade">
        <div class="checkout-grid">
          <div class="checkout-summary-card">
            <h4><i class="fa-solid fa-receipt"></i> Dettaglio del Viaggio</h4>
            <div class="summary-details-list">
              <div class="sum-row">
                <span>Tratta:</span>
                <strong>${trip.origin.name.split(' - ')[0]} &rarr; ${trip.destination.name.split(' - ')[0]}</strong>
              </div>
              <div class="sum-row">
                <span>Linea & Operatore:</span>
                <span>${line.name} (${line.operator})</span>
              </div>
              <div class="sum-row">
                <span>Data & Orario:</span>
                <strong>${trip.dateStr} &bull; ${trip.departureTimeStr}</strong>
              </div>
              <div class="sum-row">
                <span>Passeggero:</span>
                <span>${this.passengerInfo.name} ${this.passengerInfo.surname}</span>
              </div>
              <div class="sum-row">
                <span>Posto a sedere:</span>
                <strong class="text-primary">${this.selectedSeats.length > 0 ? this.selectedSeats.join(', ') : 'Posto Libero / Corsa Urbana'}</strong>
              </div>
              <div class="sum-row">
                <span>Tipologia Biglietto:</span>
                <span class="badge-type-pill">${this.getTicketTypeName(this.ticketType)}</span>
              </div>

              <hr class="summary-divider">

              <div class="sum-row">
                <span>Tariffa Viaggio:</span>
                <span>€${(basePrice * (trip.passengers || 1)).toFixed(2)}</span>
              </div>
              ${extrasCost > 0 ? `
                <div class="sum-row">
                  <span>Supplementi Extra:</span>
                  <span>€${extrasCost.toFixed(2)}</span>
                </div>
              ` : ''}
              <div class="sum-row sum-total">
                <span>Totale da Pagare:</span>
                <span class="total-amount">€${totalFinal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div class="payment-methods-card">
            <h4><i class="fa-solid fa-credit-card"></i> Metodo di Pagamento</h4>
            <div class="payment-radios-list">
              <label class="pay-method-item">
                <input type="radio" name="payMethod" value="card" checked>
                <span class="pay-icon"><i class="fa-brands fa-cc-visa"></i> <i class="fa-brands fa-cc-mastercard"></i></span>
                <div class="pay-info">
                  <strong>Carta di Credito o Debito</strong>
                  <small>Transazione sicura SSL 256-bit con 3D Secure</small>
                </div>
              </label>

              <label class="pay-method-item">
                <input type="radio" name="payMethod" value="applepay">
                <span class="pay-icon"><i class="fa-brands fa-apple-pay"></i> <i class="fa-brands fa-google-pay"></i></span>
                <div class="pay-info">
                  <strong>Apple Pay / Google Pay</strong>
                  <small>Pagamento istantaneo con impronta o Face ID</small>
                </div>
              </label>

              <label class="pay-method-item">
                <input type="radio" name="payMethod" value="satispay">
                <span class="pay-icon"><i class="fa-solid fa-mobile-screen-button"></i></span>
                <div class="pay-info">
                  <strong>Satispay & Bancomat Pay</strong>
                  <small>Conferma rapida tramite app bancaria</small>
                </div>
              </label>

              <label class="pay-method-item">
                <input type="radio" name="payMethod" value="cash">
                <span class="pay-icon"><i class="fa-solid fa-money-bill-wave"></i></span>
                <div class="pay-info">
                  <strong>Paga all'Autista o in Ricevitoria</strong>
                  <small>Codice di prenotazione valido fino a 15 min prima</small>
                </div>
              </label>
            </div>

            <div class="security-guarantee-note">
              <i class="fa-solid fa-shield-check"></i> Emissione immediata del biglietto digitale valido per i controlli a bordo.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getTicketTypeName(type) {
    switch (type) {
      case 'single': return 'Corsa Singola';
      case 'roundtrip': return 'Andata e Ritorno (-15%)';
      case 'carnet': return 'Carnet 10 Corse';
      case 'monthly': return 'Abbonamento Mensile';
      default: return 'Corsa Standard';
    }
  }

  nextStep() {
    if (this.currentStep === 3) {
      if (!this.savePassengerInputs()) return;
    }
    if (this.currentStep < 4) {
      this.renderStep(this.currentStep + 1);
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.renderStep(this.currentStep - 1);
    }
  }

  // ELABORAZIONE PAGAMENTO ED EMISSIONE BIGLIETTO DIGITALE
  processPayment() {
    const submitBtn = document.getElementById("btnConfirmPurchase");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Generazione Biglietto con QR Code...`;
    }

    setTimeout(() => {
      const ticket = this.generateTicketObject();
      this.saveTicketToStorage(ticket);
      this.closeModals();
      this.showTicketPass(ticket);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Conferma e Genera Biglietto`;
      }
    }, 1000);
  }

  generateTicketObject() {
    const trip = this.currentTrip;
    const line = trip.line || (trip.leg1 && trip.leg1.line);
    const pnrCode = `ITB-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const ticketId = `TKT-${Date.now()}`;

    // Calcolo totale
    let basePrice = trip.price;
    if (this.ticketType === 'roundtrip') basePrice = trip.price * 2 * 0.85;
    if (this.ticketType === 'carnet') basePrice = trip.price * 8.2;
    if (this.ticketType === 'monthly') basePrice = line.type === 'urban' ? 28.00 : 45.00;

    let extrasCost = 0;
    if (this.selectedExtras.luggage) extrasCost += 1.50;
    if (this.selectedExtras.bike) extrasCost += 2.00;
    if (this.selectedExtras.sms) extrasCost += 0.30;

    const totalFinal = (basePrice * (trip.passengers || 1)) + extrasCost;

    return {
      ticketId: ticketId,
      pnr: pnrCode,
      createdAt: new Date().toISOString(),
      status: "VALIDO", // 'VALIDO', 'CONVALIDATO', 'SCADUTO'
      validatedAt: null,
      passenger: { ...this.passengerInfo },
      trip: {
        originId: trip.origin.id,
        originName: trip.origin.name,
        destId: trip.destination.id,
        destName: trip.destination.name,
        lineCode: line.code,
        lineName: line.name,
        lineColor: line.color,
        operator: line.operator,
        busModel: line.busModel,
        date: trip.dateStr,
        departureTime: trip.departureTimeStr,
        arrivalTime: trip.arrivalTimeStr,
        platform: (trip.origin.platforms && trip.origin.platforms[0]) || "Banchina 1"
      },
      seats: this.selectedSeats.length > 0 ? this.selectedSeats : ["Libero"],
      ticketType: this.ticketType,
      ticketTypeName: this.getTicketTypeName(this.ticketType),
      extras: { ...this.selectedExtras },
      totalPrice: totalFinal
    };
  }

  saveTicketToStorage(ticket) {
    try {
      const tickets = JSON.parse(localStorage.getItem("italiabus_tickets") || "[]");
      tickets.unshift(ticket);
      localStorage.setItem("italiabus_tickets", JSON.stringify(tickets));
      this.updateWalletBadge();

      if (window.notificationManager) {
        window.notificationManager.notifyBooking({
          pnr: ticket.pnr,
          origin: ticket.trip?.originName,
          destination: ticket.trip?.destName,
          date: ticket.trip?.date
        });
      }
    } catch (e) {
      console.error("Storage error:", e);
    }
  }

  getSavedTickets() {
    try {
      return JSON.parse(localStorage.getItem("italiabus_tickets") || "[]");
    } catch (e) {
      return [];
    }
  }

  updateWalletBadge() {
    const tickets = this.getSavedTickets();
    if (this.walletBadgeCount) {
      this.walletBadgeCount.textContent = tickets.length;
      this.walletBadgeCount.style.display = tickets.length > 0 ? "inline-flex" : "none";
    }
  }

  // Generatore di QR Code dinamico SVG vettoriale puro in JavaScript (nessuna libreria esterna necessaria!)
  generateSvgQrCode(dataText) {
    // Genera una matrice 25x25 deterministica basata sull'hash della stringa per un QR Code super realistico
    const size = 25;
    let hash = 0;
    for (let i = 0; i < dataText.length; i++) {
      hash = (hash << 5) - hash + dataText.charCodeAt(i);
      hash |= 0;
    }

    let rects = "";
    // Finder patterns (gli angoli quadrati standard del QR)
    const addFinder = (x, y) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            rects += `<rect x="${x + c}" y="${y + r}" width="1" height="1" fill="#0f172a" />`;
          }
        }
      }
    };

    addFinder(1, 1);
    addFinder(size - 8, 1);
    addFinder(1, size - 8);

    // Dati sparsi generati
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Salta angoli finder
        if ((x < 9 && y < 9) || (x > size - 10 && y < 9) || (x < 9 && y > size - 10)) continue;

        // Pseudocasuale deterministico basato su x, y e hash
        const val = Math.sin(x * 12.9898 + y * 78.233 + hash) * 43758.5453;
        if (val - Math.floor(val) > 0.45) {
          rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#0f172a" />`;
        }
      }
    }

    return `
      <svg class="dynamic-qr-svg" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="#ffffff" />
        ${rects}
      </svg>
    `;
  }

  // MOSTRA IL BIGLIETTO DIGITALE A SCHERMO (PASS DI BORDO)
  showTicketPass(ticket) {
    if (!this.ticketViewerModal) return;

    const qrSvg = this.generateSvgQrCode(`${ticket.pnr}|${ticket.ticketId}|${ticket.passenger.name}|${ticket.trip.lineCode}`);
    const isValidated = ticket.status === "CONVALIDATO";

    const modalBody = document.getElementById("ticketViewerBody");
    if (!modalBody) return;

    modalBody.innerHTML = `
      <div class="digital-ticket-container ${isValidated ? 'ticket-is-validated' : ''}" id="printableTicketCard">
        <!-- Fascia Superiore -->
        <div class="ticket-header-band" style="background: linear-gradient(135deg, ${ticket.trip.lineColor}, #0f172a);">
          <div class="ticket-brand">
            <i class="fa-solid fa-bus-simple"></i>
            <div>
              <h3>ItaliaBus & Mobilità</h3>
              <span>Biglietto Elettronico Ufficiale</span>
            </div>
          </div>
          <div class="ticket-pnr-badge">
            <span class="pnr-title">CODICE PNR</span>
            <strong class="pnr-code">${ticket.pnr}</strong>
          </div>
        </div>

        <!-- Barra di Convalida Antifrode -->
        <div class="ticket-security-ticker ${isValidated ? 'validated-ticker' : ''}">
          <span class="security-dot pulse"></span>
          <span id="ticketValidationStatusText">${isValidated ? `CONVALIDATO IL ${ticket.validatedAt}` : 'BIGLIETTO VALIDO &bull; PRONTO PER LA SALITA'}</span>
          <span class="ticket-time-now" id="ticketLiveTime"></span>
        </div>

        <!-- Tratta e Orari -->
        <div class="ticket-route-grid">
          <div class="route-station from">
            <span class="station-label">PARTENZA DA:</span>
            <h4>${ticket.trip.originName}</h4>
            <div class="station-time">
              <i class="fa-solid fa-clock"></i> Ore <strong>${ticket.trip.departureTime}</strong> &bull; ${ticket.trip.date}
            </div>
            <span class="platform-tag">${ticket.trip.platform}</span>
          </div>

          <div class="route-arrow-center">
            <i class="fa-solid fa-arrow-right-long fa-2x"></i>
            <span class="line-pill-tag" style="border: 1px solid ${ticket.trip.lineColor}; color: ${ticket.trip.lineColor}">
              ${ticket.trip.lineCode}
            </span>
          </div>

          <div class="route-station to">
            <span class="station-label">DESTINAZIONE:</span>
            <h4>${ticket.trip.destName}</h4>
            <div class="station-time">
              <i class="fa-solid fa-flag-checkered"></i> Arrivo <strong>${ticket.trip.arrivalTime}</strong>
            </div>
            <span class="carrier-tag">${ticket.trip.operator}</span>
          </div>
        </div>

        <!-- Dati Passeggero e Posto -->
        <div class="ticket-info-strip">
          <div class="info-block">
            <span class="lbl">PASSEGGERO</span>
            <strong>${ticket.passenger.name} ${ticket.passenger.surname}</strong>
          </div>
          <div class="info-block">
            <span class="lbl">POSTO/I</span>
            <strong class="seat-badge-text">${Array.isArray(ticket.seats) ? ticket.seats.join(', ') : ticket.seats}</strong>
          </div>
          <div class="info-block">
            <span class="lbl">TIPO TARIFFA</span>
            <strong>${ticket.ticketTypeName}</strong>
          </div>
          <div class="info-block">
            <span class="lbl">IMPORTO PAGATO</span>
            <strong>€${ticket.totalPrice.toFixed(2)}</strong>
          </div>
        </div>

        <!-- Area QR Code e Info Legali -->
        <div class="ticket-footer-zone">
          <div class="qr-code-wrapper">
            ${qrSvg}
            <span class="qr-hint">Scansiona ai tornelli o dal controllore</span>
          </div>
          <div class="legal-info-wrapper">
            <p>ID Transazione: <strong>${ticket.ticketId}</strong></p>
            <p>Emesso il: ${new Date(ticket.createdAt).toLocaleString()}</p>
            <div class="ticket-rules-list">
              <span><i class="fa-solid fa-check"></i> Valido solo per la corsa indicata</span>
              <span><i class="fa-solid fa-check"></i> Non cedibile a terzi se nominativo</span>
              <span><i class="fa-solid fa-check"></i> Mostrare insieme a un documento di identità</span>
            </div>
          </div>
        </div>
      </div>

      <div class="ticket-actions-bar mt-4">
        <button class="btn btn-outline" onclick="window.bookingEngine.downloadTicketPdf()"><i class="fa-solid fa-file-pdf"></i> Scarica PDF</button>
        <button class="btn btn-primary" onclick="window.bookingEngine.addToAppleWallet()"><i class="fa-brands fa-apple"></i> Aggiungi ad Apple Wallet</button>
      </div>
    `;

    this.ticketViewerModal.classList.add("show");
    document.body.style.overflow = "hidden";

    // Aggiorna l'orologio live sul biglietto per sicurezza antifrode
    const liveTimeEl = document.getElementById("ticketLiveTime");
    if (this.ticketTimeInterval) clearInterval(this.ticketTimeInterval);
    
    if (liveTimeEl) {
      this.ticketTimeInterval = setInterval(() => {
        const now = new Date();
        liveTimeEl.textContent = now.toLocaleTimeString();
      }, 1000);
    }
  }

  // Lista I Miei Biglietti (Wallet)
  renderMyTicketsList() {
    if (!this.myTicketsContainer) return;
    
    const tickets = this.getSavedTickets();

    if (tickets.length === 0) {
      this.myTicketsContainer.innerHTML = `
        <div class="empty-wallet-state">
          <i class="fa-solid fa-wallet fa-4x text-muted mb-3"></i>
          <h3>Il tuo portafoglio è vuoto</h3>
          <p>Non hai ancora acquistato alcun biglietto. Cerca una corsa per iniziare a viaggiare con noi!</p>
          <button class="btn btn-primary btn-coming-soon" disabled>
            <i class="fa-solid fa-ticket"></i> Acquisto Biglietti
            <span class="coming-soon-badge">Coming Soon</span>
          </button>
        </div>
      `;
      return;
    }

    let html = `<div class="wallet-tickets-grid">`;
    
    tickets.forEach(ticket => {
      const isExpired = new Date(ticket.trip.date + "T" + ticket.trip.departureTime) < new Date();
      const isValidated = ticket.status === "CONVALIDATO";
      
      let statusClass = "status-valid";
      let statusText = "Valido";
      if (isValidated) { statusClass = "status-validated"; statusText = "Convalidato"; }
      else if (isExpired) { statusClass = "status-expired"; statusText = "Scaduto"; }

      html += `
        <div class="wallet-ticket-card">
          <div class="wallet-tkt-head" style="border-left: 4px solid ${ticket.trip.lineColor}">
            <div class="tkt-date-box">
              <span class="month">${new Date(ticket.trip.date).toLocaleString('it-IT', {month:'short'}).toUpperCase()}</span>
              <strong class="day">${new Date(ticket.trip.date).getDate()}</strong>
            </div>
            <div class="tkt-route-info">
              <h4>${ticket.trip.originName.split(' - ')[0]} <i class="fa-solid fa-arrow-right-long text-muted"></i> ${ticket.trip.destName.split(' - ')[0]}</h4>
              <p>Partenza: <strong>${ticket.trip.departureTime}</strong> &bull; PNR: ${ticket.pnr}</p>
            </div>
          </div>
          <div class="wallet-tkt-foot">
            <span class="tkt-status-badge ${statusClass}">${statusText}</span>
            <button class="btn btn-sm btn-outline" onclick='window.bookingEngine.showTicketPass(${JSON.stringify(ticket).replace(/"/g, '&quot;')})'>
              <i class="fa-solid fa-qrcode"></i> Mostra QR Code
            </button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    this.myTicketsContainer.innerHTML = html;
  }

  // Placeholder actions
  downloadTicketPdf() {
    alert("Funzionalità di download PDF in arrivo!");
  }

  addToAppleWallet() {
    alert("Integrazione Apple Wallet / Google Wallet in fase di sviluppo!");
  }
}

// Inizializza globalmente in modo sicuro
function initBookingEngine() {
  if (!window.bookingEngine) {
    window.bookingEngine = new BookingEngine();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBookingEngine);
} else {
  initBookingEngine();
}
