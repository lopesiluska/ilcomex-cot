/**
 * Encaminha o POST JSON do formulário de cotação para o webhook (n8n / EasyPanel).
 * URL padrão pode ser sobrescrita por COTACAO_WEBHOOK_URL na Vercel.
 */
const DEFAULT_WEBHOOK =
  "https://integralci-ilg.jhujt5.easypanel.host/webhook/formulariositeilg";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 405;
    return res.end(JSON.stringify({ success: false, error: "Use POST (JSON)." }));
  }

  const webhook = (process.env.COTACAO_WEBHOOK_URL || DEFAULT_WEBHOOK).trim();
  if (!webhook) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 500;
    return res.end(
      JSON.stringify({ success: false, error: "Webhook não configurado." })
    );
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 400;
    return res.end(JSON.stringify({ success: false, error: "Corpo inválido." }));
  }

  if (!raw || !String(raw).trim()) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 400;
    return res.end(
      JSON.stringify({ success: false, error: "Corpo JSON é obrigatório." })
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 400;
    return res.end(JSON.stringify({ success: false, error: "JSON inválido." }));
  }

  const protocolo = String(parsed.protocolo || "").replace(/[^A-Za-z0-9\-_]/g, "");
  if (!protocolo) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 400;
    return res.end(
      JSON.stringify({ success: false, error: "protocolo inválido ou ausente." })
    );
  }

  if (!parsed.dados || typeof parsed.dados !== "object") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 400;
    return res.end(
      JSON.stringify({ success: false, error: "payload.dados deve ser um objeto." })
    );
  }

  const forwardBody = JSON.stringify(parsed);

  let upstream;
  try {
    upstream = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: forwardBody,
    });
  } catch (e) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 502;
    return res.end(
      JSON.stringify({
        success: false,
        error: "Falha ao contatar o webhook: " + (e.message || String(e)),
      })
    );
  }

  const text = await upstream.text();
  let upstreamJson = null;
  try {
    upstreamJson = text ? JSON.parse(text) : null;
  } catch {
    /* texto puro */
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (!upstream.ok) {
    res.statusCode = 502;
    return res.end(
      JSON.stringify({
        success: false,
        error: "Webhook respondeu HTTP " + upstream.status,
        upstreamStatus: upstream.status,
        upstreamBody: upstreamJson !== null ? upstreamJson : text,
      })
    );
  }

  return res.end(
    JSON.stringify({
      success: true,
      protocolo,
      webhookStatus: upstream.status,
      webhookResponse: upstreamJson !== null ? upstreamJson : text || null,
    })
  );
}
