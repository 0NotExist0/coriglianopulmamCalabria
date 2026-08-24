/**
 * ITALIABUS - CUSTOM SELECT ENHANCER
 *
 * Sostituisce l'apertura delle tendine <select> native (brutte e fuori tema, e
 * scomode da scorrere su mobile) con un componente a tema:
 *   - Desktop/tablet: popover ancorato sotto il campo.
 *   - Mobile: bottom-sheet che sale dal basso, con maniglia, ricerca e lista
 *     ampia a scorrimento fluido (momentum).
 *
 * Mantiene il <select> nativo nel DOM (valore, eventi 'change', compatibilita'
 * con il codice esistente e con il bridge nativo Unity), ma nascosto: l'utente
 * interagisce solo con l'interfaccia custom. Le opzioni vengono rilette ad ogni
 * apertura, quindi i <select> ripopolati dinamicamente restano sempre allineati.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

(function () {
  "use strict";

  var MOBILE_BREAKPOINT = 768;
  var SEARCH_THRESHOLD = 8; // mostra la casella di ricerca oltre N opzioni

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function readOptions(select) {
    var opts = [];
    for (var i = 0; i < select.options.length; i++) {
      var o = select.options[i];
      opts.push({
        value: o.value,
        label: o.textContent || o.value,
        disabled: o.disabled,
        selected: o.selected,
        isGroupLabel: o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null
      });
    }
    return opts;
  }

  function currentLabel(select) {
    var i = select.selectedIndex;
    if (i >= 0 && select.options[i]) return select.options[i].textContent || select.options[i].value;
    return select.getAttribute('data-placeholder') || 'Seleziona...';
  }

  var openController = null; // { close: fn }

  function closeAny() {
    if (openController) { openController.close(); openController = null; }
  }

  function enhance(select) {
    if (select._csEnhanced) return;
    select._csEnhanced = true;

    // Trigger (bottone visibile a tema) che rimpiazza l'aspetto del select
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger ' + (select.className || '');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    var labelSpan = document.createElement('span');
    labelSpan.className = 'cs-trigger-label';
    var caret = document.createElement('i');
    caret.className = 'fa-solid fa-chevron-down cs-trigger-caret';
    trigger.appendChild(labelSpan);
    trigger.appendChild(caret);

    function syncLabel() {
      labelSpan.textContent = currentLabel(select);
      var ph = select.selectedIndex < 0 || (select.options[select.selectedIndex] && select.options[select.selectedIndex].value === '');
      trigger.classList.toggle('cs-placeholder', !!ph);
    }
    syncLabel();

    // Inserisci il trigger accanto al select e nascondi il select nativo
    select.parentNode.insertBefore(trigger, select);
    select.classList.add('cs-native-hidden');
    // Il select resta nel DOM per valore/eventi, ma non deve intercettare tocchi
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    // Aggiorna la label quando il valore cambia (anche da codice o da Unity)
    select.addEventListener('change', syncLabel);

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (openController && openController.select === select) { closeAny(); return; }
      closeAny();
      openPicker(select, trigger, syncLabel);
    });

    // Se il select e' disabilitato, rifletti sullo stato del trigger.
    // Osserva anche il ripopolamento delle opzioni (childList) per riallineare
    // l'etichetta quando citta'/fermate cambiano dopo la selezione della regione.
    if (select.disabled) trigger.disabled = true;
    var mo = new MutationObserver(function () {
      trigger.disabled = select.disabled;
      syncLabel();
    });
    mo.observe(select, { attributes: true, attributeFilter: ['disabled'], childList: true });
  }

  function openPicker(select, trigger, syncLabel) {
    var mobile = isMobile();
    var opts = readOptions(select);

    var backdrop = document.createElement('div');
    backdrop.className = 'cs-backdrop' + (mobile ? ' cs-backdrop-sheet' : '');

    var panel = document.createElement('div');
    panel.className = mobile ? 'cs-sheet' : 'cs-popover';
    panel.setAttribute('role', 'listbox');

    // Header (titolo su mobile + eventuale ricerca)
    var showSearch = opts.length > SEARCH_THRESHOLD;
    var headerHtml = '';
    if (mobile) {
      headerHtml += '<div class="cs-sheet-handle"></div>';
      var title = select.getAttribute('data-title') || labelFor(select) || 'Seleziona';
      headerHtml += '<div class="cs-sheet-title">' + escapeHtml(title) + '</div>';
    }
    panel.innerHTML = headerHtml;

    var searchInput = null;
    if (showSearch) {
      var searchWrap = document.createElement('div');
      searchWrap.className = 'cs-search';
      searchWrap.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'cs-search-input';
      searchInput.placeholder = 'Cerca...';
      searchInput.autocomplete = 'off';
      searchWrap.appendChild(searchInput);
      panel.appendChild(searchWrap);
    }

    var list = document.createElement('div');
    list.className = 'cs-list';
    panel.appendChild(list);

    function renderList(filter) {
      var q = (filter || '').toLowerCase().trim();
      list.innerHTML = '';
      var lastGroup = null;
      var count = 0;
      for (var i = 0; i < opts.length; i++) {
        var o = opts[i];
        if (q && o.label.toLowerCase().indexOf(q) === -1) continue;
        if (o.isGroupLabel && o.isGroupLabel !== lastGroup) {
          lastGroup = o.isGroupLabel;
          var g = document.createElement('div');
          g.className = 'cs-group';
          g.textContent = o.isGroupLabel;
          list.appendChild(g);
        }
        var item = document.createElement('div');
        item.className = 'cs-item' + (o.selected ? ' cs-selected' : '') + (o.disabled ? ' cs-disabled' : '');
        item.setAttribute('role', 'option');
        if (!o.disabled) item.setAttribute('data-cs-value', o.value);
        item.innerHTML = '<span class="cs-item-label">' + escapeHtml(o.label) + '</span>' +
          (o.selected ? '<i class="fa-solid fa-check cs-item-check"></i>' : '');
        list.appendChild(item);
        count++;
      }
      if (count === 0) {
        var empty = document.createElement('div');
        empty.className = 'cs-empty';
        empty.textContent = 'Nessun risultato';
        list.appendChild(empty);
      }
    }

    function choose(val) {
      if (select.value !== val) {
        select.value = val;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof syncLabel === 'function') syncLabel();
      close();
    }

    renderList('');

    // --- Selezione a prova di scroll ---
    // Su mobile un tocco per scorrere NON deve selezionare: seleziona solo se il
    // dito non si e' spostato (vero tap). Se scorri, la lista scorre e basta.
    var itemFromEvent = function (e) {
      var el = e.target && e.target.closest ? e.target.closest('.cs-item') : null;
      if (!el || el.classList.contains('cs-disabled')) return null;
      return el;
    };
    var chooseFromItem = function (el) {
      var val = el.getAttribute('data-cs-value');
      if (val != null) choose(val);
    };

    var touch = { x: 0, y: 0, moved: false, active: false };
    var MOVE_TOL = 10; // px oltre i quali e' uno scroll, non un tap

    list.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      touch = { x: t.clientX, y: t.clientY, moved: false, active: true };
    }, { passive: true });

    list.addEventListener('touchmove', function (e) {
      if (!touch.active) return;
      var t = e.touches[0];
      if (Math.abs(t.clientX - touch.x) > MOVE_TOL || Math.abs(t.clientY - touch.y) > MOVE_TOL) {
        touch.moved = true;
      }
    }, { passive: true });

    list.addEventListener('touchend', function (e) {
      if (!touch.active) return;
      var wasMoved = touch.moved;
      touch.active = false;
      if (wasMoved) return;                 // era uno scroll -> non selezionare
      var el = itemFromEvent(e);
      if (el) {
        e.preventDefault();                 // evita il click sintetico che segue
        chooseFromItem(el);
      }
    });

    // Mouse / desktop (il touch e' gestito sopra e fa preventDefault)
    list.addEventListener('click', function (e) {
      var el = itemFromEvent(e);
      if (el) chooseFromItem(el);
    });

    if (searchInput) {
      searchInput.addEventListener('input', function () { renderList(searchInput.value); });
      searchInput.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('cs-open');

    if (!mobile) positionPopover(panel, trigger);

    // Animazione di entrata
    requestAnimationFrame(function () {
      backdrop.classList.add('cs-visible');
      panel.classList.add('cs-visible');
      // Porta in vista l'opzione selezionata
      var sel = list.querySelector('.cs-selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
      if (searchInput && !mobile) searchInput.focus();
    });

    var reposition = function () {
      if (isMobile() !== mobile) { close(); return; }
      if (!mobile) positionPopover(panel, trigger);
    };

    function close() {
      backdrop.classList.remove('cs-visible');
      panel.classList.remove('cs-visible');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.classList.remove('cs-open');
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      setTimeout(function () {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        if (panel.parentNode) panel.parentNode.removeChild(panel);
      }, 200);
      openController = null;
    }

    backdrop.addEventListener('click', close);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    openController = { close: close, select: select };
  }

  function positionPopover(panel, trigger) {
    var r = trigger.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var margin = 8;
    panel.style.width = Math.max(r.width, 220) + 'px';
    // Misura l'altezza reale
    panel.style.maxHeight = Math.min(360, vh - r.bottom - margin - 12) + 'px';
    var ph = panel.offsetHeight;
    var below = (r.bottom + margin + ph) <= vh;
    var top;
    if (below) {
      top = r.bottom + margin;
    } else {
      // apri verso l'alto se sotto non c'e' spazio
      var above = r.top - margin - ph;
      if (above >= margin) { top = above; }
      else {
        // scegli il lato con piu' spazio e limita l'altezza
        if ((vh - r.bottom) >= r.top) { top = r.bottom + margin; panel.style.maxHeight = (vh - r.bottom - margin - 12) + 'px'; }
        else { panel.style.maxHeight = (r.top - margin - 12) + 'px'; top = margin; }
      }
    }
    var left = r.left;
    if (left + panel.offsetWidth > vw - margin) left = vw - margin - panel.offsetWidth;
    if (left < margin) left = margin;
    panel.style.top = Math.round(top) + 'px';
    panel.style.left = Math.round(left) + 'px';
  }

  function labelFor(select) {
    // Trova la <label> associata (per il titolo del bottom-sheet)
    var field = select.closest('.selector-field, .form-group, .board-station-selector');
    if (field) {
      var lbl = field.querySelector('label');
      if (lbl) return (lbl.textContent || '').trim();
    }
    if (select.id) {
      var byFor = document.querySelector('label[for="' + select.id + '"]');
      if (byFor) return (byFor.textContent || '').trim();
    }
    return null;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function enhanceAll(root) {
    var scope = root || document;
    var selects = scope.querySelectorAll('select.custom-select, select.cs-enhance');
    for (var i = 0; i < selects.length; i++) {
      // Salta i select che devono restare nativi (es. all'interno di widget specifici)
      if (selects[i].hasAttribute('data-no-enhance')) continue;
      enhance(selects[i]);
    }
  }

  // Chiudi la tendina aperta con Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAny();
  });

  // API pubblica per ri-scansionare dopo inserimenti dinamici di <select>
  window.enhanceSelects = enhanceAll;

  function boot() {
    enhanceAll(document);
    // Alcuni select vengono creati/riempiti dopo l'init: riscansiona una volta
    setTimeout(function () { enhanceAll(document); }, 400);
    setTimeout(function () { enhanceAll(document); }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
