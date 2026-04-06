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

// --- INTERFACE WEB PARA VER O CÓDIGO ---
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Conectar Bot</title>
                <meta http-equiv="refresh" content="5">
            </head>
            <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f0f2f5;margin:0;">
                <div style="background:white;padding:40px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center;max-width:450px;">
                    <h1 style="color:#075e54;margin-bottom:10px;">Conectar WhatsApp</h1>
                    <p style="color:#666;">O código aparecerá abaixo em instantes.</p>
                    <div style="background:#e7fce3; color:#25d366; font-size:40px; font-weight:bold; letter-spacing:5px; padding:20px; border-radius:10px; margin:20px 0; border: 2px dashed #25d366;">
                        ${pairingCode}
                    </div>
                    <div style="text-align:left; font-size:14px; color:#555; background:#f9f9f9; padding:15px; border-radius:10px;">
                        <b>Como conectar:</b><br>
                        1. No WhatsApp, vá em <b>Aparelhos Conectados</b>.<br>
                        2. Clique em <b>Conectar um aparelho</b>.<br>
                        3. Clique em <b>"Conectar com número de telefone"</b>.<br>
                        4. Digite o código acima.
                    </div>
                </div>
            </body>
        </html>
    `);
});

app.listen(port, () => console.log(`🚀 Servidor online na porta ${port}`));

async function startBot() {
    try {
        // --- CONFIGURAÇÃO DO BANCO DE DADOS ---
        const db = await open({ 
            filename: path.join(__dirname, 'database.db'), 
            driver: sqlite3.Database 
        });
        await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);

        // --- AUTENTICAÇÃO ---
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.0"] 
        });

        // --- SOLICITAR CÓDIGO DE PAREAMENTO ---
        if (!sock.authState.creds.registered) {
            const phoneNumber = "5551994583978"; 
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
                    pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    console.log(`✅ CÓDIGO GERADO: ${pairingCode}`);
                } catch (e) {
                    console.error("Erro ao gerar código:", e);
                    pairingCode = "ERRO: Tente Reiniciar";
                }
            }, 10000); // 10 segundos para garantir estabilidade
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                pairingCode = "CONECTADO!";
                console.log('✅ Bot conectado com sucesso!');
            }
        });

        // --- LÓGICA DE MENSAGENS E REGISTRO ---
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const jid = msg.key.remoteJid;
            const pushName = msg.pushName || "Usuário";
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            
            // IDs de Log (Canais/Grupos)
            const idCanal = "120363339031174676@newsletter"; 
            const idGrupo = "F9mebHrNzLP1cOAC2NkA0Z@g.us";

            // Verifica se o usuário já existe no banco
            const user = await db.get('SELECT * FROM users WHERE id = ?', [jid]);

            // Se não estiver registrado
            if (!user) {
                if (text.startsWith('/registrar')) {
                    await db.run('INSERT INTO users (id, nome) VALUES (?, ?)', [jid, pushName]);
                    await sock.sendMessage(jid, { text: `✅ Olá ${pushName}, seu registro foi concluído com sucesso!` });
                    
                    // Envia log para o canal e grupo
                    const logMsg = `📢 *Novo Usuário Registrado!*\n\n👤 *Nome:* ${pushName}\n🆔 *ID:* ${jid.split('@')[0]}`;
                    try {
                        await sock.sendMessage(idCanal, { text: logMsg });
                        await sock.sendMessage(idGrupo, { text: logMsg });
                    } catch (e) { console.log("Erro ao enviar logs."); }
                } else {
                    await sock.sendMessage(jid, { text: `❌ Você ainda não tem registro.\n\nDigite */registrar* para começar.` });
                }
                return;
            }

            // Comandos para usuários registrados
            if (text === '/oi') {
                await sock.sendMessage(jid, { text: `Olá ${user.nome}! Você já está registrado em nosso sistema. 🚀` });
            }
        });

    } catch (err) {
        console.error("ERRO FATAL:", err);
    }
}

startBot();
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
app.use(express.urlencoded({ extended: true })); // Para ler o número enviado pelo site
const port = process.env.PORT || 10000;

let pairingCode = null;
let sock = null;
let db = null;

// --- INTERFACE WEB DINÂMICA ---
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Painel do Bot</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; width: 90%; max-width: 400px; }
                    input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ccc; border-radius: 8px; font-size: 16px; box-sizing: border-box; }
                    button { width: 100%; padding: 12px; background: #25d366; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: bold; }
                    .code { background: #e7fce3; color: #075e54; font-size: 32px; font-weight: bold; padding: 15px; margin: 20px 0; border-radius: 10px; border: 2px dashed #25d366; letter-spacing: 4px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2 style="color: #075e54;">Conectar WhatsApp</h2>
                    ${pairingCode ? `
                        <p>Digite este código no seu WhatsApp:</p>
                        <div class="code">${pairingCode}</div>
                        <button onclick="location.href='/'" style="background:#666;">Gerar para outro número</button>
                    ` : `
                        <p>Digite seu número com DDD (ex: 555194583978)</p>
                        <form action="/gerar-codigo" method="POST">
                            <input type="text" name="numero" placeholder="55519xxxxxxx" required>
                            <button type="submit">Gerar Código de Pareamento</button>
                        </form>
                    `}
                </div>
            </body>
        </html>
    `);
});

// --- ROTA PARA GERAR O CÓDIGO ---
app.post('/gerar-codigo', async (req, res) => {
    const numero = req.body.numero.replace(/\D/g, '');
    if (!numero) return res.redirect('/');

    try {
        if (sock && !sock.authState.creds.registered) {
            let code = await sock.requestPairingCode(numero);
            pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
            pairingCode = pairingCode.toUpperCase();
        } else {
            pairingCode = "ERRO: O Bot já está conectado ou iniciando.";
        }
    } catch (e) {
        pairingCode = "ERRO: " + e.message;
    }
    res.redirect('/');
});

app.listen(port, () => console.log(`🚀 Painel online na porta ${port}`));

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
            browser: ["Ubuntu", "Chrome", "20.0.0"] 
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                console.log('✅ Bot conectado!');
                pairingCode = "CONECTADO!";
            }
        });

        // --- COMANDO DE REGISTRO ---
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const jid = msg.key.remoteJid;
            const pushName = msg.pushName || "Usuário";
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            
            const idCanal = "120363339031174676@newsletter"; 
            const idGrupo = "F9mebHrNzLP1cOAC2NkA0Z@g.us";

            const user = await db.get('SELECT * FROM users WHERE id = ?', [jid]);

            if (!user) {
                if (text.startsWith('/registrar')) {
                    await db.run('INSERT INTO users (id, nome) VALUES (?, ?)', [jid, pushName]);
                    await sock.sendMessage(jid, { text: `✅ ${pushName}, registro concluído!` });
                    
                    const logMsg = `📢 *Novo Usuário!*\n👤 Nome: ${pushName}\n🆔 ID: ${jid.split('@')[0]}`;
                    try {
                        await sock.sendMessage(idCanal, { text: logMsg });
                        await sock.sendMessage(idGrupo, { text: logMsg });
                    } catch (e) {}
                } else {
                    await sock.sendMessage(jid, { text: `❌ Use */registrar* para se cadastrar.` });
                }
                return;
            }

            if (text === '/oi') await sock.sendMessage(jid, { text: `Olá ${user.nome}! Banco de dados OK.` });
        });

    } catch (err) {
        console.error("Erro:", err);
    }
}

startBot();
