import baileys from '@whiskeysockets/baileys';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pino from 'pino';
import express from 'express';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

// CONFIGURAÇÃO DE CAMINHOS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// EXTRAÇÃO DAS FUNÇÕES DO BAILEYS
const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = baileys.default ? baileys.default : baileys;

const app = express();
const port = process.env.PORT || 10000;
let qrCodeAtual = null;

// SITE PARA VER O QR CODE
app.get('/', async (req, res) => {
    if (qrCodeAtual) {
        const qrImage = await QRCode.toDataURL(qrCodeAtual);
        res.send(`
            <html>
                <head><title>Conectar Bot</title></head>
                <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f0f2f5;">
                    <div style="background:white;padding:30px;border-radius:15px;box-shadow:0 4px 15px rgba(0,0,0,0.1);text-align:center;">
                        <h1 style="color:#075e54;">Escaneie o QR Code</h1>
                        <img src="${qrImage}" style="width:300px; height:300px;">
                        <p style="color:#666;">Abra o WhatsApp > Aparelhos Conectados > Conectar</p>
                    </div>
                </body>
            </html>
        `);
    } else {
        res.send('<h1>Bot Conectado ou Carregando...</h1><p>Se o QR não aparecer em 1 minuto, verifique os logs.</p>');
    }
});

app.listen(port, () => console.log(`🚀 Servidor na porta ${port}`));

async function startBot() {
    try {
        // BANCO DE DADOS
        const db = await open({ 
            filename: path.join(__dirname, 'database.db'), 
            driver: sqlite3.Database 
        });
        await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);

        // AUTENTICAÇÃO
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                qrCodeAtual = qr;
                console.log('📌 QR Code disponível no link!');
            }
            if (connection === 'close') {
                qrCodeAtual = null;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                qrCodeAtual = null;
                console.log('✅ Conectado com sucesso!');
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const jid = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            
            if (text === '/oi') {
                await sock.sendMessage(jid, { text: 'Bot ativo e respondendo! 🚀' });
            }
        });

    } catch (err) {
        console.error("ERRO NO BOT:", err);
    }
}

startBot();
