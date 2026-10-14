/**
 * Notification Helper for Litaj Hardware POS
 * Manages Web Notifications (PWA desktop/mobile push alerts), Web Audio alerts,
 * and in-app alert toasts for low stock warnings.
 */

const NOTIFIED_ITEMS_KEY = 'lh_notified_low_stock';

export function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    return Notification.requestPermission();
}

export function playAlertChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6 note

        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.35);
    } catch {
        // AudioContext restricted prior to user gesture
    }
}

export function showInAppLowStockBanner(itemName, stockQty, unit) {
    let container = document.getElementById('lh-notification-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'lh-notification-toast-container';
        container.className = 'fixed top-16 right-3 sm:right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto bg-slate-900/95 backdrop-blur border-2 border-red-600 text-white p-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce';
    toast.innerHTML = `
        <span class="w-8 h-8 rounded-xl bg-red-600/30 text-red-400 flex items-center justify-center font-black text-sm flex-shrink-0">🚨</span>
        <div class="flex-1 min-w-0">
            <span class="text-xs font-black text-red-400 uppercase tracking-wider block">Low Stock Alert!</span>
            <span class="text-xs font-bold text-white block truncate">${itemName}</span>
            <span class="text-[10px] text-slate-300 block">Only ${stockQty} ${unit || 'units'} left in store.</span>
        </div>
        <a href="/restock.html" class="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-[11px] font-black transition flex-shrink-0">
            Restock
        </a>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('animate-bounce');
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.5s ease';
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }, 1000);
}

export function triggerLowStockNotification(item, threshold = 5) {
    if (!item) return;

    // Deduplication check within the current session (30 minutes cooldown per item)
    const now = Date.now();
    let notifiedMap = {};
    try {
        notifiedMap = JSON.parse(sessionStorage.getItem(NOTIFIED_ITEMS_KEY) || '{}');
    } catch {
        notifiedMap = {};
    }

    const lastNotified = notifiedMap[item.id];
    if (lastNotified && (now - lastNotified) < 30 * 60 * 1000) {
        return; // Already notified recently
    }

    // Record notification
    notifiedMap[item.id] = now;
    try {
        sessionStorage.setItem(NOTIFIED_ITEMS_KEY, JSON.stringify(notifiedMap));
    } catch {}

    const title = `🚨 Low Stock Alert - Litaj Hardware`;
    const unit = item.unit_of_measure || 'units';
    const body = `${item.name} is down to ${item.stock_quantity} ${unit}! Please initiate replenishment.`;

    // 1. Play audible alert chime
    playAlertChime();

    // 2. In-App Toast Banner
    showInAppLowStockBanner(item.name, item.stock_quantity, unit);

    // 3. Literal System / Mobile Device Notification
    try {
        if ('Notification' in window && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, {
                        body,
                        icon: '/favicon.ico',
                        badge: '/favicon.ico',
                        tag: `low-stock-${item.id}`,
                        vibrate: [200, 100, 200, 100, 200]
                    });
                }).catch(() => {
                    new Notification(title, { body, icon: '/favicon.ico' });
                });
            } else {
                new Notification(title, { body, icon: '/favicon.ico' });
            }
        }
    } catch (e) {
        console.warn('[NotificationHelper] Could not dispatch system notification:', e);
    }
}

export function checkAndNotifyLowStock(itemsList, threshold = 5) {
    if (!Array.isArray(itemsList)) return;
    const lowItems = itemsList.filter(i => {
        const qty = parseFloat(i.stock_quantity);
        return !isNaN(qty) && qty <= threshold && !i.is_service;
    });

    // Notify up to 2 low stock items at a time to prevent audio overlap
    lowItems.slice(0, 2).forEach(item => {
        triggerLowStockNotification(item, threshold);
    });
}
