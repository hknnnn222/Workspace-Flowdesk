# Bot de IA (WhatsApp real) integrado ao Workspace

Este pacote já vem com o **Bot de IA** do workspace ligado de verdade ao backend
FlowDesk (Firebase Functions + Evolution API). Cada empresa (workspace: `ws_atlas`,
`ws_nortex`, etc.) é um **tenant separado** — quando o admin daquela empresa clica em
"Conectar WhatsApp", é criada uma instância própria na Evolution API, com QR code
próprio. Uma empresa nunca vê as conversas da outra.

## O que foi mudado

- `app.js` → o antigo `BotModule` (chat simulado, sem backend) foi trocado por uma
  versão real: tela de conexão com QR code, lista de conversas em tempo real, chat com
  histórico de mensagens e envio de mensagens de verdade pelo WhatsApp.
- `firebase-config.js` (novo) → conecta o front ao Firebase (Auth + Firestore) e expõe
  `window.FlowDeskAPI` com as funções usadas pelo `BotModule`.
- `index.html` → agora carrega o SDK do Firebase antes do `app.js`.
- `functions/` → as Cloud Functions do FlowDesk (`index.js`, `evolution.js`), com uma
  rota nova: `POST /api/claim-tenant`, que "carimba" no token do usuário logado qual
  empresa ele está operando (necessário para as Firestore Rules isolarem os dados por
  empresa).
- `firestore.rules`, `firestore.indexes.json`, `firebase.json` → copiados do backend
  FlowDesk sem alterações.

## Passo a passo para deixar 100% funcional

### 1. Evolution API (o WhatsApp em si)
Se ainda não tem um servidor rodando:
```bash
git clone https://github.com/EvolutionAPI/evolution-api
cd evolution-api
docker compose up -d
```
Anote a URL pública (ex: `https://evolution.seudominio.com`) e a
`AUTHENTICATION_API_KEY` definida no `.env`.

### 2. Firebase
```bash
npm install -g firebase-tools
firebase login
firebase use --add        # selecione/crie seu projeto
cd functions && npm install && cd ..
```
No Console do Firebase, ative:
- **Firestore Database** (modo produção)
- **Authentication** → ative o provedor **Anônimo** (é o que autentica os usuários do
  workspace sem exigir um cadastro extra — o login do CRM continua sendo o mesmo)

Configure a Evolution API nas Functions:
```bash
firebase functions:config:set evolution.url="https://evolution.seudominio.com" evolution.apikey="SUA_API_KEY"
```

Publique o backend:
```bash
firebase deploy --only functions,firestore:rules,firestore:indexes
```

### 3. Ligar o front-end
Abra `firebase-config.js` e preencha com os dados do seu app Firebase (Console →
Configurações do projeto → Seus apps → SDK config):
```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```
Se a sua Function não estiver na região `us-central1`, ajuste também a constante
`API_BASE` nesse mesmo arquivo.

### 4. Testar
1. Abra o workspace, faça login em uma empresa (ex: Atlas Distribuidora).
2. Vá na aba **Bot de IA**.
3. Clique em **Conectar WhatsApp** → um QR code vai aparecer.
4. No celular da empresa: WhatsApp → Aparelhos conectados → Conectar um aparelho →
   escaneie o QR code.
5. Assim que conectar, mande uma mensagem de outro número para esse WhatsApp — ela
   aparece na lista de conversas em segundos.
6. Faça login em outra empresa (ex: Nortex) e repita — é uma instância e um número
   totalmente separados.

## Como funciona o multi-tenant (cada empresa com seu próprio número)

- O `tenantId` usado tanto na Evolution API (nome da instância) quanto no Firestore
  (`tenants/{tenantId}/...`) é o próprio `workspaceId` do CRM (`ws_atlas`, `ws_nortex`...).
- Ao entrar no Bot de IA, o front chama `ensureTenantSession(workspaceId)`, que faz
  login anônimo (se necessário) e chama `/api/claim-tenant` para gravar esse
  `tenantId` como *custom claim* no token do usuário.
- As `firestore.rules` só liberam leitura/escrita em `tenants/{tenantId}/...` para quem
  tem esse `tenantId` no token — isso impede uma empresa de ler os dados da outra.
- Trocar de empresa no workspace refaz esse processo automaticamente com o novo
  `tenantId`.

> **Nota de segurança:** o login do CRM neste projeto ainda é o mock em memória
> (`LOGIN_ACCOUNTS`, sem backend real). O `claim-tenant` confia no `tenantId` que o
> front envia. Isso é suficiente para colocar o Bot de IA funcionando de verdade agora,
> mas para produção o recomendável é substituir também o login do CRM por
> Firebase Authentication de verdade (e-mail/senha), validando no backend que aquele
> usuário realmente pertence à empresa antes de gravar o `tenantId` — o
> `functions/index.js` já está pronto para isso.

## Onde cada coisa mora no Firestore

```
tenants/{tenantId}
  whatsapp/status              -> { state, qrcode, updatedAt }
  contacts/{contactId}         -> { name, phone, status, preview, unread, lastMessageAt }
    messages/{messageId}       -> { from: 'client'|'agent', text, timestamp }
```
