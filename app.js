const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const qrcodeImg = require('qrcode');
const ProxyChain = require('proxy-chain');
const axios = require('axios');
const { exec } = require('child_process');

const WEBHOOK_URL = 'https://hook.eu1.make.com/r4ydnwo7htapbbl8ihzesevwyx5pt782';
const app = express();
const port = process.env.PORT || 3000;

let qrCodeBase64 = null;
let botStatus = "❌ Non Attivo";
let connectedPhone = "Nessun telefono connesso";
let serverIp = "Non disponibile";
let proxyIp = "Non disponibile";
let clientInstance;

// **CONFIGURA IL PROXY AIRPROXY**
const PROXY_HOST = 'xxxx';
const PROXY_PORT = 'xxx';
const PROXY_USERNAME = 'xxxx';
const PROXY_PASSWORD = 'xxx';

// **CONVERSIONE PROXY SE NECESSARIO**
async function getProxyUrl() {
    const proxyUrl = `socks5://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`;
    console.log(`🌍 Proxy configurato: ${proxyUrl}`);
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

    // **Autenticazione Proxy**
    clientInstance.on('puppeteer:page', async (page) => {
        await page.authenticate({
            username: PROXY_USERNAME,
            password: PROXY_PASSWORD
        });
        console.log("🔑 Proxy autenticato con successo su Puppeteer!");
    });

    // **QR Code**
    clientInstance.on('qr', async (qr) => {
        console.log('✅ QR Code generato, scansiona con WhatsApp:');
        qrcode.generate(qr, { small: true, compact: true });
        qrCodeBase64 = await qrcodeImg.toDataURL(qr);
    });

    // **Client Pronto**
    clientInstance.on('ready', async () => {
        console.log('✅ WhatsApp client è pronto e in ascolto!');
        botStatus = "✅ Attivo";
        connectedPhone = clientInstance.info ? clientInstance.info.wid.user : "Nessun telefono connesso";
    });

    // **Autenticazione completata**
    clientInstance.on('authenticated', () => {
        console.log('✅ Autenticazione completata!');
        botStatus = "✅ Attivo";
    });

    // **Gestione disconnessione**
    clientInstance.on('disconnected', () => {
        console.error('❌ WhatsApp Disconnesso.');
        botStatus = "❌ Non Attivo";
        connectedPhone = "Nessun telefono connesso";
        qrCodeBase64 = null;
        console.log('🔄 Riavvio del client in corso...');
        setTimeout(createClient, 5000); // Riavvia dopo 5 secondi
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

            console.log('📤 Inviando alla webhook:', JSON.stringify(messageData, null, 2));

            await axios.post(WEBHOOK_URL, messageData, { maxRedirects: 5 });

        } catch (error) {
            console.error('❌ Errore invio alla webhook:', error.message);
        }
    });

    clientInstance.on('message_create', async (msg) => {
        try {
            const messageData = {
                id: msg.id._serialized,
                from: msg.from,
                to: msg.to,
                body: msg.body,
                timestamp: msg.timestamp,
                type: msg.type,
                fromMe: msg.fromMe  // Indica se il messaggio è stato inviato dal bot
            };
    
            console.log('📤 Messaggio inviato:', JSON.stringify(messageData, null, 2));
    
            await axios.post(WEBHOOK_URL, messageData, { maxRedirects: 5 });
    
        } catch (error) {
            console.error('❌ Errore invio messaggio inviato alla webhook:', error.message);
        }
    });
    

    clientInstance.initialize();
}

// **Verifica IP Server e Proxy**
app.get('/proxy-status', async (req, res) => {
    try {
        // IP Server (senza proxy)
        const serverIpResponse = await axios.get('https://ifconfig.me');
        serverIp = serverIpResponse.data.trim();

        // IP Proxy (usando il proxy)
        const proxyIpResponse = await axios.get('https://ifconfig.me', {
            proxy: {
                protocol: 'socks5',
                host: PROXY_HOST,
                port: PROXY_PORT,
                auth: {
                    username: PROXY_USERNAME,
                    password: PROXY_PASSWORD
                }
            }
        });

        proxyIp = proxyIpResponse.data.trim();
        res.json({ server_ip: serverIp, proxy_ip: proxyIp });

    } catch (error) {
        res.json({ server_ip: "Non disponibile", proxy_ip: "Non disponibile" });
    }
});

// **API per Stato del Bot**
app.get('/status', (req, res) => {
    res.json({
        status: botStatus,
        phone: connectedPhone,
        qr: qrCodeBase64
    });
});

// **API per Scollegare e Rigenerare il QR**
app.get('/new-qr', (req, res) => {
    clientInstance.logout();
    qrCodeBase64 = null;
    res.send("✅ Dispositivo scollegato! Ricarica la pagina per un nuovo QR.");
});

// **API per Riavviare il Bot**
app.get('/restart-bot', (req, res) => {
    exec("sudo systemctl restart whatsapp-bot", (error, stdout, stderr) => {
        res.send(error ? `Errore: ${stderr}` : "✅ Bot riavviato con successo!");
    });
});

// **Pagina Web di Controllo**
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Gestione WhatsApp Bot</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; }
                h1 { color: #25D366; }
                button { padding: 10px 20px; margin: 10px; cursor: pointer; }
                img { margin-top: 20px; width: 300px; }
            </style>
        </head>
        <body>
            <h1>📲 Gestione WhatsApp Bot</h1>
            <p><strong>Stato:</strong> <span id="status">Caricamento...</span></p>
            <p><strong>Telefono Collegato:</strong> <span id="phone">Caricamento...</span></p>
            <p><strong>IP Server:</strong> <span id="server-ip">Caricamento...</span></p>
            <p><strong>IP Proxy:</strong> <span id="proxy-ip">Caricamento...</span></p>

            <button onclick="location.href='/new-qr'">🔄 Scollega & Genera QR</button>
            <button onclick="location.href='/restart-bot'">🔄 Riavvia Bot</button>
            <button onclick="updateProxyStatus()">🌍 Controlla Proxy</button>

            <h3>Scansiona il QR per connetterti:</h3>
            <img id="qr-code" src="" alt="QR Code" />

            <script>
                async function updateStatus() {
                    const response = await fetch('/status');
                    const data = await response.json();
                    document.getElementById('status').textContent = data.status;
                    document.getElementById('phone').textContent = data.phone;
                    document.getElementById('qr-code').src = data.qr || '';
                }

                async function updateProxyStatus() {
                    const response = await fetch('/proxy-status');
                    const data = await response.json();
                    document.getElementById('server-ip').textContent = data.server_ip;
                    document.getElementById('proxy-ip').textContent = data.proxy_ip;
                }

                setInterval(updateStatus, 5000);
                updateStatus();
                updateProxyStatus();
            </script>
        </body>
        </html>
    `);
});

// **Avvia il Server**
app.listen(port, () => console.log(`🌐 Server Express in esecuzione su http://localhost:${port}`));

// **Avvia il Client WhatsApp**
createClient();
