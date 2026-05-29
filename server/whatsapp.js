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
      }

      if (connection === 'open') {
        statusConexao = 'conectado';
        qrBase64 = null;
        console.log('WhatsApp conectado com sucesso!');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          statusConexao = 'desconectado';
          if (sock) {
            sock.ev.removeAllListeners();
            sock = null;
          }
          isInitializing = false;
          setTimeout(initBaileys, 3000);
        } else {
          statusConexao = 'desconectado';
          qrBase64 = null;
          if (sock) {
            sock.ev.removeAllListeners();
            sock = null;
          }
          if (fs.existsSync(AUTH_DIR)) {
            try {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            } catch (err) {}
          }
          isInitializing = false;
          setTimeout(initBaileys, 2000);
        }
      }
    });
  } catch (error) {
    isInitializing = false;
    setTimeout(initBaileys, 5000);
  }
}

function formatarNumero(telefone) {
  let digitos = telefone.replace(/\D/g, "");
  if (digitos.length === 13 && digitos.substring(0, 2) === '55') {
    const ddd = parseInt(digitos.substring(2, 4));
    if (ddd >= 31 && ddd <= 99) {
      digitos = digitos.substring(0, 4) + digitos.substring(5);
    }
  }
  return `${digitos}@s.whatsapp.net`;
}

async function sendMessage(telefone, texto) {
  if (!sock || statusConexao !== 'conectado') {
    throw new Error('WhatsApp não está conectado.');
  }
  const jid = formatarNumero(telefone);
  await sock.sendMessage(jid, { text: texto });
}

function getStatus() { return { status: statusConexao }; }
function getQR() { return qrBase64; }

async function desconectar() {
  try {
    if (sock) {
      await sock.logout().catch(() => {});
    } else {
      statusConexao = 'desconectado';
      qrBase64 = null;
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      isInitializing = false;
      setTimeout(initBaileys, 1000);
    }
  } catch (err) {}
}

module.exports = { initBaileys, sendMessage, getStatus, getQR, desconectar };
