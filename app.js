const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const ProxyChain = require('proxy-chain');
const axios = require('axios');

const WEBHOOK_URL = 'https://hook.eu1.make.com/r4ydnwo7htapbbl8ihzesevwyx5pt782';
const app = express();
const port = process.env.PORT || 3000;

let qrCodeGenerated = false; // Flag per evitare rigenerazione continua
let clientInstance; // Per mantenere il client attivo

// **CONFIGURA IL PROXY AIRPROXY**
const PROXY_HOST = 's6.airproxy.io';
const PROXY_PORT = '20706';
const PROXY_USERNAME = 'comunicapervincere';
const PROXY_PASSWORD = 'comunicapervincere';

// **CONVERSIONE PROXY SE NECESSARIO**
async function getProxyUrl() {
    const proxyUrl = `socks5://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`;
    return await ProxyChain.anonymizeProxy(proxyUrl);
}

// **CREA IL CLIENT WHATSAPP**
async function createClient() {
    const proxyUrl = await getProxyUrl();

    clientInstance = new Client({
        authStrategy: new LocalAuth({ clientId: "whatsapp-24h" }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                `--proxy-server=${proxyUrl}`
            ]
        }
    });

    // **Autenticazione Manuale del Proxy**
    clientInstance.on('puppeteer:page', async (page) => {
        await page.authenticate({
            username: PROXY_USERNAME,
            password: PROXY_PASSWORD
        });
    });

    // **QR Code: Genera solo se necessario**
    clientInstance.on('qr', (qr) => {
        if (!qrCodeGenerated) {
            console.log('✅ QR Code generato, scansiona con WhatsApp:');
            qrcode.generate(qr, { small: true, compact: true });
            qrCodeGenerated = true;
        }
    });

    // **Client Pronto**
    clientInstance.on('ready', () => {
        console.log('✅ WhatsApp client è pronto e in ascolto!');
        qrCodeGenerated = true;
    });

    // **Autenticato con successo**
    clientInstance.on('authenticated', () => {
        console.log('✅ Autenticazione completata!');
    });

    // **Messaggi in Arrivo → Webhook**
    clientInstance.on('message', async (msg) => {
        try {
            const messageData = {
                id: msg.id._serialized,
                from: msg.from,
                body: msg.body,
                timestamp: msg.timestamp,
                type: msg.type
            };

            console.log('📩 Messaggio ricevuto:', messageData);
            await axios.post(WEBHOOK_URL, messageData);
        } catch (error) {
            console.error('❌ Errore invio messaggio in arrivo:', error);
        }
    });

    // **Messaggi Inviati → Webhook**
    clientInstance.on('message_create', async (msg) => {
        if (msg.fromMe) {
            try {
                const messageData = {
                    id: msg.id._serialized,
                    to: msg.to,
                    body: msg.body,
                    timestamp: msg.timestamp,
                    type: msg.type
                };

                console.log('📤 Messaggio inviato:', messageData);
                await axios.post(WEBHOOK_URL, messageData);
            } catch (error) {
                console.error('❌ Errore invio messaggio in uscita:', error);
            }
        }
    });

    // **Gestione della disconnessione e riconnessione**
    clientInstance.on('disconnected', (reason) => {
        console.error('❌ WhatsApp Disconnesso:', reason);
        qrCodeGenerated = false;
        console.log('🔄 Riavvio del client in corso...');
        setTimeout(createClient, 5000); // Riavvia il client dopo 5 secondi
    });

    clientInstance.initialize();
}

// **Server Express per QR Code e Stato del Bot**
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>WhatsApp Bot - QR Code</title>
            <meta http-equiv="refresh" content="5">
            <style>
                body { text-align: center; font-family: Arial, sans-serif; }
                h1 { color: #25D366; }
            </style>
        </head>
        <body>
            <h1>Scansiona il QR Code</h1>
            ${qrCodeGenerated ? '<p>✅ WhatsApp connesso!</p>' : '<p>🔄 In attesa di connessione...</p>'}
        </body>
        </html>
    `);
});

// **Endpoint per controllare lo stato del bot**
app.get('/status', (req, res) => {
    if (qrCodeGenerated) {
        res.json({ status: "CONNECTED", message: "Il bot è attivo e funzionante!" });
    } else {
        res.json({ status: "DISCONNECTED", message: "Il bot è disconnesso o in attesa di connessione." });
    }
});

// **Avvia il Server Express**
app.listen(port, () => {
    console.log(`🌐 Server Express in esecuzione su http://localhost:${port}`);
});

// **Avvia il Client WhatsApp**
createClient();
