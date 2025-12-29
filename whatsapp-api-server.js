require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const BookingService = require('./services/booking-services');
const OpenAIService = require('./services/openai-service');
const WhatsAppService = require('./whatsapp-service');

class WhatsAppAPIServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.isProduction = process.env.NODE_ENV === 'production';
        this.bookingService = new BookingService();
        this.whatsappService = new WhatsAppService();
        this.aiService = new OpenAIService(this.bookingService);
        this.userSessions = new Map();
        this.processedMessages = new Map();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        this.app.use(bodyParser.json());
        this.app.use((req, res, next) => {
            next();
        });
    }

    setupRoutes() {
        this.app.get('/webhook', (req, res) => {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

            if (mode === "subscribe" && token === verifyToken) {
                res.status(200).send(challenge);
            } else {
                res.sendStatus(403);
            }
        });

        this.app.post('/webhook', async (req, res) => {
            res.sendStatus(200);

            try {
                if (req.body.object === 'whatsapp_business_account') {
                    const entry = req.body.entry?.[0];
                    const changes = entry?.changes?.[0];

                    if (changes?.field === 'messages') {
                        const message = changes.value?.messages?.[0];
                        const contact = changes.value?.contacts?.[0];

                        if (message && message.type === 'text') {
                            await this.processIncomingMessage(message, contact);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Error processing webhook:', error);
            }
        });

        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'WhatsApp Business API Server',
                timestamp: new Date().toISOString(),
                version: '3.0.0',
                services: {
                    whatsapp: 'connected',
                    google_sheets: 'active',
                    openai: 'active'
                }
            });
        });

        this.app.get('/', (req, res) => {
            res.send(`
            <html>
                <head>
                    <title>🏨 Hotel Booking Chatbot</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; }
                        .card { background: #f5f5f5; padding: 20px; border-radius: 10px; }
                        .status { color: green; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h1>🏨 Hotel Booking WhatsApp Chatbot</h1>
                    <div class="card">
                        <h2>Status: <span class="status">● Online</span></h2>
                        <p>WhatsApp Business API is running and processing messages.</p>
                        <p>Employee Dashboard: <a href="http://localhost:3001">http://localhost:3001</a></p>
                        <p>Webhook URL: <code>/webhook</code></p>
                    </div>
                </body>
            </html>
            `);
        });
    }

    // Updated processIncomingMessage method in whatsapp-api-server.js
    async processIncomingMessage(message, contact) {
        try {
            const phoneNumber = message.from;
            const messageText = message.text.body;
            const contactName = contact?.profile?.name || 'Guest';

            console.log(`📥 Received message from ${phoneNumber}: "${messageText}"`);

            let cleanPhone = phoneNumber.replace(/\D/g, '');

            if (cleanPhone.length === 10) {
                cleanPhone = `91${cleanPhone}`;
            }

            // Get AI response
            const aiResponse = await this.aiService.getAIResponse(cleanPhone, messageText);

            // 🧠 Check if AI returned a booking ready signal
            if (aiResponse && aiResponse.startsWith('BOOKING_READY:')) {
                console.log('📥 Processing booking ready signal...');

                try {
                    // Extract booking details
                    const bookingJson = aiResponse.replace('BOOKING_READY:', '');
                    const bookingData = JSON.parse(bookingJson);

                    console.log('📋 Booking details:', bookingData);

                    // Add phone and create booking
                    const bookingPayload = {
                        ...bookingData,
                        customerPhone: cleanPhone,
                        source: 'whatsapp',
                        status: 'requested',
                        createdAt: new Date().toISOString()
                    };

                    const result = await this.bookingService.createBookingRequest(bookingPayload);

                    console.log('✅ Booking created:', result?.booking?.bookingId);

                    // Send confirmation
                    const confirmationMsg = `✅ *Booking Request Submitted!*\n\n📋 Request ID: *${result.booking.bookingId}*\n👤 Name: *${bookingData.customerName}*\n🏨 Room(s): *${bookingData.roomType}*\n📅 Check-in: *${bookingData.checkInDate}*\n📅 Check-out: *${bookingData.checkOutDate}*\n🌙 Nights: *${bookingData.nights}*\n👥 Guests: *${bookingData.guests}*\n\n*Important:* Our staff will call you within 30 minutes to confirm.`;

                    await this.whatsappService.sendTextMessage(phoneNumber, confirmationMsg);
                    return;

                } catch (parseError) {
                    console.error('❌ Error parsing booking data:', parseError);
                    await this.whatsappService.sendTextMessage(
                        phoneNumber,
                        "Sorry, there was an error processing your booking. Please try again."
                    );
                    return;
                }
            }

            // 🧠 Send AI reply ONLY if we got a valid response
            if (aiResponse && aiResponse.trim() !== '') {
                console.log(`📤 Sending reply to ${phoneNumber}:`, aiResponse.substring(0, 100) + '...');

                const result = await this.whatsappService.sendTextMessage(phoneNumber, aiResponse);

                if (result.success) {
                    console.log(`✅ Reply sent successfully to ${phoneNumber}`);
                } else {
                    console.error(`❌ Failed to send reply to ${phoneNumber}:`, result.error);
                }
            } else {
                console.log(`ℹ️ AI returned empty response - skipping send`);
            }

            // ... rest of existing code ...
        } catch (error) {
            console.error('❌ Error processing message:', error);
        }
    }

    shouldCreateBooking(phoneNumber, userMessage, aiReply) {
        const lowerMessage = userMessage.toLowerCase();
        const lowerAiReply = aiReply.toLowerCase();

        // User explicitly confirmed
        const confirmationKeywords = ['confirm', 'yes', 'proceed', 'book now', 'go ahead'];
        const isConfirming = confirmationKeywords.some(keyword =>
            lowerMessage.includes(keyword) && !lowerMessage.includes('not')
        );

        // AI asked for confirmation in previous message
        const userSession = this.aiService.bookingIntents.get(phoneNumber);
        const aiAskedForConfirmation = lowerAiReply.includes('type confirm') ||
            lowerAiReply.includes('please confirm') ||
            lowerAiReply.includes('proceed with booking');

        // Check if we have enough information
        const hasEnoughInfo = userSession && (
            (userSession.type === 'people_count' && userSession.selectedOption) ||
            (userSession.type === 'room_specification')
        );

        return isConfirming && aiAskedForConfirmation && hasEnoughInfo;
    }

    formatPhoneForDisplay(phone) {
        if (!phone) return 'N/A';

        const digits = phone.toString().replace(/\D/g, '');

        if (digits.length === 12 && digits.startsWith('91')) {
            return `+${digits.substring(0, 2)} ${digits.substring(2, 7)} ${digits.substring(7)}`;
        } else if (digits.length === 10) {
            return `+91 ${digits.substring(0, 5)} ${digits.substring(5)}`;
        }

        return `+${digits}`;
    }


    setupErrorHandling() {
        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('🚨 Unhandled error:', error);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    console.log(`✅ WhatsApp API Server running on port ${this.port}`);
                    console.log(`🌐 Webhook URL: http://localhost:${this.port}/webhook`);
                    resolve(this.server);
                });

                this.server.on('error', (err) => {
                    console.error('❌ Server error:', err);
                    reject(err);
                });

            } catch (error) {
                console.error('❌ Failed to start server:', error);
                reject(error);
            }
        });
    }
    async startNgrok() {
        try {
            const url = await ngrok.connect({
                addr: this.port,
                authtoken: process.env.NGROK_AUTH_TOKEN
            });

            return url;
        } catch (error) {
            console.warn('⚠️ Ngrok tunnel failed (use localhost):', error.message);
            console.log(`📡 Local webhook URL: http://localhost:${this.port}/webhook`);
            return null;
        }
    }
}

module.exports = WhatsAppAPIServer;