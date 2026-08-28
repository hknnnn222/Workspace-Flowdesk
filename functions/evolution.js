// ═══════════════════════════════════════════════════
// CLIENTE EVOLUTION API
// Toda comunicação com o servidor Evolution API passa por aqui.
// (Adaptado pro Vercel — configuração só via variáveis de ambiente)
// ═══════════════════════════════════════════════════
const axios = require("axios");

// Configure no painel da Vercel (Project -> Settings -> Environment Variables):
//   EVOLUTION_URL    = https://SEU-EVOLUTION-SERVER
//   EVOLUTION_APIKEY = SUA_API_KEY
function getConfig() {
  const url = process.env.EVOLUTION_URL;
  const apikey = process.env.EVOLUTION_APIKEY;
  if (!url || !apikey) {
    throw new Error(
      "Evolution API não configurada. Defina EVOLUTION_URL e EVOLUTION_APIKEY nas variáveis de ambiente da Vercel."
    );
  }
  return { url: url.replace(/\/$/, ""), apikey };
}

function client() {
  const { url, apikey } = getConfig();
  return axios.create({
    baseURL: url,
    headers: { apikey, "Content-Type": "application/json" },
    timeout: 15000,
  });
}

/**
 * Cria uma instância na Evolution API para um tenant (empresa).
 * instanceName deve ser único — recomendo usar o tenantId.
 */
async function createInstance(instanceName, webhookUrl) {
  const api = client();
  const { data } = await api.post("/instance/create", {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    webhook: {
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    },
  });
  return data;
}

/** Busca o QR code atual de conexão da instância */
async function getQrCode(instanceName) {
  const api = client();
  const { data } = await api.get(`/instance/connect/${instanceName}`);
  return data; // { base64, pairingCode, ... }
}

/** Status de conexão da instância (open, close, connecting) */
async function getStatus(instanceName) {
  const api = client();
  const { data } = await api.get(`/instance/connectionState/${instanceName}`);
  return data;
}

/** Desconecta / apaga a instância */
async function deleteInstance(instanceName) {
  const api = client();
  await api.delete(`/instance/logout/${instanceName}`).catch(() => {});
  const { data } = await api.delete(`/instance/delete/${instanceName}`);
  return data;
}

/** Envia mensagem de texto simples */
async function sendText(instanceName, phone, text) {
  const api = client();
  const number = normalizePhone(phone);
  const { data } = await api.post(`/message/sendText/${instanceName}`, {
    number,
    text,
  });
  return data;
}

/** Envia mídia (imagem, documento, áudio) via URL ou base64 */
async function sendMedia(instanceName, phone, { mediaUrl, mediatype, caption, fileName }) {
  const api = client();
  const number = normalizePhone(phone);
  const { data } = await api.post(`/message/sendMedia/${instanceName}`, {
    number,
    mediatype: mediatype || "image", // image | video | document
    media: mediaUrl,
    caption: caption || "",
    fileName: fileName || undefined,
  });
  return data;
}

/** Normaliza telefone para o formato esperado (DDI+DDD+numero, sem símbolos) */
function normalizePhone(phone) {
  let n = String(phone).replace(/\D/g, "");
  if (!n.startsWith("55")) n = "55" + n; // ajuste o DDI padrão se não for Brasil
  return n;
}

module.exports = {
  createInstance,
  getQrCode,
  getStatus,
  deleteInstance,
  sendText,
  sendMedia,
  normalizePhone,
};
