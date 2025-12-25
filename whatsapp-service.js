// whatsapp-service.js - Enhanced with error handling
require('dotenv').config();
const axios = require('axios');

class WhatsAppService {
    constructor() {
        this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';
        this.baseURL = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;


        // 🔍 CRITICAL: Add debug logging
        console.log('🔧 WhatsAppService DEBUG:');
        console.log('  Phone Number ID:', this.phoneNumberId);
        console.log('  API Version:', this.apiVersion);
        console.log('  Access Token exists:', !!this.accessToken);

        // Trim any whitespace that might be in .env
        this.phoneNumberId = this.phoneNumberId?.trim();
        this.apiVersion = this.apiVersion?.trim();

        this.baseURL = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
        console.log('  Constructed baseURL:', this.baseURL);
        console.log('  Example message URL:', `${this.baseURL}/messages`);


        if (!this.accessToken || !this.phoneNumberId) {
            console.error('❌ WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing in .env');
        } else {
            console.log('✅ WhatsApp Business API Service Initialized');
        }
    }

    // Method to send a text message with retry logic
    async sendTextMessage(to, text, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {

                const url = `${this.baseURL}/messages`;
                console.log(`📤 Attempt ${attempt}: Sending to URL:`, url);
                console.log(`   To: ${to}, Text: ${text.substring(0, 50)}...`);

                const response = await axios({
                    method: 'POST',
                    url: `${this.baseURL}/messages`,
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    data: {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: to,
                        type: 'text',
                        text: { body: text }
                    },
                    timeout: 10000 // 10 second timeout
                });

                console.log(`✅ Message sent to ${to}:`, response.data.messages?.[0]?.id);
                return {
                    success: true,
                    messageId: response.data.messages?.[0]?.id,
                    response: response.data
                };
            } catch (error) {
                console.error(`❌ Attempt ${attempt}/${retries} failed for ${to}:`,
                    error.response?.data || error.message);

                // Check if error is recoverable
                const errorCode = error.response?.data?.error?.code;
                const unrecoverableErrors = [100, 190, 200, 80007]; // Token, permission errors

                if (unrecoverableErrors.includes(errorCode) || attempt === retries) {
                    return {
                        success: false,
                        error: error.response?.data?.error || error.message
                    };
                }

                // Exponential backoff
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`⏳ Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return { success: false, error: 'Max retries exceeded' };
    }

    // Method to send a template message
    async sendTemplateMessage(to, templateName, languageCode = 'en_US', components = []) {
        try {
            const data = {
                messaging_product: 'whatsapp',
                to: to,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: languageCode }
                }
            };

            if (components.length > 0) {
                data.template.components = components;
            }

            const response = await axios({
                method: 'POST',
                url: `${this.baseURL}/messages`,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                data: data
            });

            console.log(`✅ Template "${templateName}" sent to ${to}`);
            return {
                success: true,
                messageId: response.data.messages[0]?.id
            };
        } catch (error) {
            console.error('❌ Error sending template:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // Get message status
    async getMessageStatus(messageId) {
        try {
            const response = await axios({
                method: 'GET',
                url: `https://graph.facebook.com/${this.apiVersion}/${messageId}`,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            return { success: true, status: response.data };
        } catch (error) {
            console.error('❌ Error getting message status:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = WhatsAppService;