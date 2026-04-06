import baileys from '@whiskeysockets/baileys';
const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = baileys.default ? baileys.default : baileys;

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pino from 'pino';
import express from 'express';
import QRCode from 'qrcode'; // Biblioteca para converter o QR em imagem

const app = express();
const port = process.env.PORT || 10000;
let qrCodeAtual = null; // Guardará o QR para mostrar no site

// --- PÁGINA DO SITE (URL do Render) ---
app.get('/', async (req, res) => {
    if (qrCodeAtual) {
        // Se houver um QR, ele gera uma imagem e exibe
        const qrImage = await QRCode.toDataURL(qrCodeAtual);
        res.send(`
            <html>
                <head><title>Conectar Bot</title></head>
                <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f0f2f5;">
                    <div style="background:white;padding:30px;border-radius:15px;box-shadow:0 4px 15px rgba(0,0,0,0.1);text-align:center;">
                        <h1 style="color:#075e54;">Escaneie o QR Code</h1>
                        <img src="${qrImage}" style="width:300px; height:300px;">
                        <p style="color:#666;">Abra o WhatsApp > Aparelhos Conectados > Conectar um aparelho</p>
                        <small>Atualize a página se o código expirar.</small>
                    </div>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
                    <h1>Bot Conectado ou Iniciando...</h1>
                    <p>Se o QR Code não aparecer em 30 segundos, o bot já deve estar logado.</p>
                </body>
            </html>
        `);
    }
});

app.listen(port, () => console.log(`Site rodando na porta ${port}`));

async function startBot() {
    try {
        const db = await open({ filename: 'database.db', driver: sqlite3.Database });
        await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);

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
                qrCodeAtual = qr; // Salva o QR para o site
                console.log('📌 QR Code disponível no link do site!');
            }

            if (connection === 'close') {
                qrCodeAtual = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                qrCodeAtual = null; // Limpa o QR ao conectar
                console.log('✅ Bot conectado com sucesso!');
            }
        });

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
        console.error("Erro interno:", err);
    }
}

startBot();
import baileys from '@whiskeysockets/baileys';
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys.default ? baileys.default : baileys;

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pino from 'pino';
import express from 'express';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 10000;
let qrCodeAtual = null;

app.get('/', async (req, res) => {
    if (qrCodeAtual) {
        const qrImage = await QRCode.toDataURL(qrCodeAtual);
        res.send(`<html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f0f2f5;"><div style="background:white;padding:30px;border-radius:15px;text-align:center;"><h1>Escaneie o QR Code</h1><img src="${qrImage}" style="width:300px;"><p>Abra o WhatsApp e escaneie</p></div></body></html>`);
    } else {
        res.send('<html><body style="text-align:center;padding-top:50px;"><h1>Bot Online ou Carregando...</h1><p>Se não carregar o QR em 1 minuto, verifique os logs do Render.</p></body></html>');
    }
});

app.listen(port, () => console.log(`🚀 Servidor Web na porta ${port}`));

async function startBot() {
    console.log("🛠️ Iniciando processo do Bot...");
    try {
        // Caminho absoluto para o banco
        const db = await open({ 
            filename: path.join(__dirname, 'database.db'), 
            driver: sqlite3.Database 
        });
        await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);
        console.log("📂 Banco de dados pronto.");

        // Caminho absoluto para a autenticação
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
        const { version } = await fetchLatestBaileysVersion();
        
        console.log("🌐 Conectando ao WhatsApp...");
        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true // Vamos ativar no terminal também por segurança
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                qrCodeAtual = qr;
                console.log('📌 NOVO QR CODE GERADO!');
            }
            if (connection === 'close') {
                qrCodeAtual = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`❌ Conexão fechada: ${statusCode}`);
                if (statusCode !== DisconnectReason.loggedOut) startBot();
            } else if (connection === 'open') {
                qrCodeAtual = null;
                console.log('✅ BOT CONECTADO!');
            }
        });

        // Seu código de mensagens...
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
                    await sock.sendMessage(jid, { text: `✅ Registrado, ${pushName}!` });
                }
                return;
            }
            if (text === '/oi') await sock.sendMessage(jid, { text: `Olá ${user.nome}!` });
        });

    } catch (err) {
        console.error("💥 ERRO FATAL NO BOT:", err);
    }
}

startBot();
