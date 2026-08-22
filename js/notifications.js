/**
 * ITALIABUS - NOTIFICATION & PUSH ALERTS ENGINE
 * Gestisce notifiche Web Push native del browser, Toast interattivi a schermo,
 * Centro Notifiche a scomparsa, promemoria corse e avvisi scioperi/viabilita in tempo reale.
 *
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */

class NotificationManager {
  constructor() {
    this.storageKey = 'italiabus_notifications_v1';
    this.permissionKey = 'italiabus_push_enabled';
    this.notifications = this.loadNotifications();
    this.toastContainer = null;
    this.dropdown = null;
    this.badgeDot = null;
    this.badgeCount = null;
    this.unreadTag = null;
    this.listContainer = null;
    this.pushBanner = null;

    this.init();
  }

  init() {
    this.toastContainer = document.getElementById('toastContainer');
    this.dropdown = document.getElementById('notificationDropdown');
    this.badgeDot = document.getElementById('notifBadgeDot');
    this.badgeCount = document.getElementById('notifBadgeCount');
    this.unreadTag = document.getElementById('notifUnreadTag');
    this.listContainer = document.getElementById('notifListContainer');
    this.pushBanner = document.getElementById('notifPushBanner');

    this.bindEvents();
    this.renderDropdownList();
    this.updateBadge();
    this.checkPermissionStatus();

    if (this.notifications.length === 0) {
      this.populateInitialNotifications();
    }
  }

  loadNotifications() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveNotifications() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.notifications.slice(0, 50)));
    } catch (e) {
      console.warn('Save notifications error:', e);
    }
    this.updateBadge();
  }

  populateInitialNotifications() {
    this.addNotification({
      id: 'notif_welcome',
      title: 'Benvenuto su ItaliaBus & Mobilità Nazionale',
      body: 'Orari, telemetria satellitare e tabelloni partenze attivi su tutto il territorio.',
      time: new Date().toISOString(),
      type: 'info',
      icon: 'fa-bus-simple',
      tabTarget: 'live-board',
      unread: true
    });

    this.addNotification({
      id: 'notif_strikes_active',
      title: 'Monitoraggio Scioperi Attivo',
      body: 'Consulta le fasce di garanzia orarie e i servizi minimi garantiti nella sezione Scioperi.',
      time: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      type: 'warning',
      icon: 'fa-triangle-exclamation',
      tabTarget: 'strikes',
      unread: true
    });

    this.addNotification({
      id: 'notif_gps_ready',
      title: 'Mappa Satellitare GPS & Navigatore',
      body: 'Trova la fermata più vicina e calcola il percorso verso qualsiasi destinazione in un clic.',
      time: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      type: 'success',
      icon: 'fa-map-location-dot',
      tabTarget: 'map',
      unread: true
    });
  }

  bindEvents() {
    const toggleBtn = document.getElementById('notificationToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }

    document.addEventListener('click', (e) => {
      if (this.dropdown && this.dropdown.classList.contains('open')) {
        if (!e.target.closest('.notification-dropdown-wrapper')) {
          this.closeDropdown();
        }
      }
    });

    const btnEnablePush = document.getElementById('btnEnablePushNotif');
    if (btnEnablePush) {
      btnEnablePush.addEventListener('click', () => this.requestBrowserPermission());
    }

    const btnMarkRead = document.getElementById('btnMarkAllNotifsRead');
    if (btnMarkRead) {
      btnMarkRead.addEventListener('click', () => this.markAllAsRead());
    }

    const btnClearAll = document.getElementById('btnClearAllNotifs');
    if (btnClearAll) {
      btnClearAll.addEventListener('click', () => this.clearAll());
    }

    const btnTest = document.getElementById('btnTestNotif');
    if (btnTest) {
      btnTest.addEventListener('click', () => {
        this.sendTestNotification();
      });
    }

    const btnReminder = document.getElementById('btnReminderNotif');
    if (btnReminder) {
      btnReminder.addEventListener('click', () => {
        this.sendReminderNotification();
      });
    }

    document.addEventListener('transportModeChanged', (e) => {
      const mode = e.detail?.mode || 'pullman';
      const names = { pullman: 'Pullman & Bus', train: 'Treni & Alta Velocità', tram: 'Tram & Metro', taxi: 'RadioTaxi', flight: 'Voli & Aerei' };
      this.send(
        'Modalità ' + (names[mode] || mode) + ' Attiva',
        'Orari, rotte e stazioni aggiornati per ' + (names[mode] || mode) + '.',
        { type: 'info', icon: 'fa-layer-group', tabTarget: 'live-board', showToast: true, sendNative: false }
      );
    });
  }

  toggleDropdown() {
    if (!this.dropdown) return;
    const isOpen = this.dropdown.classList.contains('open');
    if (isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    if (this.dropdown) {
      this.dropdown.classList.add('open');
      this.checkPermissionStatus();
      this.renderDropdownList();
    }
  }

  closeDropdown() {
    if (this.dropdown) {
      this.dropdown.classList.remove('open');
    }
  }

  async requestBrowserPermission() {
    if (!('Notification' in window)) {
      this.showToast('Il tuo browser non supporta le notifiche Web Push native.', 'warning', 'fa-triangle-exclamation');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        localStorage.setItem(this.permissionKey, 'true');
        this.checkPermissionStatus();
        this.playChimeSound();
        this.showToast('🔔 Notifiche Push attivate con successo!', 'success', 'fa-circle-check');
        this.sendNative(
          'ItaliaBus - Notifiche Push Attive ✅',
          'Riceverai aggiornamenti in tempo reale su scioperi, ritardi e orari di partenza!'
        );
        return true;
      } else {
        this.showToast('Permesso notifiche negato nel browser.', 'warning', 'fa-bell-slash');
        return false;
      }
    } catch (err) {
      console.warn('Notification permission error:', err);
      return false;
    }
  }

  checkPermissionStatus() {
    if (!this.pushBanner) return;
    if (!('Notification' in window)) {
      this.pushBanner.style.display = 'none';
      return;
    }

    if (Notification.permission === 'granted') {
      this.pushBanner.innerHTML = [
        '<div class="push-banner-icon text-success"><i class="fa-solid fa-circle-check"></i></div>',
        '<div class="push-banner-text">',
        '  <strong class="text-success">Notifiche Push Attive</strong>',
        '  <p>Ricevi avvisi istantanei di sistema sul tuo dispositivo.</p>',
        '</div>',
        '<span class="badge badge-success" style="font-size:0.75rem; padding:4px 8px; border-radius:6px; background:rgba(22,163,74,0.15); color:#16a34a; font-weight:800;">ABILITATE</span>'
      ].join('');
    } else if (Notification.permission === 'denied') {
      this.pushBanner.innerHTML = [
        '<div class="push-banner-icon text-danger"><i class="fa-solid fa-bell-slash"></i></div>',
        '<div class="push-banner-text">',
        '  <strong class="text-danger">Notifiche Bloccate</strong>',
        '  <p>Sblocca i permessi dalle impostazioni del browser per ricevere avvisi.</p>',
        '</div>'
      ].join('');
    } else {
      this.pushBanner.innerHTML = [
        '<div class="push-banner-icon"><i class="fa-solid fa-tower-broadcast"></i></div>',
        '<div class="push-banner-text">',
        '  <strong>Attiva Notifiche Push</strong>',
        '  <p>Ricevi avvisi istantanei su scioperi, ritardi e partenze anche a schermo spento.</p>',
        '</div>',
        '<button class="btn btn-xs btn-primary" id="btnEnablePushNotif" onclick="window.notificationManager.requestBrowserPermission()">Attiva</button>'
      ].join('');
    }
  }

  send(title, body, options = {}) {
    const notif = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: title || 'Nuova Notifica',
      body: body || '',
      time: new Date().toISOString(),
      type: options.type || 'info',
      icon: options.icon || 'fa-bell',
      tabTarget: options.tabTarget || null,
      unread: true
    };

    this.addNotification(notif);

    if (options.sound !== false) {
      this.playChimeSound();
    }

    if (options.showToast !== false) {
      this.showToast(
        '<strong>' + notif.title + '</strong><br><small>' + notif.body + '</small>',
        notif.type,
        notif.icon,
        options.tabTarget
      );
    }

    if (options.sendNative !== false) {
      this.sendNative(notif.title, notif.body);
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (e) {}
    }

    return notif;
  }

  sendNative(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        const iconSvg = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%230284c7'><path d='M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z'/></svg>";
        const n = new Notification(title, {
          body: body,
          icon: iconSvg,
          badge: iconSvg,
          silent: false
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch (e) {
        console.warn('Native notification dispatch error:', e);
      }
    }
  }

  addNotification(notif) {
    this.notifications.unshift(notif);
    this.saveNotifications();
    this.renderDropdownList();
  }

  showToast(htmlContent, type = 'info', iconClass = 'fa-bell', tabTarget = null) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-notifications-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'app-toast-item toast-' + type;
    
    const iconHtml = '<div class="toast-icon-box"><i class="fa-solid ' + iconClass + '"></i></div>';
    const bodyHtml = '<div class="toast-body-content">' + htmlContent + '</div>';
    const closeBtnHtml = '<button class="toast-close-btn" aria-label="Chiudi"><i class="fa-solid fa-xmark"></i></button>';

    toast.innerHTML = iconHtml + bodyHtml + closeBtnHtml;

    if (tabTarget) {
      toast.style.cursor = 'pointer';
      toast.addEventListener('click', (e) => {
        if (!e.target.closest('.toast-close-btn')) {
          if (window.app && typeof window.app.switchTab === 'function') {
            window.app.switchTab(tabTarget);
          }
          this.removeToast(toast);
        }
      });
    }

    const closeBtn = toast.querySelector('.toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeToast(toast);
      });
    }

    container.appendChild(toast);

    setTimeout(() => {
      this.removeToast(toast);
    }, 4500);
  }

  removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  playChimeSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.08);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }

  sendTestNotification() {
    this.send(
      'Test Notifica ItaliaBus 🔔',
      'Il sistema di notifiche Web Push, suoni e telemetria in tempo reale funziona alla perfezione!',
      { type: 'success', icon: 'fa-circle-check', sound: true, sendNative: true, showToast: true }
    );
  }

  sendReminderNotification() {
    const currentMode = typeof getActiveMode === 'function' ? getActiveMode() : 'pullman';
    const modeData = window.TRANSIT_DATA?.modes?.[currentMode] || { name: 'Pullman' };
    const randomMinutes = Math.floor(Math.random() * 8) + 4;

    this.send(
      'Promemoria Partenza ' + modeData.name + ' ⏱️',
      'La tua prossima corsa è prevista in partenza tra ' + randomMinutes + ' minuti dalla fermata principale.',
      { type: 'warning', icon: 'fa-stopwatch', tabTarget: 'live-board', sound: true, sendNative: true, showToast: true }
    );
  }

  notifyBooking(ticket) {
    this.send(
      'Biglietto Confermato: PNR ' + (ticket.pnr || 'OK') + ' 🎫',
      'Tratta: ' + (ticket.origin || 'Partenza') + ' ➔ ' + (ticket.destination || 'Destinazione') + ' (' + (ticket.date || 'Oggi') + '). Visualizza il QR code nel portafoglio.',
      { type: 'success', icon: 'fa-ticket', tabTarget: 'tickets', sound: true, sendNative: true, showToast: true }
    );
  }

  notifyStrike(strike) {
    this.send(
      'Allerta Sciopero: ' + (strike.title || 'Trasporti') + ' ⚠️',
      'Previsti disagi. Consulta le fasce di garanzia garantite per legge.',
      { type: 'danger', icon: 'fa-triangle-exclamation', tabTarget: 'strikes', sound: true, sendNative: true, showToast: true }
    );
  }

  markAllAsRead() {
    this.notifications.forEach(n => n.unread = false);
    this.saveNotifications();
    this.renderDropdownList();
    this.showToast('Tutte le notifiche sono state contrassegnate come lette.', 'info', 'fa-check-double');
  }

  clearAll() {
    this.notifications = [];
    this.saveNotifications();
    this.renderDropdownList();
    this.showToast('Cronologia notifiche svuotata.', 'info', 'fa-trash-can');
  }

  markAsRead(id) {
    const item = this.notifications.find(n => n.id === id);
    if (item) {
      item.unread = false;
      this.saveNotifications();
      this.renderDropdownList();
    }
  }

  updateBadge() {
    const unreadCount = this.notifications.filter(n => n.unread).length;
    
    if (this.badgeDot) {
      this.badgeDot.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    if (this.badgeCount) {
      this.badgeCount.textContent = unreadCount > 9 ? '9+' : unreadCount;
      this.badgeCount.style.display = unreadCount > 0 ? 'flex' : 'none';
    }

    if (this.unreadTag) {
      this.unreadTag.textContent = unreadCount > 0 ? (unreadCount + ' nuove') : 'Tutte lette';
      this.unreadTag.className = unreadCount > 0 ? 'notif-unread-tag has-unread' : 'notif-unread-tag';
    }
  }

  renderDropdownList() {
    if (!this.listContainer) return;

    if (this.notifications.length === 0) {
      this.listContainer.innerHTML = [
        '<div class="notif-empty-state">',
        '  <i class="fa-solid fa-bell-slash"></i>',
        '  <p>Nessuna notifica presente</p>',
        '  <small>Riceverai qui gli avvisi sul servizio e le partenze</small>',
        '</div>'
      ].join('');
      return;
    }

    let html = '';
    this.notifications.forEach(n => {
      const timeStr = this.formatRelativeTime(n.time);
      html += [
        '<div class="notif-list-item notif-' + (n.type || 'info') + (n.unread ? ' unread' : '') + '" data-id="' + n.id + '" data-target="' + (n.tabTarget || '') + '">',
        '  <div class="notif-item-icon">',
        '    <i class="fa-solid ' + (n.icon || 'fa-bell') + '"></i>',
        '  </div>',
        '  <div class="notif-item-content">',
        '    <div class="notif-item-title-row">',
        '      <strong class="notif-item-title">' + n.title + '</strong>',
        '      <span class="notif-item-time">' + timeStr + '</span>',
        '    </div>',
        '    <p class="notif-item-body">' + n.body + '</p>',
        (n.tabTarget ? '    <span class="notif-item-action-link"><i class="fa-solid fa-arrow-right"></i> Apri sezione</span>' : ''),
        '  </div>',
        (n.unread ? '  <span class="notif-unread-bullet"></span>' : ''),
        '</div>'
      ].join('');
    });

    this.listContainer.innerHTML = html;

    this.listContainer.querySelectorAll('.notif-list-item').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const id = itemEl.dataset.id;
        const target = itemEl.dataset.target;
        this.markAsRead(id);
        if (target && window.app && typeof window.app.switchTab === 'function') {
          window.app.switchTab(target);
          this.closeDropdown();
        }
      });
    });
  }

  formatRelativeTime(isoStr) {
    if (!isoStr) return 'Adesso';
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (diff < 60) return 'Poco fa';
    if (diff < 3600) return Math.floor(diff / 60) + ' min fa';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ore fa';
    return Math.floor(diff / 86400) + ' gg fa';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.notificationManager = new NotificationManager();
});
