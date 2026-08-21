/**
 * ITALIABUS - TRIP PLANNER & ROUTE SEARCH ENGINE
 * Motore di ricerca corse con selezione multi-livello (Regione -> Città -> Fermata/Via)
 * e pianificazione tratte urbane, regionali e interregionali nazionali.
 */

class RouteSearchEngine {
  constructor() {
    this.originRegionSelect = document.getElementById("searchOriginRegion");
    this.originCitySelect = document.getElementById("searchOriginCity");
    this.originSelect = document.getElementById("searchOrigin");

    this.destRegionSelect = document.getElementById("searchDestRegion");
    this.destCitySelect = document.getElementById("searchDestCity");
    this.destSelect = document.getElementById("searchDestination");

    this.dateInput = document.getElementById("searchDate");
    this.timeInput = document.getElementById("searchTime");
    this.typeSelect = document.getElementById("searchLineType");
    this.passengerCount = document.getElementById("searchPassengers");
    this.swapBtn = document.getElementById("swapSearchBtn");
    this.searchForm = document.getElementById("tripSearchForm");
    this.resultsContainer = document.getElementById("searchResultsContainer");
    this.nowBtn = document.getElementById("searchNowBtn");

    this.init();
  }

  init() {
    this.initFormSelectors();
    this.setDefaultDateTime();
    this.bindEvents();

    document.addEventListener('regionChanged', (e) => {
      const activeRegion = e.detail?.regionId || (typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria");
      const activeCity = e.detail?.city || "all";
      const activeStop = e.detail?.stopId;

      if (this.originRegionSelect) {
        this.originRegionSelect.value = activeRegion;
        this.populateCities("origin", activeRegion, activeCity);
        this.populateStops("origin", activeRegion, activeCity, activeStop);
      }
    });

    document.addEventListener('transportModeChanged', (e) => {
      this.initFormSelectors();
    });
  }

  initFormSelectors() {
    const defaultRegion = typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_region", "calabria") : "calabria";
    const defaultCity = typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_city", "all") : "all";
    const defaultStop = typeof safeStorageGet === 'function' ? safeStorageGet("italiabus_stop", "") : "";

    // 1. Popola Regioni
    this.populateRegions();

    // 2. Popola Partenza (sincronizzata con la regione attuale)
    if (this.originRegionSelect) this.originRegionSelect.value = defaultRegion;
    this.populateCities("origin", defaultRegion, defaultCity);
    this.populateStops("origin", defaultRegion, defaultCity, defaultStop);

    // 3. Popola Destinazione (seconda fermata o regione diversa)
    const destRegion = defaultRegion;
    if (this.destRegionSelect) this.destRegionSelect.value = destRegion;
    this.populateCities("dest", destRegion, "all");
    this.populateStops("dest", destRegion, "all");

    // Imposta una destinazione diversa come suggerimento
    if (this.originSelect && this.destSelect && this.originSelect.value === this.destSelect.value) {
      if (this.destSelect.options && this.destSelect.options.length > 1) {
        this.destSelect.selectedIndex = 1;
      }
    }
  }

  populateRegions() {
    if (!TRANSIT_DATA.regions) return;
    const makeOptions = () => {
      return TRANSIT_DATA.regions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    };

    if (this.originRegionSelect) this.originRegionSelect.innerHTML = makeOptions();
    if (this.destRegionSelect) this.destRegionSelect.innerHTML = makeOptions();
  }

  populateCities(type, regionId, selectedCity = "all") {
    const citySelect = type === "origin" ? this.originCitySelect : this.destCitySelect;
    if (!citySelect) return;

    const totalCities = typeof getCitiesByRegion === "function" ? getCitiesByRegion(regionId) : [];
    let html = `<option value="all">📍 Tutte le Località (${totalCities.length})</option>`;

    const cat = typeof getCategorizedLocalities === "function" 
      ? getCategorizedLocalities(regionId) 
      : { cities: totalCities, towns: [], frazioni: [] };

    if (cat.cities && cat.cities.length > 0) {
      html += `<optgroup label="🏙️ Grandi Città & Capoluoghi">`;
      cat.cities.forEach(city => {
        const isSel = city === selectedCity ? 'selected' : '';
        html += `<option value="${city}" ${isSel}>🏙️ ${city}</option>`;
      });
      html += `</optgroup>`;
    }

    if (cat.towns && cat.towns.length > 0) {
      html += `<optgroup label="🏘️ Paesi & Comuni">`;
      cat.towns.forEach(town => {
        const isSel = town === selectedCity ? 'selected' : '';
        html += `<option value="${town}" ${isSel}>🏡 ${town}</option>`;
      });
      html += `</optgroup>`;
    }

    if (cat.frazioni && cat.frazioni.length > 0) {
      html += `<optgroup label="🌿 Frazioni & Borgate">`;
      cat.frazioni.forEach(fraz => {
        const isSel = fraz === selectedCity ? 'selected' : '';
        html += `<option value="${fraz}" ${isSel}>🌿 ${fraz}</option>`;
      });
      html += `</optgroup>`;
    }

    citySelect.innerHTML = html;
  }

  populateStops(type, regionId, city = "all", selectedStopId = null) {
    const stopSelect = type === "origin" ? this.originSelect : this.destSelect;
    if (!stopSelect) return;

    const stops = getStopsByCity(regionId, city);
    if (!stops || stops.length === 0) {
      stopSelect.innerHTML = `<option value="">Nessuna fermata trovata</option>`;
      return;
    }

    // Raggruppa per area
    const areas = {};
    stops.forEach(s => {
      if (!areas[s.area]) areas[s.area] = [];
      areas[s.area].push(s);
    });

    let html = "";
    Object.entries(areas).forEach(([area, areaStops]) => {
      const sample = areaStops[0];
      const icon = sample.localityType === 'city' ? '🏙️' : (sample.localityType === 'frazione' ? '🌿' : '🏡');
      html += `<optgroup label="${icon} ${area}">`;
      areaStops.forEach(s => {
        const isSel = (selectedStopId && s.id === selectedStopId) ? 'selected' : '';
        let stopLabel = s.name;
        if (s.isTemporary) {
          if (s.temporaryStatus === 'active') {
            stopLabel = `🟠 [PROVV. ATTIVA] ${s.name}`;
          } else {
            stopLabel = `⛔ [PROVV. CHIUSA/LAVORI] ${s.name}`;
          }
        }
        html += `<option value="${s.id}" ${isSel}>${stopLabel} &bull; ${s.address}</option>`;
      });
      html += `</optgroup>`;
    });

    stopSelect.innerHTML = html;

    if (selectedStopId && stops.some(s => s.id === selectedStopId)) {
      stopSelect.value = selectedStopId;
    } else if (stops.length > 0) {
      stopSelect.selectedIndex = 0;
    }
  }

  setDefaultDateTime() {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    if (this.dateInput) this.dateInput.value = today;
    if (this.timeInput) this.timeInput.value = `${hours}:${minutes}`;
  }

  bindEvents() {
    // Cambio Regione Partenza
    if (this.originRegionSelect) {
      this.originRegionSelect.addEventListener("change", (e) => {
        const regionId = e.target.value;
        this.populateCities("origin", regionId, "all");
        this.populateStops("origin", regionId, "all");
      });
    }

    // Cambio Città Partenza
    if (this.originCitySelect) {
      this.originCitySelect.addEventListener("change", (e) => {
        const city = e.target.value;
        const regionId = this.originRegionSelect.value;
        this.populateStops("origin", regionId, city);
      });
    }

    // Cambio Regione Destinazione
    if (this.destRegionSelect) {
      this.destRegionSelect.addEventListener("change", (e) => {
        const regionId = e.target.value;
        this.populateCities("dest", regionId, "all");
        this.populateStops("dest", regionId, "all");
      });
    }

    // Cambio Città Destinazione
    if (this.destCitySelect) {
      this.destCitySelect.addEventListener("change", (e) => {
        const city = e.target.value;
        const regionId = this.destRegionSelect.value;
        this.populateStops("dest", regionId, city);
      });
    }

    // Inverti Partenza e Arrivo
    if (this.swapBtn) {
      this.swapBtn.addEventListener("click", () => {
        const origReg = this.originRegionSelect ? this.originRegionSelect.value : null;
        const origCity = this.originCitySelect ? this.originCitySelect.value : null;
        const origStop = this.originSelect ? this.originSelect.value : null;

        const destReg = this.destRegionSelect ? this.destRegionSelect.value : null;
        const destCity = this.destCitySelect ? this.destCitySelect.value : null;
        const destStop = this.destSelect ? this.destSelect.value : null;

        if (origReg && destReg) {
          this.originRegionSelect.value = destReg;
          this.populateCities("origin", destReg, destCity);
          this.populateStops("origin", destReg, destCity, destStop);

          this.destRegionSelect.value = origReg;
          this.populateCities("dest", origReg, origCity);
          this.populateStops("dest", origReg, origCity, origStop);
        }
      });
    }

    if (this.nowBtn) {
      this.nowBtn.addEventListener("click", () => {
        this.setDefaultDateTime();
        this.executeSearch();
      });
    }

    if (this.searchForm) {
      this.searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.executeSearch();
      });
    }
  }

  executeSearch() {
    const originId = this.originSelect ? this.originSelect.value : null;
    const destId = this.destSelect ? this.destSelect.value : null;
    const dateVal = this.dateInput ? this.dateInput.value : "";
    const timeVal = this.timeInput ? this.timeInput.value : "08:00";
    const lineTypeFilter = this.typeSelect ? this.typeSelect.value : "all";
    const passengers = this.passengerCount ? parseInt(this.passengerCount.value) || 1 : 1;

    if (!originId || !destId) {
      alert("Seleziona sia il punto di partenza che di arrivo.");
      return;
    }

    if (originId === destId) {
      this.resultsContainer.innerHTML = `
        <div class="search-alert alert-warning">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>Origine e destinazione coincidono</strong>
            <p>Seleziona due fermate o vie distinte per trovare le corse disponibili.</p>
          </div>
        </div>
      `;
      return;
    }

    this.resultsContainer.innerHTML = `
      <div class="search-loading">
        <div class="spinner"></div>
        <p>Ricerca orari, banchine e disponibilità posti in tempo reale...</p>
      </div>
    `;

    setTimeout(() => {
      let actualOriginId = originId;
      let actualDestId = destId;
      let originRerouted = null;
      let destRerouted = null;

      const origStop = getStopById(originId);
      const dstStop = getStopById(destId);

      if (origStop && origStop.isTemporary && origStop.temporaryStatus !== 'active') {
        const origAlt = typeof getAlternativeActiveStop === 'function' ? getAlternativeActiveStop(originId) : null;
        if (origAlt && origAlt.alternativeStop) {
          actualOriginId = origAlt.alternativeStop.id;
          originRerouted = { original: origStop, alternative: origAlt.alternativeStop, dist: origAlt.distanceMeters, time: origAlt.walkTimeMin, reason: origAlt.reason };
        }
      }

      if (dstStop && dstStop.isTemporary && dstStop.temporaryStatus !== 'active') {
        const dstAlt = typeof getAlternativeActiveStop === 'function' ? getAlternativeActiveStop(destId) : null;
        if (dstAlt && dstAlt.alternativeStop) {
          actualDestId = dstAlt.alternativeStop.id;
          destRerouted = { original: dstStop, alternative: dstAlt.alternativeStop, dist: dstAlt.distanceMeters, time: dstAlt.walkTimeMin, reason: dstAlt.reason };
        }
      }

      const results = this.findRoutes(actualOriginId, actualDestId, dateVal, timeVal, lineTypeFilter, passengers);
      this.renderResults(results, actualOriginId, actualDestId, dateVal, passengers, originRerouted, destRerouted);
    }, 300);
  }

  findRoutes(originId, destId, dateStr, timeStr, typeFilter, passengers) {
    const directTrips = [];
    const transferTrips = [];
    const originStop = getStopById(originId);
    const destStop = getStopById(destId);

    if (!originStop || !destStop) return [];

    const isSameRegion = originStop.region === destStop.region;
    const [reqHours, reqMins] = (timeStr || "08:00").split(":").map(Number);
    const reqBaseMinutes = reqHours * 60 + reqMins;

    // 1. CASO INTRA-REGIONALE (stessa regione)
    if (isSameRegion) {
      const lines = getLinesByRegion(originStop.region);

      // 1.A Corse Dirette
      lines.forEach(line => {
        if (typeFilter !== "all" && line.type !== typeFilter) return;

        const originIdx = line.stopsIds.indexOf(originId);
        const destIdx = line.stopsIds.indexOf(destId);

        if (originIdx !== -1 && destIdx !== -1 && originIdx < destIdx) {
          const stopsCount = destIdx - originIdx;
          const durationMinutes = stopsCount * (line.type === "urban" ? 6 : 14) + (line.type === "regional" ? 15 : 5);
          
          for (let i = 0; i < 4; i++) {
            const departureMinutes = reqBaseMinutes + i * (line.frequencyMinutes || 30) + Math.floor(Math.random() * 4);
            const depH = Math.floor(departureMinutes / 60) % 24;
            const depM = departureMinutes % 60;
            const arrMinutes = departureMinutes + durationMinutes;
            const arrH = Math.floor(arrMinutes / 60) % 24;
            const arrM = arrMinutes % 60;

            let price = line.priceBase || 1.50;
            if (line.type === "regional" && stopsCount > 2) price += 1.50;
            const freeSeats = Math.max(4, (line.capacity || 50) - (Math.floor(Math.random() * 25) + 10));

            const intermediateStops = line.stopsIds.slice(originIdx, destIdx + 1).map((sId, idx) => {
              const stop = getStopById(sId);
              const stopMinutes = departureMinutes + idx * (line.type === "urban" ? 6 : 14);
              const sH = Math.floor(stopMinutes / 60) % 24;
              const sM = stopMinutes % 60;
              return {
                id: sId,
                name: stop ? `${stop.name} (${stop.address})` : sId,
                time: `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`,
                isStart: idx === 0,
                isEnd: idx === stopsCount
              };
            });

            directTrips.push({
              id: `TRIP_DIR_${line.id}_${i}`,
              isDirect: true,
              line: line,
              origin: originStop,
              destination: destStop,
              departureTimeStr: `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`,
              arrivalTimeStr: `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`,
              durationMinutes: durationMinutes,
              price: price,
              totalPrice: price * passengers,
              freeSeats: freeSeats,
              passengers: passengers,
              dateStr: dateStr,
              intermediateStops: intermediateStops,
              delayMin: Math.random() > 0.8 ? 2 : 0
            });
          }
        }
      });

      // 1.B Corse con Cambio nello stesso Hub Regionale
      if (directTrips.length === 0) {
        const hubId = getMainHubForRegion(originStop.region)?.id;
        if (hubId && originId !== hubId && destId !== hubId) {
          const leg1Lines = lines.filter(l => {
            const oIdx = l.stopsIds.indexOf(originId);
            const hIdx = l.stopsIds.indexOf(hubId);
            return oIdx !== -1 && hIdx !== -1 && oIdx < hIdx;
          });

          const leg2Lines = lines.filter(l => {
            const hIdx = l.stopsIds.indexOf(hubId);
            const dIdx = l.stopsIds.indexOf(destId);
            return hIdx !== -1 && dIdx !== -1 && hIdx < dIdx;
          });

          if (leg1Lines.length > 0 && leg2Lines.length > 0) {
            const l1 = leg1Lines[0];
            const l2 = leg2Lines[0];

            for (let i = 0; i < 3; i++) {
              const dep1M = reqBaseMinutes + i * 35;
              const leg1Dur = 20;
              const transferWait = 12;
              const leg2Dur = 35;

              const arr1M = dep1M + leg1Dur;
              const dep2M = arr1M + transferWait;
              const arr2M = dep2M + leg2Dur;

              const depH = Math.floor(dep1M / 60) % 24;
              const depM = dep1M % 60;
              const arrH = Math.floor(arr2M / 60) % 24;
              const arrM = arr2M % 60;

              const totalPrice = (l1.priceBase + l2.priceBase) * 0.9;

              transferTrips.push({
                id: `TRIP_TRANS_${i}`,
                isDirect: false,
                transferHub: getStopById(hubId),
                leg1: {
                  line: l1,
                  departureTime: `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`,
                  duration: leg1Dur
                },
                leg2: {
                  line: l2,
                  departureTime: `${String(Math.floor(dep2M / 60) % 24).padStart(2, '0')}:${String(dep2M % 60).padStart(2, '0')}`,
                  duration: leg2Dur
                },
                origin: originStop,
                destination: destStop,
                departureTimeStr: `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`,
                arrivalTimeStr: `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`,
                durationMinutes: leg1Dur + transferWait + leg2Dur,
                price: totalPrice,
                totalPrice: totalPrice * passengers,
                freeSeats: 22,
                passengers: passengers,
                dateStr: dateStr,
                delayMin: 0
              });
            }
          }
        }

        // 1.C Collegamento Diretto Regionale di Rete
        if (transferTrips.length === 0) {
          const regionObj = getRegionById(originStop.region);
          const distKm = Math.max(5, Math.round(Math.sqrt(Math.pow((originStop.lat - destStop.lat)*111, 2) + Math.pow((originStop.lng - destStop.lng)*85, 2))));
          const durMin = Math.min(150, Math.max(15, Math.round(distKm * 1.6)));
          const basePrice = Math.max(1.80, Number((distKm * 0.12 + 1.20).toFixed(2)));

          for (let i = 0; i < 3; i++) {
            const depMin = reqBaseMinutes + i * 40;
            const depH = Math.floor(depMin / 60) % 24;
            const depM = depMin % 60;
            const arrMin = depMin + durMin;
            const arrH = Math.floor(arrMin / 60) % 24;
            const arrM = arrMin % 60;

            const fallbackLine = {
              id: `REG_${originStop.region}_FEEDER`,
              code: `REG-${(regionObj?.name || 'BUS').substring(0,3).toUpperCase()}`,
              name: `Autolinea Regionale ${originStop.area} ⇄ ${destStop.area}`,
              color: "#0284c7",
              operator: originStop.operatorName || "Consorzio Trasporti Regionale",
              busModel: "Iveco Crossway Line Euro VI",
              priceBase: basePrice
            };

            directTrips.push({
              id: `TRIP_REG_AUTO_${i}`,
              isDirect: true,
              line: fallbackLine,
              origin: originStop,
              destination: destStop,
              departureTimeStr: `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`,
              arrivalTimeStr: `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`,
              durationMinutes: durMin,
              price: basePrice,
              totalPrice: basePrice * passengers,
              freeSeats: 26,
              passengers: passengers,
              dateStr: dateStr,
              intermediateStops: [
                { name: `${originStop.name} (${originStop.address})`, time: `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`, isStart: true },
                { name: `${destStop.name} (${destStop.address})`, time: `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`, isEnd: true }
              ],
              delayMin: 0
            });
          }
        }
      }
    } 
    // 2. CASO INTER-REGIONALE (due regioni diverse in Italia)
    else {
      const origRegion = getRegionById(originStop.region);
      const destRegion = getRegionById(destStop.region);
      const origHub = getMainHubForRegion(originStop.region) || originStop;
      const destHub = getMainHubForRegion(destStop.region) || destStop;

      for (let i = 0; i < 3; i++) {
        const depMinutes = reqBaseMinutes + i * 90;
        const totalDuration = 180 + (Math.abs(originStop.lat - destStop.lat) * 25);
        const depH = Math.floor(depMinutes / 60) % 24;
        const depM = depMinutes % 60;
        const arrMinutes = depMinutes + totalDuration;
        const arrH = Math.floor(arrMinutes / 60) % 24;
        const arrM = Math.floor(arrMinutes % 60);

        const price = Math.round(18.00 + (Math.abs(originStop.lat - destStop.lat) * 4.50));

        const interLine = {
          code: `NAT-${origRegion?.name.substring(0,2).toUpperCase() || 'IT'}${destRegion?.name.substring(0,2).toUpperCase() || 'IT'}`,
          name: `Autolinea Nazionale ${origRegion?.name || ''} ⇄ ${destRegion?.name || ''}`,
          color: "#0284c7",
          operator: "ItaliaBus Grandi Linee Nazionali",
          busModel: "Setra S 517 HDH TopClass Double-Decker"
        };

        const intermediateStops = [
          { name: `${originStop.name} (${originStop.address})`, time: `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`, isStart: true },
          { name: `Hub Interscambio: ${origHub.name}`, time: `${String((depH + 1) % 24).padStart(2, '0')}:15`, isStart: false },
          { name: `Hub Regionale: ${destHub.name}`, time: `${String((arrH - 1 + 24) % 24).padStart(2, '0')}:45`, isStart: false },
          { name: `${destStop.name} (${destStop.address})`, time: `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`, isEnd: true }
        ];

        directTrips.push({
          id: `TRIP_NAT_${i}`,
          isDirect: true,
          isInterregional: true,
          line: interLine,
          origin: originStop,
          destination: destStop,
          departureTimeStr: `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`,
          arrivalTimeStr: `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`,
          durationMinutes: Math.round(totalDuration),
          price: price,
          totalPrice: price * passengers,
          freeSeats: 18,
          passengers: passengers,
          dateStr: dateStr,
          intermediateStops: intermediateStops,
          delayMin: 0
        });
      }
    }

    return [...directTrips, ...transferTrips];
  }

  renderResults(results, originId, destId, dateStr, passengers, originRerouted = null, destRerouted = null) {
    const origin = getStopById(originId);
    const dest = getStopById(destId);

    if (results.length === 0) {
      this.resultsContainer.innerHTML = `
        <div class="search-alert alert-info">
          <i class="fa-solid fa-circle-info fa-2x"></i>
          <div>
            <strong>Nessun collegamento programmato per i criteri selezionati</strong>
            <p>Non risultano corse dirette o con cambio tra <em>${origin?.name}</em> e <em>${dest?.name}</em> per la data scelta. Prova a selezionare lo snodo principale o modifica l'orario.</p>
          </div>
        </div>
      `;
      return;
    }

    let html = `
      ${originRerouted || destRerouted ? `
        <div class="search-reroute-notice-card">
          <div class="reroute-notice-title">
            <i class="fa-solid fa-triangle-exclamation text-warning"></i>
            <strong>Avviso Viabilità & Re-routing Automatico Fermata</strong>
          </div>
          ${originRerouted ? `
            <p class="reroute-notice-p">
              ⚠️ <strong>Partenza:</strong> La fermata provvisoria <em>"${originRerouted.original.name}"</em> è chiusa (${originRerouted.reason}). Il viaggio è calcolato dalla fermata normale ufficiale: <strong>${originRerouted.alternative.name}</strong> (${originRerouted.dist}m &bull; ~${originRerouted.time} min a piedi).
            </p>
          ` : ''}
          ${destRerouted ? `
            <p class="reroute-notice-p">
              ⚠️ <strong>Arrivo:</strong> La fermata provvisoria <em>"${destRerouted.original.name}"</em> è chiusa (${destRerouted.reason}). Il viaggio è calcolato verso la fermata normale ufficiale: <strong>${destRerouted.alternative.name}</strong> (${destRerouted.dist}m &bull; ~${destRerouted.time} min a piedi).
            </p>
          ` : ''}
        </div>
      ` : ''}

      <div class="results-header-bar">
        <div class="route-summary-title">
          <span class="badge-route-count">${results.length} Soluzioni Trovate</span>
          <h3>${origin.name} <i class="fa-solid fa-arrow-right"></i> ${dest.name}</h3>
          <span class="route-date-tag"><i class="fa-regular fa-calendar"></i> ${dateStr} &bull; ${passengers} Passeggero/i &bull; Da: ${origin.address}</span>
        </div>
      </div>
      <div class="results-cards-list">
    `;

    results.forEach((trip, idx) => {
      const isDirect = trip.isDirect;
      const line = isDirect ? trip.line : trip.leg1.line;

      html += `
        <div class="trip-result-card ${idx === 0 ? 'recommended-trip' : ''}">
          ${idx === 0 ? '<div class="trip-ribbon"><i class="fa-solid fa-star"></i> Migliore Soluzione Rapida</div>' : ''}
          
          <div class="trip-main-row">
            <div class="trip-time-col">
              <div class="time-block">
                <span class="time-large">${trip.departureTimeStr}</span>
                <span class="time-stop-name">${origin.name.split(' - ')[0]}</span>
                <small style="color: var(--text-muted); font-size: 0.72rem;">${origin.address}</small>
                <a href="${origin.gmapsUrl || `https://www.google.com/maps/search/?api=1&query=${origin.lat},${origin.lng}`}" target="_blank" rel="noopener" class="gmaps-tag-btn" title="Apri fermata di partenza su Google Maps">
                  <i class="fa-solid fa-map-location-dot"></i> Maps
                </a>
              </div>
              
              <div class="duration-connector">
                <span class="dur-text">${trip.durationMinutes} min</span>
                <div class="dur-line">
                  <span class="dot-start"></span>
                  ${!isDirect ? `<span class="dot-transfer" title="Cambio Hub"></span>` : ''}
                  <span class="dot-end"></span>
                </div>
                <span class="dur-type">${isDirect ? (trip.isInterregional ? 'Nazionale Diretto' : 'Diretto') : '1 Cambio'}</span>
                <a href="https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&travelmode=transit" target="_blank" rel="noopener" class="gmaps-directions-link" title="Calcola itinerario su Google Maps">
                  <i class="fa-brands fa-google"></i> Indicazioni
                </a>
              </div>

              <div class="time-block">
                <span class="time-large">${trip.arrivalTimeStr}</span>
                <span class="time-stop-name">${dest.name.split(' - ')[0]}</span>
                <small style="color: var(--text-muted); font-size: 0.72rem;">${dest.address}</small>
                <a href="${dest.gmapsUrl || `https://www.google.com/maps/search/?api=1&query=${dest.lat},${dest.lng}`}" target="_blank" rel="noopener" class="gmaps-tag-btn" title="Apri fermata di arrivo su Google Maps">
                  <i class="fa-solid fa-map-location-dot"></i> Maps
                </a>
              </div>
            </div>

            <div class="trip-line-col">
              <div class="line-badge-pill" style="background-color: ${line.color}15; color: ${line.color}; border: 1px solid ${line.color}">
                <i class="fa-solid fa-bus"></i>
                <strong>${isDirect ? line.code : `${trip.leg1.line.code} + ${trip.leg2.line.code}`}</strong>
              </div>
              <span class="line-carrier-text" title="Operatore del servizio">${line.operator || 'Operatore di Linea'}</span>
              <span class="bus-model-text"><i class="fa-solid fa-shield-halved"></i> ${line.busModel ? line.busModel.split(' ')[0] : 'Bus GT'}</span>
            </div>

            <div class="trip-price-col">
              <div class="price-amount-box">
                <span class="price-val">€${trip.totalPrice.toFixed(2)}</span>
                <span class="price-sub">${passengers > 1 ? `€${trip.price.toFixed(2)} cad.` : 'Tariffa Totale'}</span>
              </div>
              <button class="btn btn-primary btn-book-trip btn-coming-soon" disabled>
                <i class="fa-solid fa-check"></i> Prenota
                <span class="coming-soon-badge">Coming Soon</span>
              </button>
            </div>
          </div>

          <!-- Dettagli Servizi e Fermate Espandibili -->
          <div class="trip-extra-bar">
            <div class="amenities-icons">
              <span title="Aria Condizionata"><i class="fa-solid fa-snowflake"></i> Clima</span>
              <span title="Wi-Fi Gratuito"><i class="fa-solid fa-wifi"></i> Wi-Fi</span>
              <span title="Prese USB"><i class="fa-solid fa-plug"></i> USB</span>
              <span title="Accesso Disabili"><i class="fa-solid fa-wheelchair"></i> Accessibile</span>
              <span class="seats-left-pill"><i class="fa-solid fa-chair"></i> ${trip.freeSeats} posti liberi</span>
            </div>
            
            <div class="trip-action-btns">
              <button type="button" class="btn-toggle-stops" onclick="window.openRouteColorPicker('${line.id}', '${trip.id}')" title="Personalizza colore e visualizza su mappa">
                <i class="fa-solid fa-map-location-dot"></i> Vedi su Mappa
              </button>
              <a href="https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&travelmode=transit" target="_blank" rel="noopener" class="btn-toggle-stops btn-gmaps-action">
                <i class="fa-solid fa-diamond-turn-right"></i> Google Maps
              </a>
              ${isDirect && trip.intermediateStops ? `
                <button class="btn-toggle-stops" onclick="window.searchEngine.toggleTimeline('timeline_${trip.id}')">
                  <i class="fa-solid fa-list-ol"></i> Mostra fermate (${trip.intermediateStops.length})
                </button>
              ` : ''}
            </div>
          </div>

          ${isDirect && trip.intermediateStops ? `
            <div class="trip-stops-timeline" id="timeline_${trip.id}" style="display: none;">
              <h5><i class="fa-solid fa-route"></i> Itinerario e orari di passaggio:</h5>
              <div class="timeline-stops-list">
                ${trip.intermediateStops.map(s => `
                  <div class="timeline-stop-item ${s.isStart ? 'stop-start' : (s.isEnd ? 'stop-end' : '')}">
                    <span class="t-time">${s.time}</span>
                    <span class="t-bullet"></span>
                    <span class="t-name">${s.name}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    });

    html += `</div>`;
    this.resultsContainer.innerHTML = html;
  }

  toggleTimeline(timelineId) {
    const el = document.getElementById(timelineId);
    if (!el) return;
    const isHidden = el.style.display === "none";
    el.style.display = isHidden ? "block" : "none";
  }
}

// Esporta globalmente
window.RouteSearchEngine = RouteSearchEngine;

function initRouteSearchEngine() {
  if (!window.searchEngine) {
    window.searchEngine = new RouteSearchEngine();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRouteSearchEngine);
} else {
  initRouteSearchEngine();
}

