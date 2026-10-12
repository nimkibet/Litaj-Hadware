module.exports = (req, res) => {
    res.status(200).json({
        status: 'healthy',
        platform: 'vercel-serverless',
        timestamp: new Date().toISOString()
    });
};
