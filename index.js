import baileys from '@whiskeysockets/baileys';
// O segredo está aqui: em modo ESM, precisamos acessar o objeto 'default' se ele existir
const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = baileys.default ? baileys.default : baileys;

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import express from 'express';

// --- CONFIGURAÇÃO DO SERVIDOR ---
const app = express();
const port = process.env.PORT || 10000; // Render usa a 10000 ou a variável PORT
app.get('/', (req, res) => res.send('Bot Online! 🚀'));
app.listen(port, () => console.log(`Monitorando porta ${port}`));

async function startBot() {
    try {
        // --- BANCO DE DADOS ---
        const db = await open({
            filename: 'database.db',
            driver: sqlite3.Database
        });

        await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);

        // --- CONEXÃO WHATSAPP ---
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
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
                console.log('📌 ESCANEIE O QR CODE ABAIXO:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`Conexão fechada. Reconectando: ${shouldReconnect}`);
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                console.log('✅ Bot conectado com sucesso!');
            }
        });

        // ... o resto do código (messages.upsert) continua igual ao anterior ...
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const jid = msg.key.remoteJid;
            const pushName = msg.pushName || "Usuário";
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            
            const idCanal = "120363339031174676@newsletter"; 
            const idGrupo = "F9mebHrNzLP1cOAC2NkA0Z@g.us";
            const linkCanal = "https://whatsapp.com/channel/0029Vb7mYOKIyPtXVENsy60v";

            const user = await db.get('SELECT * FROM users WHERE id = ?', [jid]);

            if (!user) {
                if (text.startsWith('/registrar')) {
                    await db.run('INSERT INTO users (id, nome) VALUES (?, ?)', [jid, pushName]);
                    await sock.sendMessage(jid, { text: `✅ Registro concluído, ${pushName}!` });
                    const logMsg = `📢 *Novo Usuário!*\n👤 Nome: ${pushName}\n🆔 ID: ${jid.split('@')[0]}`;
                    try {
                        await sock.sendMessage(idCanal, { text: logMsg });
                        await sock.sendMessage(idGrupo, { text: logMsg });
                    } catch (e) { console.log("Erro log."); }
                } else {
                    const msgReg = `Olá! Você não está registrado.\nUse */registrar*.\n🔗 Canal: ${linkCanal}`;
                    await sock.sendMessage(jid, { text: msgReg });
                }
                return;
            }

            if (text === '/oi') {
                await sock.sendMessage(jid, { text: `Olá ${user.nome}, banco de dados ativo! 🚀` });
            }
        });

    } catch (err) {
        console.error("Erro interno no startBot:", err);
    }
}

startBot();
