const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

let sock = null;
let qrBase64 = null;
let statusConexao = 'desconectado'; // desconectado | aguardando_qr | conectado
let isInitializing = false;

const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, '../auth_info');

async function initBaileys() {
  if (isInitializing) return;
  isInitializing = true;

  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['Campanha Zap Avisos', 'Chrome', '1.0.0'],
      // Adicionando algumas opções para melhor estabilidade no Render
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        statusConexao = 'aguardando_qr';
        qrBase64 = await QRCode.toDataURL(qr);
        console.log('QR Code gerado — acesse /api/whatsapp/qr ou a interface web');
      }

      if (connection === 'open') {
        statusConexao = 'conectado';
        qrBase64 = null;
        console.log('WhatsApp conectado com sucesso!');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`Conexão fechada. Motivo: ${statusCode}. Reconectar: ${shouldReconnect}`);

        if (shouldReconnect) {
          statusConexao = 'desconectado';
          // Limpa o socket atual antes de tentar reconectar
          if (sock) {
            sock.ev.removeAllListeners();
            sock = null;
          }
          isInitializing = false;
          setTimeout(initBaileys, 3000);
        } else {
          console.log('Sessão encerrada (Logout). Limpando dados...');
          statusConexao = 'desconectado';
          qrBase64 = null;
          if (sock) {
            sock.ev.removeAllListeners();
            sock = null;
          }
          if (fs.existsSync(AUTH_DIR)) {
            try {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            } catch (err) {
              console.error('Erro ao remover pasta de autenticação:', err);
            }
          }
          isInitializing = false;
          // Após o logout, reinicia para gerar um novo QR Code
          setTimeout(initBaileys, 2000);
        }
      }
    });
  } catch (error) {
    console.error('Erro ao inicializar Baileys:', error);
    isInitializing = false;
    setTimeout(initBaileys, 5000);
  }
}

function formatarNumero(telefone) {
  const digitos = telefone.replace(/\D/g, '');
  return `${digitos}@s.whatsapp.net`;
}

async function sendMessage(telefone, texto) {
  if (!sock || statusConexao !== 'conectado') {
    throw new Error('WhatsApp não está conectado.');
  }
  const jid = formatarNumero(telefone);
  await sock.sendMessage(jid, { text: texto });
}

function getStatus() {
  return { status: statusConexao };
}

function getQR() {
  return qrBase64;
}

async function desconectar() {
  console.log('Solicitação de desconexão recebida...');
  try {
    if (sock) {
      // O logout do Baileys já deve acionar o evento 'connection.update' com close e loggedOut
      await sock.logout().catch(e => console.log('Erro no logout:', e.message));
      // Não precisamos fazer muito aqui, pois o evento 'connection.update' cuidará da limpeza
    } else {
      // Se não houver socket mas a pasta existir, limpamos manualmente
      statusConexao = 'desconectado';
      qrBase64 = null;
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      isInitializing = false;
      setTimeout(initBaileys, 1000);
    }
  } catch (err) {
    console.error('Erro ao desconectar:', err);
  }
}

module.exports = { initBaileys, sendMessage, getStatus, getQR, desconectar };
