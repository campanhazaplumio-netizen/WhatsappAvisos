# Avisos WhatsApp — Guia de instalação no Replit

## Estrutura do projeto

```
whatsapp-avisos/
├── package.json
├── server/
│   ├── index.js       ← backend Express
│   └── whatsapp.js    ← conexão Baileys
└── client/
    └── index.html     ← frontend (sem build)
```

---

## Passo a passo no Replit

### 1. Crie um novo Repl
- Tipo: **Node.js**
- Copie os arquivos para as pastas corretas

### 2. Instale as dependências
No Shell do Replit, rode:
```bash
npm install
```

### 3. Configure o comando de start
No arquivo `.replit` ou nas configurações, defina:
```
run = "node server/index.js"
```

### 4. Inicie o projeto
```bash
node server/index.js
```

### 5. Conecte o WhatsApp
- Abra a URL do Replit no navegador
- Na aba **Avisos WhatsApp**, aparecerá um QR Code
- Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo
- Escaneie o QR Code
- Aguarde o status mudar para **Conectado**

### 6. Teste o envio
- Escolha a mensagem e os destinatários
- Clique em **Disparar aviso**
- Veja o log de envio com o status de cada contato

---

## Para conectar ao seu projeto real

### Banco de dados
No `server/index.js`, substitua o objeto `DB.clientes` por queries reais:
```js
// Exemplo com Drizzle ORM:
const contatos = await db.select().from(usuarios).where(isNotNull(usuarios.telefone));
```

### Baileys
O arquivo `server/whatsapp.js` já está pronto. Apenas garanta que a pasta `auth_info/` persiste entre reinicializações (no Replit, use um Repl com storage persistente ou salve as credenciais no banco).

---

## Dicas importantes

- O delay de 1.5s entre envios é proposital — evita bloqueio do WhatsApp
- A pasta `auth_info/` guarda a sessão do WhatsApp. Se deletar, precisará escanear o QR novamente
- Em produção, use números de WhatsApp Business para menor risco de ban
