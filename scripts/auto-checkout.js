// scripts/auto-checkout.js
require('dotenv').config();
const BookingService = require('../services/booking-services');

async function runAutoCheckout() {
    console.log('🔄 Running daily auto-checkout...');
    console.log('Date:', new Date().toISOString());

    try {
        const bookingService = new BookingService();
        const result = await bookingService.autoCheckoutExpiredBookings();

        console.log('✅ Auto-checkout completed:', result);

        if (result.processed > 0) {
            // Send notification (email, WhatsApp, etc.)
            console.log(`📢 Notified about ${result.processed} check-outs`);
        }

    } catch (error) {
        console.error('❌ Auto-checkout failed:', error);
    }
}

runAutoCheckout();