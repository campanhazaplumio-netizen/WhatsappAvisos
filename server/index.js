const express = require('express');
const cors = require('cors');
const path = require('path');
const { initBaileys, getStatus, getQR, sendMessage, desconectar } = require('./whatsapp');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

const DB = {
  mensagemSalva: 'Estamos realizando ajuste na plataforma junto a Meta.',
  organizacoes: [
    { id: '1', nome: 'Organização Alpha' },
    { id: '2', nome: 'Organização Beta' },
  ],
  clientes: [],
};

app.get('/api/whatsapp/status', (req, res) => res.json(getStatus()));
app.get('/api/whatsapp/qr', (req, res) => res.json({ qr: getQR() }));

app.get('/api/configuracoes/mensagem', (req, res) => res.json({ mensagem: DB.mensagemSalva }));
app.post('/api/configuracoes/mensagem', (req, res) => {
  DB.mensagemSalva = req.body.mensagem || '';
  res.json({ ok: true });
});

app.get("/api/organizacoes", (req, res) => res.json(DB.organizacoes));

app.post("/api/organizacoes", (req, res) => {
  const { nome } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: "Nome da organização é obrigatório." });
  const id = String(Date.now());
  const novaOrganizacao = { id, nome: nome.trim() };
  DB.organizacoes.push(novaOrganizacao);
  res.json(novaOrganizacao);
});

app.get('/api/clientes/numeros', (req, res) => res.json(DB.clientes));

app.post('/api/clientes', (req, res) => {
  const { nome, telefone, organizacaoId } = req.body;
  if (!nome?.trim() || !telefone?.trim()) return res.status(400).json({ erro: 'Nome e telefone são obrigatórios.' });
  const tel = telefone.replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 13) return res.status(400).json({ erro: 'Telefone inválido.' });
  const id = String(Date.now());
  const cliente = { id, nome: nome.trim(), telefone: tel, organizacaoId: organizacaoId || null };
  DB.clientes.push(cliente);
  res.json(cliente);
});

app.delete('/api/clientes/:id', (req, res) => {
  const idx = DB.clientes.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  DB.clientes.splice(idx, 1);
  res.json({ ok: true });
});

app.post('/api/avisos/disparar', async (req, res) => {
  const { mensagem, modo, organizacaoId, clienteIds, numerosTxt } = req.body;
  if (!mensagem?.trim()) return res.status(400).json({ erro: 'Mensagem não pode ser vazia.' });

  let contatos = [];
  if (modo === 'todos') contatos = DB.clientes;
  else if (modo === 'organizacao') contatos = DB.clientes.filter(c => c.organizacaoId === organizacaoId);
  else if (modo === 'especificos') contatos = DB.clientes.filter(c => clienteIds.includes(c.id));
  else if (modo === 'txt') contatos = numerosTxt.map((tel, i) => ({ id: 'txt_'+i, nome: 'Contato TXT', telefone: tel.replace(/\D/g, '') }));

  if (contatos.length === 0) return res.status(404).json({ erro: 'Nenhum contato encontrado.' });

  const log = [];
  for (const contato of contatos) {
    try {
      await sendMessage(contato.telefone, mensagem);
      log.push({ nome: contato.nome, telefone: contato.telefone, status: 'ok' });
    } catch (err) {
      log.push({ nome: contato.nome, telefone: contato.telefone, status: 'erro' });
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  res.json({ sucesso: true, total: log.filter(l => l.status === 'ok').length, log });
});

app.post('/api/whatsapp/desconectar', async (req, res) => {
  await desconectar();
  res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../client/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  initBaileys();
});
