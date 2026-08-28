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
const API_BASE = "https://workspace-flowdesk.vercel.app/api";

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

window.FlowDeskAPI = {
  configured: FIREBASE_CONFIGURED,
  auth,
  db,
  apiCall,
  ensureTenantSession,
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
  // Escuta contatos em tempo real
  listenContacts: (tenantId, callback) =>
    db.collection("tenants").doc(tenantId).collection("contacts")
      .orderBy("lastMessageAt", "desc")
      .onSnapshot(
        (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("listenContacts:", err)
      ),
  // Escuta mensagens de um contato em tempo real
  listenMessages: (tenantId, contactId, callback) =>
    db.collection("tenants").doc(tenantId).collection("contacts").doc(contactId)
      .collection("messages").orderBy("timestamp", "asc")
      .onSnapshot(
        (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("listenMessages:", err)
      ),
};
