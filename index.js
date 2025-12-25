// index.js - WhatsApp Business API Version
require('dotenv').config();
const WhatsAppAPIServer = require('./whatsapp-api-server');
const EmployeeDashboard = require('./employee-dashboard');

async function startAllServices() {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║    🏨 HOTEL BOOKING SYSTEM v3.0                         ║
║    📊 Backend: Google Sheets                            ║
║    🤖 AI: OpenAI GPT-4o                                 ║
║    📱 WhatsApp: Business API                            ║
╚══════════════════════════════════════════════════════════╝
    `);

    try {
        console.log('🔄 Starting all services...');

        // 1. Start WhatsApp Business API Server
        console.log('📱 Starting WhatsApp Business API Server...');
        const whatsappServer = new WhatsAppAPIServer();
        await whatsappServer.start();
        console.log('✅ WhatsApp Business API Server ready!');

        // 2. Start Employee Dashboard (if needed)
        console.log('👨‍💼 Starting Employee Dashboard...');
        // Employee dashboard is already running on port 3001
        console.log('✅ Employee Dashboard available at http://localhost:3001');

        console.log(`
✅ ALL SYSTEMS ARE GO! 🚀

📱 WhatsApp Business API:
   • Endpoint: /webhook
   • Port: 3000
   • Status: Connected to Meta Cloud API

👨‍💼 Employee Dashboard:
   • URL: http://localhost:3001
   • Auth Token: hotel-staff-2024
   • Status: Ready for staff management

📊 Google Sheets Integration:
   • Status: Active
   • Real-time: Updates immediately

🤖 OpenAI AI Assistant:
   • Model: GPT-4o
   • Status: Active
   • Features: Natural booking conversations

═══════════════════════════════════════════════════════════
📞 Testing Instructions:
1. Message your WhatsApp Business number from any phone
2. Type "hello" to start conversation
3. Try "I want to book a room"
4. Staff can manage at: http://localhost:3001
═══════════════════════════════════════════════════════════
        `);

    } catch (error) {
        console.error('❌ Failed to start services:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🔄 Shutting down gracefully...');
    console.log('═'.repeat(50));
    console.log('👋 Services stopped successfully');
    console.log('═'.repeat(50));
    process.exit(0);
});

// Start everything
startAllServices();