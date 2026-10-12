/**
 * Litaj Hardware POS — Express Web Server
 * Layer 02 (APIs) + Layer 05 (Hosting) + Layer 13 (Availability)
 * All secrets loaded exclusively from environment variables (Layer 05 compliant)
 */

'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────
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

// Static assets (Layer 10 — served efficiently)
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true
}));

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

// ── HTML Page Routes ─────────────────────────────────────────
app.get('/',           (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));
app.get('/login',      (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));
app.get('/pos',        (req, res) => res.sendFile(path.join(__dirname, '../public/pos.html')));
app.get('/inventory',  (req, res) => res.sendFile(path.join(__dirname, '../public/inventory.html')));
app.get('/customers',  (req, res) => res.sendFile(path.join(__dirname, '../public/customers.html')));
app.get('/admin',      (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));

// ── Fallback Router ──────────────────────────────────────────
app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
        return res.sendFile(path.join(__dirname, '../public/login.html'));
    }
    next();
});

// ── Global Error Handler (Layer 12 — never leak stack traces) ──
app.use((err, req, res, next) => {
    const isDev = process.env.NODE_ENV !== 'production';
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({
        error:   isDev ? err.message : 'Internal server error',
        details: isDev ? err.stack   : undefined
    });
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('====================================================');
    console.log('🟧  LITAJ HARDWARE POS SERVER STARTED');
    console.log(`>   URL  : http://localhost:${PORT}`);
    console.log(`>   Mode : ${process.env.NODE_ENV || 'development'}`);
    console.log('====================================================');
});

module.exports = app;
