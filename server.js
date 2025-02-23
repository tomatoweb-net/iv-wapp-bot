const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { exec } = require('child_process');

const app = express();
const port = 3000;
let qrCodeImage = null;
let botStatus = "❌ Non Attivo";
let connectedPhone = "Nessun telefono connesso";
let proxyIp = "Proxy non rilevato";

// Configura il client WhatsApp con LocalAuth
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    }
});

// Evento: Generazione del QR Code
client.on('qr', async (qr) => {
    console.log('QR Code generato, scansiona con WhatsApp.');
    qrCodeImage = await qrcode.toDataURL(qr);
});

// Evento: Connessione avvenuta con successo
client.on('authenticated', () => {
    botStatus = "✅ Attivo";
});

// Evento: Dispositivo collegato
client.on('ready', async () => {
    botStatus = "✅ Attivo";
    console.log('Bot WhatsApp è pronto!');
    
    const me = await client.getMe();
    connectedPhone = me.id.user; // Numero di telefono collegato
});

// Evento: Disconnessione
client.on('disconnected', () => {
    botStatus = "❌ Non Attivo";
    connectedPhone = "Nessun telefono connesso";
    qrCodeImage = null;
});

// Avvia il bot
client.initialize();

// **Rotte API per la gestione del bot**

// Stato del bot
app.get('/status', (req, res) => {
    res.json({ status: botStatus, phone: connectedPhone, proxy: proxyIp });
});

// Generare QR Code nuovo
app.get('/new-qr', (req, res) => {
    client.logout();
    res.send("✅ Dispositivo scollegato! Ricarica la pagina per un nuovo QR.");
});

// Riavviare il bot
app.get('/restart-bot', (req, res) => {
    exec("sudo systemctl restart whatsapp-bot", (error, stdout, stderr) => {
        if (error) {
            res.send(`Errore: ${stderr}`);
        } else {
            res.send("✅ Bot riavviato con successo!");
        }
    });
});

// Controllare Proxy e IP
app.get('/proxy-status', (req, res) => {
    exec("curl -s ifconfig.me", (error, stdout, stderr) => {
        if (error) {
            res.send(`Errore nel recupero dell'IP`);
        } else {
            proxyIp = stdout.trim();
            res.send(`✅ Proxy attivo! IP: ${proxyIp}`);
        }
    });
});

// Pagina HTML con bottoni
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Gestione WhatsApp Bot</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; }
                h1 { color: #25D366; }
                button { padding: 10px 20px; margin: 10px; cursor: pointer; }
            </style>
        </head>
        <body>
            <h1>📲 Gestione WhatsApp Bot</h1>
            <p><strong>Stato:</strong> ${botStatus}</p>
            <p><strong>Telefono Collegato:</strong> ${connectedPhone}</p>
            <p><strong>IP Proxy:</strong> ${proxyIp}</p>

            <button onclick="location.href='/new-qr'">🔄 Scollega & Genera QR</button>
            <button onclick="location.href='/restart-bot'">🔄 Riavvia Bot</button>
            <button onclick="location.href='/proxy-status'">🌍 Controlla Proxy</button>

            ${qrCodeImage ? `<h3>Scansiona il QR per connetterti:</h3><img src="${qrCodeImage}" />` : '<p>🔲 Nessun QR Code Disponibile</p>'}
        </body>
        </html>
    `);
});

// Avvia il server Express
app.listen(port, () => {
    console.log(`🌍 Pagina di gestione attiva su http://localhost:${port}`);
});
