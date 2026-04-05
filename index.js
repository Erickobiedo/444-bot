const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const pino = require('pino');
const qrcode = require('qrcode-terminal'); // Biblioteca para desenhar o QR

async function startBot() {
    // --- CONFIGURAÇÃO DO BANCO DE DADOS ---
    const db = await open({
        filename: 'database.db', // Corrigido para database.db
        driver: sqlite3.Database
    });

    await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT)`);

    // --- CONEXÃO WHATSAPP ---
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false // Desativamos o antigo para usar o novo manual
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Se houver um QR Code, ele desenha no terminal
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

        // 1. Verificar se o usuário já está registrado
        const user = await db.get('SELECT * FROM users WHERE id = ?', [jid]);

        if (!user) {
            if (text.startsWith('/registrar')) {
                await db.run('INSERT INTO users (id, nome) VALUES (?, ?)', [jid, pushName]);
                await sock.sendMessage(jid, { text: `✅ Registro concluído, ${pushName}!` });

                const logMsg = `📢 *Novo Usuário Registrado!*\n\n👤 Nome: ${pushName}\n🆔 ID: ${jid.split('@')[0]}`;
                
                // Envia para o Canal e para o Grupo (O Bot precisa ser ADM)
                try {
                    await sock.sendMessage(idCanal, { text: logMsg });
                    await sock.sendMessage(idGrupo, { text: logMsg });
                } catch (e) {
                    console.log("Erro ao enviar log para canal/grupo. Verifique se o bot é ADM.");
                }

            } else {
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
}

startBot();
