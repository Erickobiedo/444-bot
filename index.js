import baileys from '@whiskeysockets/baileys';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pino from 'pino';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = baileys.default ? baileys.default : baileys;

const app = express();
const port = process.env.PORT || 10000;
let pairingCode = "GERANDO...";

// SITE PARA VER O CÓDIGO DE PAREAMENTO
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>Conectar Bot</title></head>
            <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f0f2f5;margin:0;">
                <div style="background:white;padding:40px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center;max-width:400px;">
                    <h1 style="color:#075e54;margin-bottom:10px;">Código de Conexão</h1>
                    <p style="color:#666;">Copie o código abaixo e insira no seu WhatsApp</p>
                    <div style="background:#e7fce3; color:#25d366; font-size:45px; font-weight:bold; letter-spacing:8px; padding:20px; border-radius:10px; margin:20px 0; border: 2px dashed #25d366;">
                        ${pairingCode}
                    </div>
                    <div style="text-align:left; font-size:14px; color:#555; background:#f9f9f9; padding:15px; border-radius:10px;">
                        <b>Passo a passo:</b><br>
                        1. Abra o WhatsApp no seu celular.<br>
                        2. Vá em <b>Aparelhos Conectados</b>.<br>
                        3. Clique em <b>Conectar um aparelho</b>.<br>
                        4. Clique em <b>"Conectar com número de telefone"</b> na parte inferior.<br>
                        5. Digite o código acima.
                    </div>
                </div>
            </body>
        </html>
    `);
});

app.listen(port, () => console.log(`🚀 Servidor na porta ${port}`));

async function startBot() {
    try {
        const db = await open({ 
            filename: path.join(__dirname, 'database.db'), 
            driver: sqlite3.Database 
        });
        await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);

        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            // Necessário para o código de pareamento funcionar bem
            browser: ["Ubuntu", "Chrome", "20.0.0"] 
        });

        // LÓGICA DO CÓDIGO DE PAREAMENTO
        if (!sock.authState.creds.registered) {
            const phoneNumber = "555194583978"; 
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(phoneNumber);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    pairingCode = code.toUpperCase();
                    console.log(`✅ CÓDIGO GERADO: ${pairingCode}`);
                } catch (e) {
                    console.error("Erro ao solicitar código:", e);
                    pairingCode = "ERRO AO GERAR";
                }
            }, 3000); // Aguarda o socket iniciar
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                pairingCode = "RECONECTANDO...";
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                pairingCode = "CONECTADO!";
                console.log('✅ Bot conectado com sucesso!');
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const jid = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            
            if (text === '/oi') {
                await sock.sendMessage(jid, { text: 'Bot ativo e respondendo via código! 🚀' });
            }
        });

    } catch (err) {
        console.error("ERRO NO BOT:", err);
    }
}

startBot();
