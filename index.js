require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const BookingService = require('./services/booking-services');
const OpenAIService = require('./services/openai-service');

// Initialize services
let bookingService;
let aiService;
let client;



async function initializeBot() {
    try {
        console.log(`
    ╔══════════════════════════════════════════╗
    ║    🏨 HOTEL BOOKING BOT v2.0            ║
    ║    📊 Backend: Google Sheets            ║
    ║    🤖 AI: OpenAI GPT-4o                 ║
    ║    📱 WhatsApp: Ready                   ║
    ╚══════════════════════════════════════════╝
        `);

        // 1. Initialize Google Sheets services
        console.log('🔄 Initializing services...');
        bookingService = new BookingService();
        aiService = new OpenAIService(bookingService);

        // Test Google Sheets connection
        try {
            const rooms = await bookingService.getAllRoomsWithAvailability();
            console.log(`✅ Connected to Google Sheets: ${rooms.length} rooms loaded`);
        } catch (error) {
            process.exit(1);
        }

        // 2. Initialize WhatsApp client
        client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'hotel-bot-google-sheets',
                dataPath: './.wwebjs_auth'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote'
                ]
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        // 3. Setup event handlers
        setupEventHandlers();

        // 4. Initialize WhatsApp
        await client.initialize();

        console.log(`
    ✅ Bot initialization complete!
    
    🔗 Employee Dashboard: http://localhost:3001
    📊 Bookings visible in real-time in Google Sheets
    
    ════════════════════════════════════════════
    Waiting for messages...
        `);

    } catch (error) {
        console.error('❌ Initialization failed:', error);
        console.log('💡 Troubleshooting:');
        console.log('   - Check internet connection');
        console.log('   - Verify .env file exists');
        console.log('   - Ensure Google Sheets API is enabled');
        process.exit(1);
    }
}

function setupEventHandlers() {
    // QR Code handler
    client.on('qr', (qr) => {
        console.log('\n' + '═'.repeat(60));
        console.log('🔐 SCAN THIS QR CODE WITH WHATSAPP');
        console.log('═'.repeat(60));
        qrcode.generate(qr, { small: false });
        console.log('═'.repeat(60));
        console.log('📱 On your phone:');
        console.log('   1. Open WhatsApp');
        console.log('   2. Tap ⋮ → Linked Devices → Link a Device');
        console.log('   3. Scan the QR code above');
        console.log('═'.repeat(60) + '\n');
    });

    // Authentication handlers
    client.on('authenticated', () => {
        console.log('✅ WhatsApp authenticated! Session saved.');
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Authentication failed:', msg);
        console.log('💡 Try deleting .wwebjs_auth folder and restarting');
    });

    client.on('ready', () => {
        console.log(`
    ╔══════════════════════════════════════════╗
    ║    🏨🤖 BOT IS READY!                   ║
    ║    📱 WhatsApp: Connected              ║
    ║    📊 Google Sheets: Live              ║
    ║    🤖 OpenAI: Active                   ║
    ╚══════════════════════════════════════════╝
    
    📋 Available Commands:
    • /start - Welcome message
    • /help - Show help
    • /menu - Quick options
    • /status - Bot status
    • /clear - Clear conversation
    
    🏨 How to Book:
    Just say: "I want to book a room"
    I'll guide you through the process!
    
    📞 Staff confirmation required for all bookings.
        `);
    });



    client.on('message', async (message) => {
        // Ignore status broadcasts
        if (message.from === 'status@broadcast') return;

        // Extract phone number properly
        let phone = message.from;
        console.log('📱 Raw WhatsApp ID:', phone);

        // Remove suffixes
        if (phone.includes('@c.us')) {
            phone = phone.replace('@c.us', '');
        }
        if (phone.includes('@lid')) {
            phone = phone.replace('@lid', '');
        }

        // Extract just digits
        const phoneDigits = phone.replace(/\D/g, '');

        // Handle special case for WhatsApp internal ID
        let cleanPhone, displayPhone;

        if (phoneDigits === '181076576194630') {
            // WhatsApp internal ID - use actual number
            console.log('⚠️ Detected WhatsApp internal ID, using test number');
            cleanPhone = '917585051277'; // without +
            displayPhone = '+91 75850 51277';

        } else if (phoneDigits.startsWith('91') && phoneDigits.length === 12) {
            // Indian number: 917585051277
            cleanPhone = phoneDigits;
            displayPhone = `+91 ${phoneDigits.substring(2, 7)} ${phoneDigits.substring(7)}`;

        } else if (phoneDigits.startsWith("975") && phoneDigits.length === 11) {
            cleanPhone = phoneDigits;
            displayPhone = `+975 ${phoneDigits.substring(3, 7)} ${phoneDigits.substring(7)}`

        } else if (phoneDigits.length === 10) {
            // 10-digit local Indian number
            cleanPhone = `91${phoneDigits}`;
            displayPhone = `+91 ${phoneDigits.substring(0, 5)} ${phoneDigits.substring(5)}`;

        } else if (phoneDigits.length > 10) {
            // Other international (best effort)
            cleanPhone = phoneDigits;
            displayPhone = `+${phoneDigits}`;

        } else {
            // Fallback
            cleanPhone = phoneDigits;
            displayPhone = phoneDigits;
        }

        const userMessage = message.body.trim();

        // Log the message
        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        console.log(`\n📩 [${timestamp}] From: ${displayPhone} (clean: ${cleanPhone})`);
        console.log(`💬 Message: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);

        // Handle commands
        const lowerMessage = userMessage.toLowerCase();

        if (lowerMessage === '/start') {
            await sendWelcomeMessage(message);
            return;
        }

        if (lowerMessage === '/help') {
            await sendHelpMessage(message);
            return;
        }

        if (lowerMessage === '/menu') {
            await sendQuickMenu(message);
            return;
        }

        if (lowerMessage === '/clear') {
            aiService.clearHistory(cleanPhone);
            await message.reply('🗑️ Conversation history cleared! How can I help you?');
            return;
        }

        if (lowerMessage === '/status') {
            await sendBotStatus(message);
            return;
        }

        // Process with AI - USE cleanPhone
        try {
            console.log('🤖 Processing with AI for:', displayPhone);

            const response = await aiService.getAIResponse(cleanPhone, userMessage);

            if (response && response.trim()) {
                await message.reply(response);
                console.log(`✅ Response sent to ${displayPhone} (${response.length} chars)`);
            } else {
                console.error('❌ Empty response from AI');
                await message.reply("I apologize, but I couldn't generate a response. Please try again.");
            }

        } catch (error) {
            console.error('❌ Error processing message:', error.message);

            let errorMessage;

            if (error.message.includes('rate limit')) {
                errorMessage = "I'm receiving too many requests. Please wait a moment and try again.";
            } else if (
                error.message.includes('Invalid time value') ||
                error.message.toLowerCase().includes('date')
            ) {
                errorMessage = "I had trouble understanding the date format. Please use format like 'December 25, 2024' or '2024-12-25'.";
            } else if (
                error.message.includes('Google Sheets') ||
                error.message.includes('spreadsheet')
            ) {
                errorMessage = "I'm having trouble accessing our booking system. Please contact us directly for assistance.";
                console.error('Google Sheets error details:', error);
            } else {
                errorMessage = "I encountered an unexpected error. Please try again or contact us directly.";
            }

            await message.reply(
                `😅 ${errorMessage}\n\n📞 Contact us: ${process.env.DEFAULT_CONTACT_PHONE || '+975-17271095'}`
            );
        }
    });



    // Disconnect handler
    client.on('disconnected', (reason) => {
        console.log('❌ WhatsApp disconnected:', reason);
        console.log('💡 Bot will attempt to reconnect automatically');
    });

    // Error handler
    client.on('error', (error) => {
        console.error('❌ WhatsApp client error:', error.message);
    });
}

// Helper functions
async function sendWelcomeMessage(message) {
    const welcomeMsg = `🏨 *Welcome to ${process.env.DEFAULT_HOTEL_NAME || 'Jaggle AI'} Booking Assistant!* 🤖

I'm your AI-powered booking assistant connected to our *real-time booking system*.

✨ *What I Can Do:*
✅ Check room availability (Live from Google Sheets)
📅 Submit booking requests
💰 Calculate prices instantly
🏊 Share hotel amenities & services
📋 Help with your reservation

🔒 *Important Notes:*
• All bookings require *staff confirmation* via phone call
• We'll call you within *30 minutes* of your request
• Payment is collected during the confirmation call
• Room availability updates in *real-time*

📋 *How to Book (Simple Steps):*
1. Tell me what room type you need
2. Provide check-in date
3. Mention number of nights
4. Let me know number of guests
5. Share your name

I'll check availability and guide you through! 😊

*Quick Commands:*
• Type /help for all commands
• Type /menu for quick options
• Type /clear to start fresh
• Type /status for bot status

*Ready to book or check availability?* Just say hello! 👋`;

    await message.reply(welcomeMsg);
}

async function sendHelpMessage(message) {
    const helpMsg = `📋 *AVAILABLE COMMANDS*

/start - Welcome message with instructions
/help - Show this help menu  
/menu - Quick action menu
/clear - Clear conversation history
/status - Check bot & hotel status

🏨 *Common Questions:*

*"What rooms are available?"*
• I'll show you real-time availability from our system

*"I want to book a room"*
• I'll guide you step-by-step through booking

*"How much for 2 nights?"*
• Tell me room type and dates for price calculation

*"What amenities do you have?"*
• I'll share all our facilities and services

📞 *Need Immediate Help?*
Contact us directly: ${process.env.DEFAULT_CONTACT_PHONE || '+975-17271095'}

*Remember:* Staff will call to confirm all bookings.`;

    await message.reply(helpMsg);
}

async function sendQuickMenu(message) {
    const menuMsg = `📱 *QUICK ACTION MENU*

Reply with the number or just tell me what you need:

1. 🏨 *Check Room Availability*
   "What rooms are available for tomorrow?"

2. 📅 *Make a Booking Request*
   "I want to book a Double Room"

3. 💰 *Calculate Price*
   "How much for 3 nights in a Suite?"

4. ⭐ *Hotel Amenities*
   "What facilities do you have?"

5. 📍 *Local Attractions*
   "What's there to do nearby?"

6. 📞 *Contact Information*
   "What's your phone number?"

7. ❓ *Other Questions*
   "What's your check-in time?"

*Or simply type what you're looking for!*`;

    await message.reply(menuMsg);
}

async function sendBotStatus(message) {
    try {
        const rooms = await bookingService.getAllRoomsWithAvailability();
        const availableRooms = rooms.filter(r => r.isAvailable).length;
        const totalRooms = rooms.length;

        const statusMsg = `🤖 *BOT STATUS REPORT*

✅ *Operational Status*
• WhatsApp: Connected ✓
• AI Assistant: Active (GPT-4o) ✓
• Backend: Google Sheets ✓
• Uptime: ${Math.floor(process.uptime() / 60)} minutes

🏨 *Hotel Status*
• Total Room Types: ${totalRooms}
• Currently Available: ${availableRooms}
• System: Real-time Google Sheets updates
• Last Sync: Just now

📊 *System Info*
• Bot Version: 2.0 (Google Sheets)
• Database: Live Google Sheets
• Updates: Instant room availability
• Staff Dashboard: Active

💡 *Note:* All bookings require staff phone confirmation for security.`;

        await message.reply(statusMsg);
    } catch (error) {
        console.error('Error getting status:', error);
        await message.reply(`✅ Bot is operational but couldn't fetch room data.\n\n📞 Contact: ${process.env.DEFAULT_CONTACT_PHONE || '+975-17271095'}`);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🔄 Shutting down gracefully...');
    console.log('═'.repeat(50));

    if (client) {
        try {
            await client.destroy();
            console.log('✅ WhatsApp client closed');
        } catch (error) {
            console.error('❌ Error closing WhatsApp:', error.message);
        }
    }

    console.log('👋 Bot stopped successfully');
    console.log('═'.repeat(50));
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n⚠️ Received termination signal...');
    if (client) {
        await client.destroy();
    }
    process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the bot
initializeBot().catch(console.error);