// Root entrypoint for Vercel / Node.js
const app = require('./src/server');

// If executed directly: node index.js
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Litaj Hardware POS running on port ${PORT}`);
    });
}

module.exports = app;
