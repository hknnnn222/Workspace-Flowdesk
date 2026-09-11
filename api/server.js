// ═══════════════════════════════════════════════════
// FLOWDESK BACKEND — Vercel Serverless Function + Evolution API
// Arquivo catch-all: [...slug].js captura QUALQUER caminho depois de /api/
// (ex: /api/send, /api/whatsapp/connect, /api/whatsapp/status/xyz)
// ═══════════════════════════════════════════════════
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const evo = require("../functions/evolution");

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "Faltou configurar a variável de ambiente FIREBASE_SERVICE_ACCOUNT na Vercel (cole o JSON da service account do Firebase)."
    );
  }
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const app = express();
// CORS restrito: só o domínio real do front pode chamar essa API. Antes
// estava "origin: true", que reflete QUALQUER origem que pedir — ou seja,
// qualquer site na internet podia chamar /api/* a partir do navegador de um
// visitante. Ajuste ALLOWED_ORIGINS se adicionar um domínio próprio depois.
const ALLOWED_ORIGINS = [
  "https://workspace-flowdesk.vercel.app",
];
app.use(cors({
  origin: (origin, callback) => {
    // requisições sem "origin" (ex: server-to-server, curl, o próprio webhook
    // da Evolution API) não têm origem de navegador pra checar — são liberadas
    // aqui; a proteção real delas é o requireAuth/token, não o CORS.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("Origem não permitida por CORS: " + origin));
  },
}));
app.use(express.json({ limit: "15mb" }));
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, must-revalidate");
  next();
});

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Token ausente" });
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

// Confere que o tenantId que o cliente está tentando usar é EXATAMENTE o
// mesmo tenantId gravado no custom claim do token dele (carimbado em
// /api/claim-tenant). Sem isso, qualquer usuário autenticado poderia mandar
// um tenantId diferente no corpo/URL da requisição e mexer nos dados de
// outra empresa — o token provava só "sou alguém", não "sou dessa empresa".
// Use em toda rota que recebe tenantId do cliente (body, params ou query).
function requireTenantMatch(req, res, next) {
  const claimedTenant = req.user && req.user.tenantId;
  const requestedTenant = req.body?.tenantId || req.params?.tenantId || req.query?.tenantId;
  if (!claimedTenant) {
    return res.status(403).json({ error: "Este usuário ainda não está vinculado a nenhuma empresa (tenantId ausente no token)." });
  }
  if (!requestedTenant || requestedTenant !== claimedTenant) {
    return res.status(403).json({ error: "Acesso negado: tenantId não corresponde à empresa vinculada a este usuário." });
  }
  next();
}

// 0) CLAIM TENANT
app.post("/api/claim-tenant", requireAuth, async (req, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ error: "tenantId obrigatório" });
    // "role" NUNCA vem do body — um cliente poderia mandar role:"admin" e se
    // promover sozinho. Se o usuário já tinha um role carimbado antes, mantém;
    // senão, entra como "agent" (o mínimo). Promover alguém a admin é uma ação
    // que deve acontecer por um fluxo separado, controlado pelo backend/painel
    // de administração — nunca a partir do que o próprio cliente envia aqui.
    const previousRole = req.user.role;
    await admin.auth().setCustomUserClaims(req.user.uid, {
      tenantId,
      role: previousRole || "agent",
    });
    res.json({ ok: true, tenantId });
  } catch (err) {
    console.error("Erro ao vincular tenant:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// 1) WEBHOOK — recebe eventos da Evolution API
// Protegido por apikey: a Evolution API inclui o campo "apikey" dentro do
// PRÓPRIO CORPO JSON de todo webhook que ela dispara (junto com "event",
// "instance", "data" etc — confirmado na documentação oficial), com o mesmo
// valor da apikey da instância. Como você usa uma única EVOLUTION_APIKEY
// global pra todas as instâncias, comparamos com ela. Sem essa checagem,
// QUALQUER pessoa na internet podia chamar essa URL diretamente (curl,
// script, bot) e injetar contatos/mensagens falsas no Firestore — essa rota
// nunca passa por login, então a apikey no corpo é a única forma de provar
// "essa chamada realmente veio da minha instância Evolution".
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return require("crypto").timingSafeEqual(bufA, bufB);
}

app.post("/webhook/:instanceName", async (req, res) => {
  const body = req.body || {};
  const receivedKey = body.apikey;
  const expectedKey = process.env.EVOLUTION_APIKEY;
  if (!expectedKey || typeof receivedKey !== "string" || !timingSafeEqual(receivedKey, expectedKey)) {
    console.warn("Webhook rejeitado: apikey ausente ou incorreta.", { instanceName: req.params.instanceName });
    return res.status(401).json({ ok: false, error: "apikey inválida" });
  }

  const { instanceName } = req.params;
  const event = body.event;

  // LOG TEMPORÁRIO — dá pra remover depois que descobrirmos o nome certo do evento de histórico
  console.log("WEBHOOK EVENT:", instanceName, event);

  try {
    if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
      await withTimeout(handleIncomingMessage(instanceName, body.data), 8000, "processar mensagem");
    } else if (event === "messages.set" || event === "MESSAGES_SET") {
      // Histórico antigo chega de uma vez, como uma lista
      const list = Array.isArray(body.data) ? body.data : body.data?.messages || [];
      for (const msg of list) {
        await withTimeout(handleIncomingMessage(instanceName, msg), 8000, "processar mensagem do histórico").catch((e) =>
          console.error("Erro processando mensagem do histórico:", e)
        );
      }
    } else if (event === "connection.update" || event === "CONNECTION_UPDATE") {
      await withTimeout(
        db.collection("tenants").doc(instanceName)
          .collection("whatsapp").doc("status")
          .set({ state: body.data?.state || "unknown", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }),
        8000,
        "gravar connection.update"
      );
    } else if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
      await withTimeout(
        db.collection("tenants").doc(instanceName)
          .collection("whatsapp").doc("status")
          .set({ qrcode: body.data?.qrcode?.base64 || null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }),
        8000,
        "gravar qrcode.updated"
      );
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Erro no webhook:", err);
    // Mesmo em erro/timeout, responde rápido — assim a Evolution não fica reenviando
    // o mesmo evento em loop achando que a chamada travou.
    res.status(200).json({ ok: false, error: String(err) });
  }
});

// Limita quanto tempo uma promise (ex: gravação no Firestore) pode demorar.
// Se estourar, rejeita ao invés de deixar a request pendurada até o limite da function.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms}ms) ao ${label}`)), ms)
    ),
  ]);
}

async function handleIncomingMessage(tenantId, data) {
  if (!data || !data.key) return;
  const remoteJid = data.key.remoteJid || "";
  const isGroup = remoteJid.endsWith("@g.us");
  const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
  const fromMe = !!data.key.fromMe;
  const pushName = data.pushName || phone;
  const messageDocId = data.key.id || null; // ID da mensagem no WhatsApp — usamos como ID do doc pra evitar duplicar

  // Em grupos, quem realmente escreveu a mensagem vem em "participant" (o
  // remoteJid é o ID do GRUPO, não da pessoa). Em conversa individual não
  // existe esse campo — nesse caso o remetente é o próprio contato.
  const senderJid = isGroup ? (data.key.participant || data.participant || "") : remoteJid;
  const senderPhone = senderJid ? senderJid.replace("@s.whatsapp.net", "").replace("@g.us", "") : phone;
  const senderName = isGroup ? (data.pushName || senderPhone) : pushName;

  const text =
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    data.message?.imageMessage?.caption ||
    "[mídia]";

  // Usa o horário REAL da mensagem (vindo do WhatsApp) em vez do horário
  // em que ela chegou no nosso webhook — essencial pro histórico antigo
  // não aparecer todo com o horário de "agora".
  // data.messageTimestamp vem em segundos (unix); às vezes vem como string ou objeto { low, high }.
  let msgDate = null;
  const rawTs = data.messageTimestamp;
  if (rawTs != null) {
    const seconds = typeof rawTs === "object" ? Number(rawTs.low) : Number(rawTs);
    if (!Number.isNaN(seconds) && seconds > 0) {
      msgDate = new Date(seconds * 1000);
    }
  }
  const messageTimestamp = msgDate
    ? admin.firestore.Timestamp.fromDate(msgDate)
    : admin.firestore.FieldValue.serverTimestamp();

  const tenantRef = db.collection("tenants").doc(tenantId);
  const contactsRef = tenantRef.collection("contacts");
  const existing = await contactsRef.where("phone", "==", phone).limit(1).get();
  let contactId;

  // Regra de status automático (nunca mexe em "ativo" — esse só muda na mão):
  //  - contato NOVO (primeira mensagem que ele manda) entra como "pendente"
  //    (ainda não teve nenhum retorno nosso).
  //  - assim que a empresa responde pela primeira vez (fromMe === true) numa
  //    conversa que estava "pendente", ela passa a ser "potencial" (conversa
  //    já iniciada/em andamento).
  if (existing.empty) {
    const newDoc = await contactsRef.add({
      name: pushName,
      phone,
      channel: "wa",
      isGroup,
      status: "pendente",
      unread: fromMe ? 0 : 1,
      preview: (isGroup && !fromMe ? `${senderName}: ` : "") + text,
      tags: [],
      assignedTo: null,
      crmContactId: null,
      crmCompanyId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: messageTimestamp,
    });
    contactId = newDoc.id;
  } else {
    contactId = existing.docs[0].id;
  }

  const messagesRef = contactsRef.doc(contactId).collection("messages");

  // Se já processamos essa mensagem antes (mesmo messageId — ex: reconexão
  // reenviando o histórico), não duplica nem reprocessa.
  if (messageDocId) {
    const already = await messagesRef.doc(messageDocId).get();
    if (already.exists) return;
  }

  // Se o contato já existia, atualiza preview/lastMessageAt/unread.
  // Só mexe no preview/lastMessageAt se essa mensagem for mais recente que a
  // última que já tínhamos — assim, histórico chegando fora de ordem não
  // bagunça a prévia/ordenação da lista de conversas.
  if (!existing.empty) {
    const contactSnap = await contactsRef.doc(contactId).get();
    const currentData = contactSnap.data() || {};
    const currentLastMessageAt = currentData.lastMessageAt;
    const isNewer =
      !currentLastMessageAt ||
      !msgDate ||
      msgDate.getTime() >= currentLastMessageAt.toDate().getTime();

    // Se a empresa (agente) respondeu e a conversa ainda estava "pendente"
    // (primeiro contato dela com esse cliente), promove pra "potencial".
    // "ativo" nunca é alterado automaticamente — só manualmente pelo atendente.
    const statusUpdate =
      fromMe && currentData.status === "pendente" ? { status: "potencial" } : {};

    await contactsRef.doc(contactId).update({
      ...(isNewer ? { preview: (isGroup && !fromMe ? `${senderName}: ` : "") + text, lastMessageAt: messageTimestamp } : {}),
      ...(isGroup ? { isGroup: true } : {}),
      ...statusUpdate,
      unread: fromMe ? 0 : admin.firestore.FieldValue.increment(1),
    });
  }

  const messageData = {
    from: fromMe ? "agent" : "client",
    text,
    raw: data.message || null,
    messageId: data.key.id,
    timestamp: messageTimestamp,
    ...(isGroup ? { senderPhone, senderName } : {}),
  };

  if (messageDocId) {
    await messagesRef.doc(messageDocId).set(messageData, { merge: true });
  } else {
    await messagesRef.add(messageData);
  }
}

// 2) ENVIAR MENSAGEM
app.post("/api/send", requireAuth, requireTenantMatch, async (req, res) => {
  try {
    const { tenantId, contactId, phone, text } = req.body;
    if (!tenantId || !phone || !text) {
      return res.status(400).json({ error: "tenantId, phone e text são obrigatórios" });
    }
    const result = await evo.sendText(tenantId, phone, text);

    if (contactId) {
      const contactRef = db.collection("tenants").doc(tenantId).collection("contacts").doc(contactId);
      await contactRef.collection("messages").add({
        from: "agent",
        text,
        agentUid: req.user.uid,
        messageId: result?.key?.id || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Primeira resposta da empresa promove a conversa de "pendente" pra "potencial".
      // "ativo" nunca é mexido automaticamente.
      const contactSnap = await contactRef.get();
      const statusUpdate = contactSnap.data()?.status === "pendente" ? { status: "potencial" } : {};
      await contactRef.update({
        preview: text,
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        ...statusUpdate,
      });
    }

    res.json({ ok: true, result });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err.response?.data || err);
    res.status(500).json({ ok: false, error: err.response?.data || String(err) });
  }
});

// 3) CONECTAR WHATSAPP — cria instância + retorna QR code
app.post("/api/whatsapp/connect", requireAuth, requireTenantMatch, async (req, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ ok: false, error: "tenantId obrigatório" });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;
    const webhookUrl = `${baseUrl}/webhook/${tenantId}`;

    try {
      await evo.createInstance(tenantId, webhookUrl);
    } catch (e) {
      console.log("Aviso createInstance (instância já deve existir):", e?.response?.data || e?.message);
    }

    const qrData = await evo.getQrCode(tenantId);
    let rawBase64 =
      qrData?.base64 ||
      qrData?.qrcode?.base64 ||
      qrData?.code ||
      "";

    if (typeof rawBase64 === "object" && rawBase64?.base64) {
      rawBase64 = rawBase64.base64;
    }
    if (typeof rawBase64 === "string" && rawBase64.includes(",")) {
      rawBase64 = rawBase64.split(",")[1];
    }

    withTimeout(
      db.collection("tenants").doc(tenantId)
        .collection("whatsapp").doc("status")
        .set({ state: "qrcode", qrcode: rawBase64, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }),
      8000,
      "gravar status do QR code"
    ).catch((e) => console.error("Erro ao gravar status do QR code (não bloqueante):", e));

    return res.json({
      ok: true,
      qrcode: rawBase64,
      pairingCode: qrData?.pairingCode || null,
    });
  } catch (err) {
    console.error("Erro ao conectar WhatsApp:", err?.response?.data || err);
    return res.status(500).json({
      ok: false,
      error: err?.response?.data || err?.message || String(err),
    });
  }
});

// 4) STATUS DA CONEXÃO
app.get("/api/whatsapp/status/:tenantId", requireAuth, requireTenantMatch, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const result = await evo.getStatus(tenantId);
    res.json({ ok: true, status: result });
  } catch (err) {
    const data = err?.response?.data;
    const instanceMissing =
      err?.response?.status === 404 ||
      JSON.stringify(data || "").includes("does not exist");

    if (instanceMissing) {
      // A Evolution API não tem mais essa instância (foi apagada, ou nunca chegou
      // a existir de fato) — corrige o status guardado no Firestore pra refletir
      // a realidade, em vez de continuar martelando erro a cada poucos segundos.
      withTimeout(
        db.collection("tenants").doc(tenantId)
          .collection("whatsapp").doc("status")
          .set({ state: "close", qrcode: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }),
        8000,
        "corrigir status (instância inexistente)"
      ).catch((e) => console.error("Erro ao corrigir status (não bloqueante):", e));

      return res.json({ ok: true, status: { state: "close" }, instanceMissing: true });
    }

    console.error("Erro ao buscar status:", data || err);
    res.status(500).json({ ok: false, error: data || String(err) });
  }
});

// 5) DESCONECTAR
app.post("/api/whatsapp/disconnect", requireAuth, requireTenantMatch, async (req, res) => {
  try {
    const { tenantId } = req.body;
    await evo.deleteInstance(tenantId);
    await withTimeout(
      db.collection("tenants").doc(tenantId)
        .collection("whatsapp").doc("status")
        .set({ state: "close", qrcode: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }),
      8000,
      "gravar status de desconexão"
    ).catch((e) => console.error("Erro ao gravar status de desconexão (não bloqueante):", e));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.response?.data || String(err) });
  }
});

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ error: "Apenas administradores podem executar esta ação." });
  }
  next();
}

// 6) ROTA TEMPORÁRIA — apaga a coleção "contacts" (e mensagens dentro) de um
// tenant, em LOTES, um pouco de cada vez, pra nunca estourar o tempo limite
// da function em coleções grandes. Chame repetidamente até vir "done: true".
// REMOVA ESSA ROTA depois de usar.
app.post("/api/admin/wipe-contacts", requireAuth, requireTenantMatch, requireAdmin, async (req, res) => {
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 45000; // pára de apagar mais e responde antes dos 60s da function
  let deletedContacts = 0;
  let deletedMessages = 0;
  try {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ ok: false, error: "tenantId obrigatório" });
    const contactsRef = db.collection("tenants").doc(tenantId).collection("contacts");

    let done = false;
    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      const snap = await contactsRef.limit(10).get();
      if (snap.empty) { done = true; break; }

      for (const contactDoc of snap.docs) {
        if (Date.now() - startedAt >= TIME_BUDGET_MS) break;
        // Apaga as mensagens desse contato em lotes de até 400 (limite do batch é 500)
        const messagesRef = contactDoc.ref.collection("messages");
        let messagesDone = false;
        while (!messagesDone && Date.now() - startedAt < TIME_BUDGET_MS) {
          const msgSnap = await messagesRef.limit(400).get();
          if (msgSnap.empty) { messagesDone = true; break; }
          const batch = db.batch();
          msgSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          deletedMessages += msgSnap.size;
          if (msgSnap.size < 400) messagesDone = true;
        }
        if (messagesDone) {
          await contactDoc.ref.delete();
          deletedContacts++;
        }
      }
    }

    res.json({
      ok: true,
      done,
      deletedContacts,
      deletedMessages,
      message: done
        ? `Coleção contacts do tenant ${tenantId} totalmente apagada.`
        : `Apagou ${deletedContacts} contato(s) e ${deletedMessages} mensagem(ns) até agora — ainda tem mais. Chame de novo pra continuar.`,
    });
  } catch (err) {
    console.error("Erro ao apagar contacts:", err);
    res.status(500).json({ ok: false, deletedContacts, deletedMessages, error: String(err) });
  }
});

module.exports = app;
