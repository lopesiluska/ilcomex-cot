/**
 * Encaminha declaração de conteúdo ao webhook n8n (remetente/destinatário + id da cotação).
 * DECLARACAO_WEBHOOK_URL na Vercel sobrescreve o padrão.
 */
const DEFAULT_WEBHOOK =
  "http://95.216.142.66:5678/webhook/790db833-1a1e-42b2-89d6-b27189b8420e";

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

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

function str(v) {
  return v == null ? "" : String(v).trim();
}

function pickDealId(obj) {
  if (!obj || typeof obj !== "object") return null;
  const v = obj.bitrixDealId ?? obj.dealId ?? obj.id;
  return v != null && v !== "" ? v : null;
}

/**
 * Shape esperado pelo n8n do 2º formulário.
 * `id` = registro retornado/recuperado do 1º formulário (cotação).
 */
function buildWebhookPayload(id, dados) {
  const r = (dados && dados.remetente) || {};
  const d = (dados && dados.destinatario) || {};
  return {
    id: String(id),
    nome_remetente: str(r.nome),
    cpf_cnpj_remetente: onlyDigits(r.cpfCnpj),
    endereco_remetente: str(r.endereco),
    cep_remetente: str(r.cep),
    cidade_remetente: str(r.cidade),
    estado_remetente: str(r.estado),
    pais_remetente: str(r.pais) || "Brasil",
    telefone_remetente: onlyDigits(r.telefone),
    email_remetente: str(r.email),
    nome_destinatario: str(d.nome),
    cpf_cnpj_destinatario: onlyDigits(d.taxId || d.cpfCnpj),
    endereco_destinatario: str(d.endereco),
    cep_destinatario: str(d.postal || d.cep),
    cidade_destinatario: str(d.cidade),
    estado_destinatario: str(d.estado),
    pais_destinatario: str(d.pais) || "Brasil",
    telefone_destinatario: onlyDigits(d.telefone),
    email_destinatario: str(d.email),
  };
}

module.exports = async function handler(req, res) {
  const reqId = Math.random().toString(36).slice(2, 8);
  const tag = `[ILG /api/declaracao ${reqId}]`;

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

  const webhook = (process.env.DECLARACAO_WEBHOOK_URL || DEFAULT_WEBHOOK).trim();
  console.log(
    `${tag} webhook destino: ${webhook} (origem: ${
      process.env.DECLARACAO_WEBHOOK_URL ? "env DECLARACAO_WEBHOOK_URL" : "DEFAULT_WEBHOOK"
    })`
  );

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

  // Aceita { body: { ... } } se o cliente envelopar (evita body.body no n8n).
  if (parsed && typeof parsed.body === "object" && parsed.body !== null) {
    const inner = parsed.body;
    if (!parsed.id && inner.id != null) parsed.id = inner.id;
    if (!parsed.protocolo && inner.protocolo) parsed.protocolo = inner.protocolo;
    if (!parsed.dados && inner.dados) parsed.dados = inner.dados;
  }

  const protocolo = String(parsed.protocolo || "").replace(/[^A-Za-z0-9\-_]/g, "");
  if (!protocolo) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 400;
    return res.end(
      JSON.stringify({ success: false, error: "protocolo inválido ou ausente." })
    );
  }

  const idCotacao = str(parsed.id ?? parsed.idCotacao ?? parsed.cotacaoId);
  if (!idCotacao) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 400;
    return res.end(
      JSON.stringify({
        success: false,
        error:
          "id da cotação ausente. Abra a declaração com ?id= (recuperado do 1º formulário).",
      })
    );
  }

  if (!parsed.dados || typeof parsed.dados !== "object") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 400;
    return res.end(
      JSON.stringify({ success: false, error: "payload.dados deve ser um objeto." })
    );
  }

  const forwardPayload = buildWebhookPayload(idCotacao, parsed.dados);
  const forwardBody = JSON.stringify(forwardPayload);

  console.log(
    `${tag} protocolo=${protocolo} idCotacao=${idCotacao} payload:`,
    JSON.stringify(forwardPayload, null, 2)
  );

  let upstream;
  try {
    upstream = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: forwardBody,
    });
  } catch (e) {
    console.error(`${tag} ERRO ao contatar webhook:`, e?.message || e);
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

  console.log(
    `${tag} resposta webhook: HTTP ${upstream.status} —`,
    upstreamJson !== null ? upstreamJson : text || "(vazio)"
  );

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

  const bitrixDealId = pickDealId(upstreamJson);

  return res.end(
    JSON.stringify({
      success: true,
      protocolo,
      id: idCotacao,
      bitrixDealId,
      webhookStatus: upstream.status,
      webhookResponse: upstreamJson !== null ? upstreamJson : text || null,
      webhookPayload: forwardPayload,
    })
  );
};
