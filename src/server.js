const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint for hosting platforms (Render, Railway, Fly.io, etc.)
app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Default route goes to login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Fallback logic
app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(path.join(__dirname, '../public/login.html'));
    } else {
        next();
    }
});

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 LITAJ HARDWARE POS SYSTEM`);
    console.log(`========================================`);
    console.log(`> Listening on http://localhost:${PORT}`);
    console.log(`> Multi-page architecture (login.html, pos.html...)`);
    console.log(`========================================\n`);
});
