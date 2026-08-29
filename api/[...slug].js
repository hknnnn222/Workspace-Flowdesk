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
app.use(cors({ origin: true }));
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

// 0) CLAIM TENANT
app.post("/api/claim-tenant", requireAuth, async (req, res) => {
  try {
    const { tenantId, role } = req.body;
    if (!tenantId) return res.status(400).json({ error: "tenantId obrigatório" });
    await admin.auth().setCustomUserClaims(req.user.uid, {
      tenantId,
      role: role || "agent",
    });
    res.json({ ok: true, tenantId });
  } catch (err) {
    console.error("Erro ao vincular tenant:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// 1) WEBHOOK — recebe eventos da Evolution API
app.post("/webhook/:instanceName", async (req, res) => {
  const { instanceName } = req.params;
  const body = req.body || {};
  const event = body.event;

  try {
    if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
      await handleIncomingMessage(instanceName, body.data);
    } else if (event === "messages.set" || event === "MESSAGES_SET") {
      // Histórico antigo chega de uma vez, como uma lista
      const list = Array.isArray(body.data) ? body.data : body.data?.messages || [];
      for (const msg of list) {
        await handleIncomingMessage(instanceName, msg).catch((e) =>
          console.error("Erro processando mensagem do histórico:", e)
        );
      }
    } else if (event === "connection.update" || event === "CONNECTION_UPDATE") {
      await db.collection("tenants").doc(instanceName)
        .collection("whatsapp").doc("status")
        .set({ state: body.data?.state || "unknown", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } else if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
      await db.collection("tenants").doc(instanceName)
        .collection("whatsapp").doc("status")
        .set({ qrcode: body.data?.qrcode?.base64 || null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

async function handleIncomingMessage(tenantId, data) {
  if (!data || !data.key) return;
  const remoteJid = data.key.remoteJid || "";
  const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
  const fromMe = !!data.key.fromMe;
  const pushName = data.pushName || phone;

  const text =
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    data.message?.imageMessage?.caption ||
    "[mídia]";

  const tenantRef = db.collection("tenants").doc(tenantId);
  const contactsRef = tenantRef.collection("contacts");
  const existing = await contactsRef.where("phone", "==", phone).limit(1).get();
  let contactId;
  if (existing.empty) {
    const newDoc = await contactsRef.add({
      name: pushName,
      phone,
      channel: "wa",
      status: "potencial",
      unread: fromMe ? 0 : 1,
      preview: text,
      tags: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    contactId = newDoc.id;
  } else {
    contactId = existing.docs[0].id;
    await contactsRef.doc(contactId).update({
      preview: text,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      unread: fromMe ? 0 : admin.firestore.FieldValue.increment(1),
    });
  }

  await contactsRef.doc(contactId).collection("messages").add({
    from: fromMe ? "agent" : "client",
    text,
    raw: data.message || null,
    messageId: data.key.id,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// 2) ENVIAR MENSAGEM
app.post("/api/send", requireAuth, async (req, res) => {
  try {
    const { tenantId, contactId, phone, text } = req.body;
    if (!tenantId || !phone || !text) {
      return res.status(400).json({ error: "tenantId, phone e text são obrigatórios" });
    }
    const result = await evo.sendText(tenantId, phone, text);

    if (contactId) {
      await db.collection("tenants").doc(tenantId)
        .collection("contacts").doc(contactId)
        .collection("messages").add({
          from: "agent",
          text,
          agentUid: req.user.uid,
          messageId: result?.key?.id || null,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      await db.collection("tenants").doc(tenantId).collection("contacts").doc(contactId)
        .update({ preview: text, lastMessageAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    res.json({ ok: true, result });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err.response?.data || err);
    res.status(500).json({ ok: false, error: err.response?.data || String(err) });
  }
});

// 3) CONECTAR WHATSAPP — cria instância + retorna QR code
app.post("/api/whatsapp/connect", requireAuth, async (req, res) => {
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

    await db.collection("tenants").doc(tenantId)
      .collection("whatsapp").doc("status")
      .set({ state: "qrcode", qrcode: rawBase64, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

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
app.get("/api/whatsapp/status/:tenantId", requireAuth, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const result = await evo.getStatus(tenantId);
    res.json({ ok: true, status: result });
  } catch (err) {
    console.error("Erro ao buscar status:", err?.response?.data || err);
    res.status(500).json({ ok: false, error: err?.response?.data || String(err) });
  }
});

// 5) DESCONECTAR
app.post("/api/whatsapp/disconnect", requireAuth, async (req, res) => {
  try {
    const { tenantId } = req.body;
    await evo.deleteInstance(tenantId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.response?.data || String(err) });
  }
});

module.exports = app;
