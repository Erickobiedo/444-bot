import baileys from '@whiskeysockets/baileys';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pino from 'pino';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extração segura das funções (evita o erro de "já declarado")
const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = baileys.default ? baileys.default : baileys;

const app = express();
app.use(express.urlencoded({ extended: true }));
const port = process.env.PORT || 10000;

let pairingCode = null;
let sock = null;
let db = null;

// --- SITE PARA O USUÁRIO ---
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>Painel de Conexão</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="font-family:sans-serif; background:#f0f2f5; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
                <div style="background:white; padding:30px; border-radius:15px; box-shadow:0 4px 15px rgba(0,0,0,0.1); text-align:center; width:90%; max-width:400px;">
                    <h2 style="color:#075e54;">Vincular Número</h2>
                    ${pairingCode ? `
                        <p>Digite este código no seu WhatsApp:</p>
                        <div style="background:#e7fce3; color:#075e54; font-size:35px; font-weight:bold; padding:20px; margin:20px 0; border-radius:10px; border:2px dashed #25d366; letter-spacing:5px;">${pairingCode}</div>
                        <button onclick="location.href='/'" style="width:100%; padding:12px; background:#666; color:white; border:none; border-radius:8px; cursor:pointer;">Gerar para outro número</button>
                    ` : `
                        <form action="/gerar-codigo" method="POST">
                            <input type="text" name="numero" placeholder="Ex: 555194583978" required style="width:100%; padding:12px; margin:10px 0; border:1px solid #ccc; border-radius:8px; font-size:16px;">
                            <button type="submit" style="width:100%; padding:12px; background:#25d366; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">GERAR CÓDIGO</button>
                        </form>
                    `}
                </div>
            </body>
        </html>
    `);
});

// --- ROTA DE GERAÇÃO ---
app.post('/gerar-codigo', async (req, res) => {
    const num = req.body.numero.replace(/\D/g, '');
    if (!num) return res.send("Número inválido.");

    try {
        if (!sock || sock.authState.creds.registered) {
            return res.send("Bot já conectado ou não carregado. Limpe a pasta auth_info.");
        }
        // Solicita e aguarda o código do WhatsApp
        const code = await sock.requestPairingCode(num);
        pairingCode = code?.toUpperCase();
        res.redirect('/');
    } catch (e) {
        res.send("Erro: " + e.message);
    }
});

app.listen(port, () => console.log(`🚀 Servidor na porta ${port}`));

async function startBot() {
    try {
        db = await open({ filename: path.join(__dirname, 'database.db'), driver: sqlite3.Database });
        await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);

        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
        const { version } = await fetchLatestBaileysVersion();
        
        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.0"] // Necessário para pareamento por código
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                pairingCode = "CONECTADO!";
                console.log('✅ Conectado!');
            }
        });

        // --- SISTEMA DE REGISTRO ---
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const jid = msg.key.remoteJid;
            const pushName = msg.pushName || "Usuário";
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

            const user = await db.get('SELECT * FROM users WHERE id = ?', [jid]);

            if (!user) {
                if (text.startsWith('/registrar')) {
                    await db.run('INSERT INTO users (id, nome) VALUES (?, ?)', [jid, pushName]);
                    await sock.sendMessage(jid, { text: `✅ Registro concluído, ${pushName}!` });
                    const logMsg = `📢 *Novo Usuário!*\n👤 Nome: ${pushName}\n🆔 ID: ${jid.split('@')[0]}`;
                    await sock.sendMessage("120363339031174676@newsletter", { text: logMsg }).catch(() => {});
                    await sock.sendMessage("F9mebHrNzLP1cOAC2NkA0Z@g.us", { text: logMsg }).catch(() => {});
                } else {
                    await sock.sendMessage(jid, { text: `❌ Use */registrar* para se cadastrar.` });
                }
                return;
            }
            if (text === '/oi') await sock.sendMessage(jid, { text: `Olá ${user.nome}!` });
        });
    } catch (err) { console.error(err); }
}

startBot();
