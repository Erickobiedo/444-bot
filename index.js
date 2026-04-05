const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const pino = require('pino');

async function startBot() {
    // --- CONFIGURAÇÃO DO BANCO DE DADOS ---
    const db = await open({
        filename: '.database.db',
        driver: sqlite3.Database
    });

    await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);

    // --- CONEXÃO WHATSAPP ---
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        const pushName = msg.pushName || "Usuário";
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        
        // --- CONFIGURAÇÕES QUE VOCÊ PASSOU ---
        const idCanal = "120363339031174676@newsletter"; 
        const idGrupo = "F9mebHrNzLP1cOAC2NkA0Z@g.us";
        const linkCanal = "https://whatsapp.com/channel/0029Vb7mYOKIyPtXVENsy60v";

        // 1. Verificar se o usuário já está registrado
        const user = await db.get('SELECT * FROM users WHERE id = ?', [jid]);

        if (!user) {
            if (text.startsWith('/registrar')) {
                // REGISTRAR O USUÁRIO NO BANCO .DB
                await db.run('INSERT INTO users (id, nome) VALUES (?, ?)', [jid, pushName]);
                await sock.sendMessage(jid, { text: `✅ Registro concluído, ${pushName}!` });

                // NOTIFICAÇÃO DE REGISTRO (Envia para o Canal e para o Grupo)
                const logMsg = `📢 *Novo Usuário Registrado!*\n\n👤 Nome: ${pushName}\n🆔 ID: ${jid.split('@')[0]}`;
                
                await sock.sendMessage(idCanal, { text: logMsg });
                await sock.sendMessage(idGrupo, { text: logMsg });

            } else {
                // PEDIR REGISTRO (Se não for registrado e mandar qualquer outra coisa)
                const mensagemRegistro = `Olá! Você ainda não está registrado.\n\nUse o comando */registrar* para eu lhe responder.\n\n🔗 *Siga nosso canal:* ${linkCanal}`;
                await sock.sendMessage(jid, { text: mensagemRegistro });
            }
            return;
        }

        // 2. COMANDOS PARA QUEM JÁ É REGISTRADO
        if (text === '/oi') {
            await sock.sendMessage(jid, { text: `Olá ${user.nome}, sua verificação no banco de dados está ativa! 🚀` });
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot conectado e monitorando registros!');
        }
    });
}

startBot();