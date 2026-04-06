const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');

// --- CONFIGURAÇÃO DO SERVIDOR PARA O RENDER ---
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot Online! 🚀'));
app.listen(port, () => console.log(`Monitorando porta ${port}`));

async function startBot() {
    // --- BANCO DE DADOS ---
    const db = await open({
        filename: 'database.db',
        driver: sqlite3.Database
    });

    await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);

    // --- CONEXÃO WHATSAPP ---
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📌 ESCANEIE O QR CODE ABAIXO PARA CONECTAR:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Reconectando:', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot conectado e monitorando registros!');
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

                const logMsg = `📢 *Novo Usuário Registrado!*\n\n👤 Nome: ${pushName}\n🆔 ID: ${jid.split('@')[0]}`;
                
                try {
                    await sock.sendMessage(idCanal, { text: logMsg });
                    await sock.sendMessage(idGrupo, { text: logMsg });
                } catch (e) {
                    console.log("Erro ao enviar log. Verifique se o bot é ADM.");
                }

            } else {
                const mensagemRegistro = `Olá! Você ainda não está registrado.\n\nUse o comando */registrar* para eu lhe responder.\n\n🔗 *Siga nosso canal:* ${linkCanal}`;
                await sock.sendMessage(jid, { text: mensagemRegistro });
            }
            return;
        }

        if (text === '/oi') {
            await sock.sendMessage(jid, { text: `Olá ${user.nome}, sua verificação no banco de dados está ativa! 🚀` });
        }
    });
}

startBot();
