require('dotenv').config();
const crypto = require('crypto');

class WebhookVerifier {
    constructor() {
        this.verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
        this.appSecret = process.env.FACEBOOK_APP_SECRET;
    }

    verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (mode && token) {
            if (mode === 'subscribe' && token === this.verifyToken) {
                res.status(200).send(challenge);
            } else {
                res.sendStatus(403);
            }
        } else {
            res.sendStatus(400);
        }
    }

    verifySignature(req, body) {
        const signature = req.headers['x-hub-signature-256'];

        if (!signature) {
            return false;
        }

        if (!this.appSecret) {
            return true; // Allow if not configured (dev mode)
        }

        const elements = signature.split('=');
        const signatureHash = elements[1];

        try {
            const expectedHash = crypto
                .createHmac('sha256', this.appSecret)
                .update(body)
                .digest('hex');

            const isSignatureValid = crypto.timingSafeEqual(
                Buffer.from(signatureHash, 'hex'),
                Buffer.from(expectedHash, 'hex')
            );

            if (!isSignatureValid) {
                console.error('❌ Webhook signature verification failed');
            }

            return isSignatureValid;
        } catch (error) {
            console.error('❌ Error verifying signature:', error);
            return false;
        }
    }
    logWebhookRequest(req, body) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            headers: {
                'user-agent': req.headers['user-agent'],
                'content-type': req.headers['content-type'],
                'x-hub-signature': req.headers['x-hub-signature-256'] ? 'present' : 'missing'
            },
            query: req.query,
            bodySize: body.length,
            ip: req.ip || req.connection.remoteAddress
        };
        return logEntry;
    }
}

module.exports = WebhookVerifier;