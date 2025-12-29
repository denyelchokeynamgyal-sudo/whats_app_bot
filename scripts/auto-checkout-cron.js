// scripts/auto-checkout-cron.js
require('dotenv').config();
const cron = require('node-cron');
const GoogleSheetsService = require('../services/google-sheets-service');

async function runAutoCheckout() {
    console.log('🕒 Running scheduled auto-checkout...');

    try {
        const sheetsService = new GoogleSheetsService();
        const result = await sheetsService.autoCheckoutExpiredBookings();

        console.log('📊 Auto-checkout result:', {
            processed: result.processed,
            successful: result.successful,
            failed: result.failed,
            time: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Scheduled auto-checkout failed:', error);
    }
}

// Schedule to run daily at 2:00 AM
cron.schedule('0 2 * * *', runAutoCheckout, {
    scheduled: true,
    timezone: "Asia/Thimphu"
});

console.log('⏰ Auto-checkout scheduler started. Will run daily at 2:00 AM Bhutan time.');

// Also run once on startup
runAutoCheckout();

// Keep script running
process.on('SIGINT', () => {
    console.log('🛑 Stopping auto-checkout scheduler...');
    process.exit(0);
});