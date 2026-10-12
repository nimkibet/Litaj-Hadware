/**
 * Litaj Hardware POS — Express Web Server
 * Layer 02 (APIs) + Layer 05 (Hosting) + Layer 13 (Availability)
 * Injects environment variables securely into HTML meta tags at runtime.
 */

'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & Middleware ────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Security Headers (Layer 05)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Helper: Serve HTML with runtime injected credentials from .env
function sendHtml(fileName, res) {
    const fullPath = path.join(__dirname, '../public', fileName);
    if (!fs.existsSync(fullPath)) {
        return res.status(404).send('Page not found');
    }

    let html = fs.readFileSync(fullPath, 'utf8');
    const anonKey = process.env.SUPABASE_ANON_KEY || '';
    const supaUrl = process.env.SUPABASE_URL || '';

    if (anonKey) {
        html = html.replace(/REPLACE_WITH_ANON_KEY/g, anonKey);
    }
    if (supaUrl) {
        html = html.replace(/https:\/\/sbpncxjddwontoemkuye\.supabase\.co/g, supaUrl);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
}

// ── Explicit HTML Routes with Injected Meta Tags ─────────────
app.get('/',               (req, res) => sendHtml('login.html', res));
app.get('/login',          (req, res) => sendHtml('login.html', res));
app.get('/login.html',     (req, res) => sendHtml('login.html', res));
app.get('/pos',            (req, res) => sendHtml('pos.html', res));
app.get('/pos.html',       (req, res) => sendHtml('pos.html', res));
app.get('/inventory',      (req, res) => sendHtml('inventory.html', res));
app.get('/inventory.html', (req, res) => sendHtml('inventory.html', res));
app.get('/customers',      (req, res) => sendHtml('customers.html', res));
app.get('/customers.html', (req, res) => sendHtml('customers.html', res));
app.get('/admin',          (req, res) => sendHtml('admin.html', res));
app.get('/admin.html',     (req, res) => sendHtml('admin.html', res));

// ── Static Assets (JS, CSS, Images) ──────────────────────────
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true
}));

// ── Client Configuration Endpoint ────────────────────────────
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    });
});

// ── Health Check (Layer 13 — Availability) ──────────────────
app.get('/healthz', (req, res) => {
    res.status(200).json({
        status:    'healthy',
        system:    'Litaj Hardware POS',
        version:   '1.0.0',
        timestamp: new Date().toISOString(),
        env:       process.env.NODE_ENV || 'development'
    });
});

// ── Fallback Router ──────────────────────────────────────────
app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
        return sendHtml('login.html', res);
    }
    next();
});

// ── Global Error Handler (Layer 12 — hide stack traces) ──────
app.use((err, req, res, next) => {
    const isDev = process.env.NODE_ENV !== 'production';
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({
        error:   isDev ? err.message : 'Internal server error',
        details: isDev ? err.stack   : undefined
    });
});

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('====================================================');
    console.log('🟧  LITAJ HARDWARE POS SERVER STARTED');
    console.log(`>   URL  : http://localhost:${PORT}`);
    console.log(`>   Mode : ${process.env.NODE_ENV || 'development'}`);
    console.log('====================================================');
});

module.exports = app;
