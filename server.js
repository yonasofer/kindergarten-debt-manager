const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

// Load .env if present
try { require('dotenv').config(); } catch (e) { }

const app = express();
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ============ SMTP TRANSPORTER ============
let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        return null;
    }

    transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });

    return transporter;
}

// ============ SEND EMAIL ENDPOINT ============
app.post('/api/send-email', async (req, res) => {
    try {
        const { to, subject, body } = req.body;

        // Use ADMIN_EMAIL from env as default recipient, fallback to request body
        const recipient = process.env.ADMIN_EMAIL || to;

        if (!recipient || !subject || !body) {
            return res.status(400).json({ error: 'Missing recipient, subject, or body' });
        }

        const smtp = getTransporter();
        if (!smtp) {
            return res.status(500).json({
                error: 'SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in environment variables.'
            });
        }

        const from = process.env.SMTP_USER;

        await smtp.sendMail({
            from: `"מערכת ניהול חובות" <${from}>`,
            to: recipient,
            subject,
            text: body,
            html: body.replace(/\n/g, '<br>')
        });

        console.log(`✉️  Email sent to ${recipient}: ${subject}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Email error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    const smtp = getTransporter();
    res.json({
        status: 'ok',
        smtp: smtp ? 'configured' : 'not configured',
        adminEmail: process.env.ADMIN_EMAIL ? 'set' : 'not set'
    });
});

// ============ START (local dev only) ============
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🏫 Kindergarten Debt Manager running at http://localhost:${PORT}`);

        const smtp = getTransporter();
        if (smtp) {
            console.log(`✉️  SMTP configured (${process.env.SMTP_HOST})`);
        } else {
            console.log('⚠️  SMTP not configured — email sending disabled');
            console.log('   Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env file');
        }

        if (process.env.ADMIN_EMAIL) {
            console.log(`📧  Admin email: ${process.env.ADMIN_EMAIL}`);
        } else {
            console.log('⚠️  ADMIN_EMAIL not set — emails will use client-provided address');
        }
    });
}

// Export for Vercel serverless
module.exports = app;
