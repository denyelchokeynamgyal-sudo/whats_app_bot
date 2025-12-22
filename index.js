const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const database = require('./config/database');
const BookingService = require('./services/booking-services');
const OpenAIService = require('./services/openai-service');
require('dotenv').config();

// Initialize services
let bookingService;
let aiService;
let client;

async function initializeBot() {
    try {
        console.log('🚀 Initializing Hotel Booking Bot...\n');

        // 1. Connect to database
        console.log('📊 Connecting to database...');
        await database.connect();

        // 2. Initialize services
        console.log('🔄 Initializing services...');
        bookingService = require('./services/booking-services');
        aiService = new OpenAIService(bookingService);

        // 3. Initialize WhatsApp client
        client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'hotel-bot',
                dataPath: './.wwebjs_auth'
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        // 4. Setup event handlers
        setupEventHandlers();

        // 5. Initialize WhatsApp
        await client.initialize();

        console.log('\n✅ Bot initialization complete!');

    } catch (error) {
        console.error('❌ Initialization failed:', error);
        process.exit(1);
    }
}

function setupEventHandlers() {
    // QR Code handler
    client.on('qr', (qr) => {
        console.log('\n' + '═'.repeat(50));
        console.log('🔐 SCAN THIS QR CODE WITH WHATSAPP');
        console.log('═'.repeat(50));
        qrcode.generate(qr, { small: false });
        console.log('═'.repeat(50));
        console.log('📱 On your phone: WhatsApp → Settings → Linked Devices');
        console.log('═'.repeat(50) + '\n');
    });

    // Authentication handlers
    client.on('authenticated', () => {
        console.log('✅ WhatsApp authenticated! Session saved.');
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Authentication failed:', msg);
    });

    client.on('ready', () => {
        console.log('🏨🤖 HOTEL BOOKING BOT IS READY!');
        console.log('📊 Database: Connected & Auto-updating');
        console.log('🤖 AI: OpenAI GPT-4 Active');
        console.log('\n⭐ Bot Features:');
        console.log('• Real-time room availability');
        console.log('• Auto-updating database on bookings');
        console.log('• Natural conversations with AI');
        console.log('• Multiple customer support');
        console.log('⭐'.repeat(50) + '\n');
    });

    // Message handler - MAIN LOGIC
    client.on('message', async (message) => {
        // Ignore status broadcasts
        if (message.from === 'status@broadcast') return;

        const phone = message.from.replace('@c.us', '');
        const userMessage = message.body.trim();

        console.log(`\n📩 [${new Date().toLocaleTimeString()}] From: ${phone}`);
        console.log(`💬 Message: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);

        // Handle commands
        if (userMessage.toLowerCase() === '/start') {
            await sendWelcomeMessage(message);
            return;
        }

        if (userMessage.toLowerCase() === '/help') {
            await sendHelpMessage(message);
            return;
        }

        if (userMessage.toLowerCase() === '/menu') {
            await sendQuickMenu(message);
            return;
        }

        if (userMessage.toLowerCase() === '/clear') {
            aiService.clearHistory(phone);
            await message.reply('🗑️ Conversation cleared! How can I help you?');
            return;
        }

        if (userMessage.toLowerCase() === '/status') {
            await sendBotStatus(message);
            return;
        }

        // Process with AI
        try {
            console.log('🤖 Processing with AI + Database...');
            const response = await aiService.getAIResponse(phone, userMessage);

            if (response && response.trim()) {
                await message.reply(response);
                console.log("Response sent");

            } else {
                throw new Error("Empty response from AI");
            }

        } catch (error) {
            console.error('❌ Error processing message:', error.message, error.stack);

            let errorMessage = "I encountered an error. Please try again or contact us directly.";

            // More specific error messages
            if (error.message.includes('Invalid time value')) {
                errorMessage = "I had trouble understanding the date format. Please use format like '2024-06-15' or 'June 15, 2024'.";
            } else if (error.message.includes('rate limit')) {
                errorMessage = "I'm receiving too many requests. Please wait a moment and try again.";
            }

            await message.reply(errorMessage);
        }
    });

    // Disconnect handler
    client.on('disconnected', (reason) => {
        console.log('❌ WhatsApp disconnected:', reason);
        console.log('💡 Restart the bot to reconnect');
    });
}

// Helper functions
async function sendWelcomeMessage(message) {
    const welcomeMsg = `🏨 *Welcome to Hotel Booking Assistant!* 🤖

I'm your AI-powered booking assistant with *real-time availability*.

*What I can do:*
✅ Check room availability (REAL-TIME from database)
📅 Book rooms (AUTO-UPDATES database)
💰 Calculate prices
🏊 Answer questions about amenities
📋 Manage your bookings

*Quick Commands:*
/help - Show all commands
/menu - Quick options
/clear - Start fresh conversation
/status - Check bot status

*How to Book:*
Just tell me:
1. What room type you need
2. Check-in date (YYYY-MM-DD)
3. Number of nights
4. Number of guests

I'll check *real availability* and guide you through! 😊`;

    await message.reply(welcomeMsg);
}

async function sendHelpMessage(message) {
    const helpMsg = `📋 *AVAILABLE COMMANDS*

/start - Welcome message
/help - This help menu  
/menu - Quick options
/clear - Clear history
/status - Bot status

*To Check Availability:*
"Are Deluxe Rooms available this weekend?"
"What rooms are free for June 15?"
"Show me available rooms"

*To Book:*
"I want to book a room"
"Book Executive Suite for 3 nights"
"Make reservation for 2 guests"

*I'll guide you through the process!* 🏨`;

    await message.reply(helpMsg);
}

async function sendQuickMenu(message) {
    const menuMsg = `📱 *QUICK MENU*

Reply with your choice:

1. 🏨 Check Room Availability
2. 📅 Make a Booking  
3. 💰 Calculate Price
4. ⭐ Hotel Amenities
5. 📍 Local Attractions
6. 📞 Contact Support
7. ❓ Other Questions

Or just type what you need!`;

    await message.reply(menuMsg);
}

async function sendBotStatus(message) {
    try {
        const rooms = await bookingService.getAllRoomsWithAvailability();
        const availableRooms = rooms.filter(r => r.availableCount > 0).length;

        const statusMsg = `🤖 *BOT STATUS*

✅ **Operational**
📊 Database: Connected
🤖 AI: Active (GPT-4)
🕒 Uptime: ${process.uptime().toFixed(0)} seconds

🏨 **Hotel Status:**
• Total Room Types: ${rooms.length}
• Available Room Types: ${availableRooms}
• System: Auto-updating on bookings

💡 The database updates in *real-time* when bookings are made.`;

        await message.reply(statusMsg);
    } catch (error) {
        await message.reply("Status: Operational but could not fetch room data.");
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🔄 Shutting down gracefully...');

    if (client) {
        await client.destroy();
        console.log('✅ WhatsApp client closed');
    }

    await database.disconnect();
    console.log('✅ Database disconnected');

    console.log('👋 Bot stopped successfully');
    process.exit(0);
});

// Start the bot
initializeBot().catch(console.error);