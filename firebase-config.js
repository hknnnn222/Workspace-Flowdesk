// ═══════════════════════════════════════════════════
// CONFIGURAÇÃO DO FIREBASE — preencha com os dados do seu projeto
// (Console Firebase > Configurações do projeto > Seus apps > SDK config)
// Veja o README-INTEGRACAO.md para o passo a passo completo.
// ═══════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyCMhxIibrC9pkj8YKhrm_A7ujXf5nzzOKM",
  authDomain: "workspace-9a703.firebaseapp.com",
  projectId: "workspace-9a703",
  storageBucket: "workspace-9a703.firebasestorage.app",
  messagingSenderId: "229273041998",
  appId: "1:229273041998:web:956d950f5628c18bb0d71f",
};
// Detecta se o projeto ainda não foi configurado (placeholders não preenchidos)
const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "COLE_AQUI" && !!firebaseConfig.projectId && firebaseConfig.projectId !== "SEU-PROJETO";

let auth = null;
let db = null;

if (FIREBASE_CONFIGURED) {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
}

// URL base das suas Functions — ajuste a região/projeto.
// Ex: "https://us-central1-meu-projeto.cloudfunctions.net/api"
const API_BASE = "https://workspace-flowdesk.vercel.app";

async function apiCall(path, method = "GET", body) {
  const user = auth && auth.currentUser;
  const token = user ? await user.getIdToken() : null;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ? JSON.stringify(errBody.error) : res.statusText);
  }
  return res.json();
}

// Garante uma sessão autenticada (login anônimo) e "carimba" no token qual
// empresa (tenantId) esse usuário está operando agora. Isso é o que faz as
// Firestore Rules liberarem a leitura/escrita só dos dados daquela empresa.
// Chame sempre que o usuário trocar de empresa dentro do workspace.
async function ensureTenantSession(tenantId) {
  if (!FIREBASE_CONFIGURED) throw new Error("Firebase não configurado — preencha firebase-config.js");
  if (!auth.currentUser) {
    await auth.signInAnonymously();
  }
  await apiCall("/api/claim-tenant", "POST", { tenantId });
  await auth.currentUser.getIdToken(true); // força atualizar o token com o novo custom claim
  return true;
}

function contactsCol(tenantId) {
  return db.collection("tenants").doc(tenantId).collection("contacts");
}

window.FlowDeskAPI = {
  configured: FIREBASE_CONFIGURED,
  auth,
  db,
  apiCall,
  ensureTenantSession,

  // ─────────────────────────────────────────────────
  // WhatsApp (Evolution API)
  // ─────────────────────────────────────────────────
  // Envia mensagem de WhatsApp de verdade via Evolution API
  sendMessage: (tenantId, contactId, phone, text) =>
    apiCall("/api/send", "POST", { tenantId, contactId, phone, text }),
  // Conecta o WhatsApp (gera QR code) — cada empresa/tenant tem sua própria instância
  connectWhatsapp: (tenantId) => apiCall("/api/whatsapp/connect", "POST", { tenantId }),
  whatsappStatus: (tenantId) => apiCall(`/api/whatsapp/status/${tenantId}`),
  disconnectWhatsapp: (tenantId) => apiCall("/api/whatsapp/disconnect", "POST", { tenantId }),
  // Escuta em tempo real o status da conexão + QR code (atualizado pelo webhook da Evolution API)
  listenWhatsappStatus: (tenantId, callback) =>
    db.collection("tenants").doc(tenantId).collection("whatsapp").doc("status")
      .onSnapshot(
        (snap) => callback(snap.exists ? snap.data() : null),
        (err) => console.error("listenWhatsappStatus:", err)
      ),

  // ─────────────────────────────────────────────────
  // Contatos / conversas
  // ─────────────────────────────────────────────────
  // Escuta em tempo real só os primeiros `limit` contatos (padrão: 30),
  // ordenados pela conversa mais recente. `status` é opcional
  // ('potencial' | 'pendente' | 'ativo') pra filtrar a aba ativa.
  listenContacts: (tenantId, limit, callback, status) => {
    let q = contactsCol(tenantId);
    if (status) q = q.where("status", "==", status);
    return q
      .orderBy("lastMessageAt", "desc")
      .limit(limit || 30)
      .onSnapshot(
        (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("listenContacts:", err)
      );
  },
  // Busca (uma vez só, sem tempo real) mais `limit` contatos mais antigos
  // que `afterContact`. Usado ao rolar a lista pra baixo. `status` idem acima.
  loadMoreContacts: (tenantId, afterContact, limit, status) => {
    let q = contactsCol(tenantId);
    if (status) q = q.where("status", "==", status);
    return q
      .orderBy("lastMessageAt", "desc")
      .startAfter(afterContact.lastMessageAt || null)
      .limit(limit || 30)
      .get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  },
  // Conta quantos contatos existem em cada status (potencial/pendente/ativo)
  // pra alimentar os "chips" no topo da lista. Usa contagem agregada (.count())
  // quando disponível no SDK; senão cai pra .get() normal.
  getContactCounts: async (tenantId) => {
    const base = contactsCol(tenantId);
    const statuses = ["potencial", "pendente", "ativo"];
    const counts = { potencial: 0, pendente: 0, ativo: 0 };
    await Promise.all(
      statuses.map(async (s) => {
        const q = base.where("status", "==", s);
        try {
          if (typeof q.count === "function") {
            const snap = await q.count().get();
            counts[s] = snap.data().count;
          } else {
            const snap = await q.get();
            counts[s] = snap.size;
          }
        } catch (err) {
          console.error(`getContactCounts (${s}):`, err);
        }
      })
    );
    return counts;
  },
  // Atualiza o status de um contato (potencial/pendente/ativo) — usado pelo
  // seletor na linha do contato. Marcar como "ativo" é sempre manual.
  setContactStatus: (tenantId, contactId, status) =>
    contactsCol(tenantId).doc(contactId).update({ status }),
  // Atribui (ou remove, com null) um atendente responsável pela conversa —
  // usa os mesmos membros do workspace (CRM), não uma lista separada.
  assignContact: (tenantId, contactId, userId, userName) =>
    contactsCol(tenantId).doc(contactId).update({
      assignedTo: userId || null,
      assignedToName: userName || null,
    }),
  // Aplica/atualiza a lista de etiquetas (tags) de um contato.
  setContactTags: (tenantId, contactId, tags) =>
    contactsCol(tenantId).doc(contactId).update({ tags }),
  // Vincula esse contato do bot a um Contato/Empresa já existentes no CRM
  // (ou grava os ids recém-criados) — usado pelo botão "Enviar para o CRM".
  linkContactToCrm: (tenantId, contactId, { crmContactId, crmCompanyId }) =>
    contactsCol(tenantId).doc(contactId).update({
      crmContactId: crmContactId || null,
      crmCompanyId: crmCompanyId || null,
    }),

  // ─────────────────────────────────────────────────
  // Mensagens
  // ─────────────────────────────────────────────────
  // Escuta em tempo real só as últimas `limit` mensagens (padrão: 30).
  // Retorna também um callback com a lista já na ordem certa (mais antiga primeiro).
  listenMessages: (tenantId, contactId, limit, callback) =>
    contactsCol(tenantId).doc(contactId)
      .collection("messages").orderBy("timestamp", "desc").limit(limit || 30)
      .onSnapshot(
        (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
        (err) => console.error("listenMessages:", err)
      ),
  // Busca (uma vez só, sem tempo real) até `limit` mensagens mais antigas que `beforeTimestamp`.
  // Usado quando o usuário rola pra cima procurando histórico.
  loadOlderMessages: (tenantId, contactId, beforeTimestamp, limit) =>
    contactsCol(tenantId).doc(contactId)
      .collection("messages").orderBy("timestamp", "desc")
      .startAfter(beforeTimestamp)
      .limit(limit || 30)
      .get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
  // Grava uma mensagem de sistema (ex: "Transferido para Fulano") no histórico
  // da conversa, sem passar pelo WhatsApp de verdade — só visível no painel.
  addSystemMessage: (tenantId, contactId, text) =>
    contactsCol(tenantId).doc(contactId).collection("messages").add({
      from: "system",
      text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    }),

  // ─────────────────────────────────────────────────
  // Mensagens rápidas (respostas prontas) — por empresa/tenant
  // ─────────────────────────────────────────────────
  listenQuickReplies: (tenantId, callback) =>
    db.collection("tenants").doc(tenantId).collection("quickReplies")
      .orderBy("trigger")
      .onSnapshot(
        (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("listenQuickReplies:", err)
      ),
  saveQuickReply: (tenantId, { id, trigger, text, category }) => {
    const col = db.collection("tenants").doc(tenantId).collection("quickReplies");
    if (id) return col.doc(id).update({ trigger, text, category });
    return col.add({ trigger, text, category, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  },
  deleteQuickReply: (tenantId, id) =>
    db.collection("tenants").doc(tenantId).collection("quickReplies").doc(id).delete(),

  // ─────────────────────────────────────────────────
  // Etiquetas (labels) — por empresa/tenant
  // ─────────────────────────────────────────────────
  listenLabels: (tenantId, callback) =>
    db.collection("tenants").doc(tenantId).collection("labels")
      .orderBy("name")
      .onSnapshot(
        (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("listenLabels:", err)
      ),
  saveLabel: (tenantId, { id, name, color, bg }) => {
    const col = db.collection("tenants").doc(tenantId).collection("labels");
    if (id) return col.doc(id).update({ name, color, bg });
    return col.add({ name, color, bg, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  },
  deleteLabel: (tenantId, id) =>
    db.collection("tenants").doc(tenantId).collection("labels").doc(id).delete(),
};
