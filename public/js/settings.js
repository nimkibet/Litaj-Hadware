import { supabase, currentUser, requireAuth } from './supabaseClient.js';

// Enforce Auth and Strict Administrator Access Boundary
requireAuth();
if (currentUser && currentUser.role !== 'admin') {
    window.location.href = '/pos.html';
}

// --------------------------------------------------------------------
// State Management
// --------------------------------------------------------------------
const defaultSettings = {
    company_name: 'Litaj Hardware',
    tagline: 'Building Materials & Construction Supplies',
    store_email: 'info@litajhardware.co.ke',
    phone_contact: '+254 700 000 000',
    location_address: 'Main Hardware Yard, Commercial Street',
    currency_symbol: 'KSh',
    tax_rate: '0',
    max_discount_pct: '50',
    low_stock_threshold: '5',
    receipt_footer: 'Thank you for building with Litaj Hardware! Goods once sold are not returnable without valid receipt.'
};

let currentSettings = { ...defaultSettings };

// --------------------------------------------------------------------
// Initialization
// --------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSettingsForm();
    initNotificationControls();
    loadSettingsFromDatabase();
});

function initNavigation() {
    // Show admin-only navigation links
    if (currentUser?.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuChevron = document.getElementById('mobile-menu-chevron');

    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            const isHidden = mobileMenu.classList.contains('hidden');
            if (isHidden) {
                mobileMenu.classList.remove('hidden');
                mobileMenuChevron?.classList.add('rotate-180');
            } else {
                mobileMenu.classList.add('hidden');
                mobileMenuChevron?.classList.remove('rotate-180');
            }
        });
    }

    // Collapsible Other Menus
    const toggleOtherBtn = document.getElementById('toggle-other-menus-btn');
    const collapsibleOther = document.getElementById('collapsible-other-menus');
    const chevronOther = document.getElementById('chevron-other-menus');

    if (toggleOtherBtn && collapsibleOther) {
        toggleOtherBtn.addEventListener('click', () => {
            const isHidden = collapsibleOther.classList.contains('hidden');
            if (isHidden) {
                collapsibleOther.classList.remove('hidden');
                chevronOther?.classList.add('rotate-180');
            } else {
                collapsibleOther.classList.add('hidden');
                chevronOther?.classList.remove('rotate-180');
            }
        });
    }

    // Logout Handlers
    const handleLogout = async () => {
        if (!confirm('Are you sure you want to sign out of Litaj Hardware POS?')) return;
        localStorage.removeItem('lh_user');
        sessionStorage.clear();
        await supabase.auth.signOut().catch(() => {});
        window.location.href = '/index.html';
    };

    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
    document.getElementById('btn-logout-mobile')?.addEventListener('click', handleLogout);
}

function initSettingsForm() {
    // Live update preview on form input
    const inputs = [
        'set-company-name',
        'set-tagline',
        'set-store-email',
        'set-phone-contact',
        'set-location-address',
        'set-currency-symbol',
        'set-receipt-footer',
        'set-max-discount-pct'
    ];

    inputs.forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateLivePreview);
    });

    document.getElementById('btn-save-settings')?.addEventListener('click', saveSettingsToDatabase);
}

// --------------------------------------------------------------------
// Load Settings From Supabase
// --------------------------------------------------------------------
async function loadSettingsFromDatabase() {
    try {
        const { data, error } = await supabase.from('settings').select('*');
        if (error) {
            console.error('[Settings] Error fetching settings:', error);
            showAlert('Failed to fetch settings: ' + error.message, 'error');
            return;
        }

        if (data && data.length > 0) {
            data.forEach(s => {
                if (s.key && s.value !== undefined) {
                    currentSettings[s.key] = s.value;
                }
            });
        }

        // Cache locally for offline resilience
        localStorage.setItem('lh_store_settings', JSON.stringify(currentSettings));

        // Populate Form Fields
        setInputValue('set-company-name', currentSettings.company_name);
        setInputValue('set-tagline', currentSettings.tagline);
        setInputValue('set-store-email', currentSettings.store_email);
        setInputValue('set-phone-contact', currentSettings.phone_contact);
        setInputValue('set-location-address', currentSettings.location_address);
        setInputValue('set-currency-symbol', currentSettings.currency_symbol);
        setInputValue('set-tax-rate', currentSettings.tax_rate);
        setInputValue('set-max-discount-pct', currentSettings.max_discount_pct || '50');
        setInputValue('set-low-stock-threshold', currentSettings.low_stock_threshold || '5');
        setInputValue('set-receipt-footer', currentSettings.receipt_footer);

        updateLivePreview();

    } catch (err) {
        console.error('[Settings] Unexpected error:', err);
    }
}

function setInputValue(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
}

function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

// --------------------------------------------------------------------
// Live Document & Receipt Preview
// --------------------------------------------------------------------
function updateLivePreview() {
    const company = getInputValue('set-company-name') || defaultSettings.company_name;
    const tagline = getInputValue('set-tagline') || defaultSettings.tagline;
    const email = getInputValue('set-store-email') || defaultSettings.store_email;
    const phone = getInputValue('set-phone-contact') || defaultSettings.phone_contact;
    const location = getInputValue('set-location-address') || defaultSettings.location_address;
    const currency = getInputValue('set-currency-symbol') || defaultSettings.currency_symbol;
    const footer = getInputValue('set-receipt-footer') || defaultSettings.receipt_footer;

    const elCompany = document.getElementById('preview-company-name');
    const elTagline = document.getElementById('preview-tagline');
    const elEmail = document.getElementById('preview-email');
    const elContacts = document.getElementById('preview-contacts');
    const elLocation = document.getElementById('preview-location');
    const elTotal = document.getElementById('preview-currency-total');
    const elFooter = document.getElementById('preview-footer');

    if (elCompany) elCompany.textContent = company;
    if (elTagline) elTagline.textContent = tagline;
    if (elEmail) elEmail.textContent = `Email: ${email}`;
    if (elContacts) elContacts.textContent = `Tel: ${phone}`;
    if (elLocation) elLocation.textContent = location;
    if (elTotal) elTotal.textContent = `${currency} 1,600.00`;
    if (elFooter) elFooter.textContent = footer;
}

// --------------------------------------------------------------------
// Save Settings to Supabase (Zero Trust & Boundary Validation)
// --------------------------------------------------------------------
async function saveSettingsToDatabase() {
    const btn = document.getElementById('btn-save-settings');
    const originalText = btn.innerHTML;

    // 1. Collect Form Values
    const companyName = getInputValue('set-company-name');
    const tagline = getInputValue('set-tagline');
    const storeEmail = getInputValue('set-store-email');
    const phoneContact = getInputValue('set-phone-contact');
    const locationAddress = getInputValue('set-location-address');
    const currencySymbol = getInputValue('set-currency-symbol') || 'KSh';
    const taxRateStr = getInputValue('set-tax-rate') || '0';
    const maxDiscountStr = getInputValue('set-max-discount-pct') || '50';
    const thresholdStr = getInputValue('set-low-stock-threshold') || '5';
    const receiptFooter = getInputValue('set-receipt-footer');

    // 2. Strict Input Validation (No Negative Numbers, Max 50% Discount Limit)
    if (!companyName) {
        return showAlert('Store name cannot be empty.', 'error');
    }
    if (!storeEmail) {
        return showAlert('Store email cannot be empty.', 'error');
    }
    if (!phoneContact) {
        return showAlert('Store phone contact cannot be empty.', 'error');
    }
    if (!locationAddress) {
        return showAlert('Physical location address cannot be empty.', 'error');
    }

    const taxRate = parseFloat(taxRateStr);
    if (isNaN(taxRate) || taxRate < 0) {
        return showAlert('Tax rate cannot be negative.', 'error');
    }

    const maxDiscount = parseFloat(maxDiscountStr);
    if (isNaN(maxDiscount) || maxDiscount < 0) {
        return showAlert('Max discount percentage cannot be negative.', 'error');
    }
    if (maxDiscount > 50) {
        return showAlert('Security Rule: Maximum discount limit cannot exceed 50%.', 'error');
    }

    const threshold = parseInt(thresholdStr, 10);
    if (isNaN(threshold) || threshold < 1) {
        return showAlert('Low stock threshold must be at least 1 unit.', 'error');
    }

    // 3. Prepare Payloads for Supabase Upsert
    const now = new Date().toISOString();
    const rowsToUpsert = [
        { key: 'company_name', value: companyName, updated_at: now },
        { key: 'tagline', value: tagline, updated_at: now },
        { key: 'store_email', value: storeEmail, updated_at: now },
        { key: 'phone_contact', value: phoneContact, updated_at: now },
        { key: 'location_address', value: locationAddress, updated_at: now },
        { key: 'currency_symbol', value: currencySymbol, updated_at: now },
        { key: 'tax_rate', value: taxRate.toString(), updated_at: now },
        { key: 'max_discount_pct', value: maxDiscount.toString(), updated_at: now },
        { key: 'low_stock_threshold', value: threshold.toString(), updated_at: now },
        { key: 'receipt_footer', value: receiptFooter, updated_at: now }
    ];

    try {
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="animate-spin h-4 w-4 text-white inline mr-1" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Saving Settings...
        `;

        for (const row of rowsToUpsert) {
            const { error } = await supabase.from('settings').upsert(row, { onConflict: 'key' });
            if (error) throw error;
            currentSettings[row.key] = row.value;
        }

        // Cache in localStorage for offline availability
        localStorage.setItem('lh_store_settings', JSON.stringify(currentSettings));

        showAlert('Store settings and receipt parameters saved successfully to database!', 'success');
        updateLivePreview();

    } catch (err) {
        console.error('[Settings] Save error:', err);
        showAlert('Failed to save settings: ' + (err.message || err), 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function showAlert(msg, type = 'success') {
    const banner = document.getElementById('settings-alert-banner');
    const text = document.getElementById('settings-alert-text');
    if (!banner || !text) return alert(msg);

    text.textContent = msg;
    banner.classList.remove('hidden', 'bg-emerald-50', 'text-emerald-800', 'border-emerald-200', 'bg-red-50', 'text-red-800', 'border-red-200');

    if (type === 'success') {
        banner.classList.add('bg-emerald-50', 'text-emerald-800', 'border-emerald-200');
    } else {
        banner.classList.add('bg-red-50', 'text-red-800', 'border-red-200');
    }

    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => {
        banner.classList.add('hidden');
    }, 6000);
}

// --------------------------------------------------------------------
// Literal Device & Mobile Push Notification Controls
// --------------------------------------------------------------------
function initNotificationControls() {
    updateNotificationBadge();

    document.getElementById('btn-request-notification')?.addEventListener('click', async () => {
        if (!('Notification' in window)) {
            return alert('This browser does not support desktop/device notifications.');
        }

        try {
            const permission = await Notification.requestPermission();
            updateNotificationBadge();

            if (permission === 'granted') {
                sendTestDeviceNotification('Notifications Activated!', 'You will now receive literal alerts whenever hardware inventory drops below threshold.');
            } else if (permission === 'denied') {
                alert('Notifications are blocked by your browser settings. Please allow notifications in your browser permissions bar.');
            }
        } catch (e) {
            console.error('[Notifications] Permission error:', e);
        }
    });

    document.getElementById('btn-test-notification')?.addEventListener('click', () => {
        if (!('Notification' in window)) {
            return alert('Notifications are not supported on this browser.');
        }

        if (Notification.permission !== 'granted') {
            return alert('Please click "Enable Alerts" first to grant notification permissions.');
        }

        sendTestDeviceNotification(
            '🚨 Low Stock Alert - Litaj Hardware',
            'Bamburi Tembo Cement 50kg is down to 3 bags! Please initiate restock order.'
        );
    });
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-permission-badge');
    if (!badge) return;

    if (!('Notification' in window)) {
        badge.textContent = 'Not Supported';
        badge.className = 'px-2 py-0.5 rounded text-[11px] font-black uppercase bg-slate-200 text-slate-600';
        return;
    }

    const perm = Notification.permission;
    if (perm === 'granted') {
        badge.textContent = 'Active & Granted';
        badge.className = 'px-2 py-0.5 rounded text-[11px] font-black uppercase bg-emerald-100 text-emerald-800';
    } else if (perm === 'denied') {
        badge.textContent = 'Blocked / Denied';
        badge.className = 'px-2 py-0.5 rounded text-[11px] font-black uppercase bg-red-100 text-red-800';
    } else {
        badge.textContent = 'Permission Needed';
        badge.className = 'px-2 py-0.5 rounded text-[11px] font-black uppercase bg-amber-100 text-amber-800';
    }
}

function sendTestDeviceNotification(title, body) {
    try {
        // Trigger subtle Web Audio Tone for audible ping
        playAlertChime();

        if (Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, {
                        body: body,
                        icon: '/favicon.ico',
                        badge: '/favicon.ico',
                        tag: 'litaj-hardware-alert',
                        vibrate: [200, 100, 200]
                    });
                }).catch(() => {
                    new Notification(title, { body, icon: '/favicon.ico' });
                });
            } else {
                new Notification(title, { body, icon: '/favicon.ico' });
            }
        }
    } catch (e) {
        console.warn('[Notifications] Could not dispatch notification:', e);
    }
}

function playAlertChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6 note

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch {
        // AudioContext restricted before user interaction
    }
}
