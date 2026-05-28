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

const AUTH_DIR = path.join(__dirname, '../auth_info');

async function initBaileys() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Campanha Zap Avisos', 'Chrome', '1.0.0'],
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
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log('Reconectando...');
        statusConexao = 'desconectado';
        setTimeout(initBaileys, 3000);
      } else {
        console.log('Sessão encerrada. Remova a pasta auth_info e reinicie.');
        statusConexao = 'desconectado';
        qrBase64 = null;
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
    }
  });
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

module.exports = { initBaileys, sendMessage, getStatus, getQR, desconectar };

async function desconectar() {
  try {
    if (sock) {
      await sock.logout();
      sock = null;
    }
  } catch (_) {}
  statusConexao = 'desconectado';
  qrBase64 = null;
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
  setTimeout(initBaileys, 1000);
}