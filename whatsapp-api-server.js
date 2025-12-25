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

    async processIncomingMessage(message, contact) {
        try {
            const phoneNumber = message.from;
            const messageText = message.text.body;
            const messageId = message.id;
            const contactName = contact?.profile?.name || 'Guest';
            let cleanPhone = phoneNumber.replace(/\D/g, '');

            if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
                cleanPhone = cleanPhone;
            } else if (cleanPhone.length === 10) {
                cleanPhone = `91${cleanPhone}`;
            } else if (cleanPhone.startsWith('975') && cleanPhone.length === 11) {
                cleanPhone = cleanPhone;
            }
            const aiResponse = await this.aiService.getAIResponse(cleanPhone, messageText);

            if (aiResponse && aiResponse.trim()) {
                const sendResult = await this.whatsappService.sendTextMessage(phoneNumber, aiResponse);

                if (sendResult.success) {
                    console.log(`✅ Response sent to ${phoneNumber}`);
                } else {
                    console.error(`❌ Failed to send to ${phoneNumber}:`, sendResult.error);
                }
            } else {
                console.error(`❌ Empty AI response for ${phoneNumber}`);
                // Send fallback message
                await this.whatsappService.sendTextMessage(
                    phoneNumber,
                    "I apologize, but I couldn't generate a response. Please try rephrasing your question."
                );
            }

        } catch (error) {
            console.error('❌ Error processing message:', error);

            // Try to send error message
            try {
                await this.whatsappService.sendTextMessage(
                    message.from,
                    "Sorry, I'm experiencing technical difficulties. Our team has been notified."
                );
            } catch (sendError) {
                console.error('❌ Also failed to send error message:', sendError);
            }
        }
    }

    setupErrorHandling() {
        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('🚨 Unhandled error:', error);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    async start() {
        try {
            // Start Express server
            this.server = this.app.listen(this.port, () => {
                console.log(`✅ WhatsApp API Server running on port ${this.port}`);
            });


        } catch (error) {
            console.error('❌ Failed to start server:', error);
            process.exit(1);
        }
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