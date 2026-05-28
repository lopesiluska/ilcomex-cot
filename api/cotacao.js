/**
 * Encaminha o POST JSON do formulário de cotação para o webhook (n8n / EasyPanel).
 * URL padrão pode ser sobrescrita por COTACAO_WEBHOOK_URL na Vercel.
 */
const DEFAULT_WEBHOOK =
  "http://95.216.142.66:5678/webhook/09a2586e-e667-43f3-a071-7c302b84f010";

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
  const reqId = Math.random().toString(36).slice(2, 8);
  const tag = `[ILG /api/cotacao ${reqId}]`;
  console.log(`${tag} >> ${req.method} ${req.url || ""} from ${req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?"}`);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    console.warn(`${tag} método não permitido: ${req.method}`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 405;
    return res.end(JSON.stringify({ success: false, error: "Use POST (JSON)." }));
  }

  const webhook = (process.env.COTACAO_WEBHOOK_URL || DEFAULT_WEBHOOK).trim();
  console.log(
    `${tag} webhook destino: ${webhook} (origem: ${process.env.COTACAO_WEBHOOK_URL ? "env COTACAO_WEBHOOK_URL" : "DEFAULT_WEBHOOK"})`
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

  const d = parsed.dados;
  const contato = d.contato || {};
  const origem = d.origem || {};
  const destino = d.destino || {};
  const caixasIn = Array.isArray(d.caixas) ? d.caixas : [];

  const str = (v) => (v == null ? "" : String(v));
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const parseNum = (v) => {
    const s = str(v).replace(",", ".").trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const formatKgBR = (n) =>
    n.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " kg";
  const normalizeBRLPlain = (value) => {
    // "R$ 1.500,00" -> "1500,00" ; "" -> ""
    const digits = str(value).replace(/\D/g, "");
    if (!digits) return "";
    const cents = parseInt(digits, 10);
    const reais = (cents / 100).toFixed(2);
    return reais.replace(".", ",");
  };

  const dadosClean = {
    protocolo,
    contato: {
      nome: str(contato.nome),
      email: str(contato.email),
      telefone: str(contato.telefone),
      observacoes: str(contato.observacoes),
    },
    origem: {
      cep: str(origem.cep),
      cidade: str(origem.cidade),
      estado: str(origem.estado),
      pais: str(origem.pais || "Brasil"),
    },
    destino: {
      cidade: str(destino.cidade),
      estado: str(destino.estado),
      cep: str(destino.cep),
      pais: str(destino.pais),
    },
    caixas: caixasIn.map((c, i) => {
      const altura = str(c && c.altura);
      const largura = str(c && c.largura);
      const comprimento = str(c && c.comprimento);
      const peso = str(c && c.peso);

      const pesoBrutoNum = parseNum(peso);
      const pesoCubadoNum =
        (parseNum(altura) * parseNum(largura) * parseNum(comprimento)) / 5000;
      const pesoConsideradoNum = Math.max(pesoBrutoNum, pesoCubadoNum);

      return {
        numero: Number.isFinite(Number(c && c.numero)) ? Number(c.numero) : i + 1,
        altura,
        largura,
        comprimento,
        peso,
        pesoBruto: formatKgBR(pesoBrutoNum),
        pesoCubado: formatKgBR(pesoCubadoNum),
        pesoConsiderado: formatKgBR(pesoConsideradoNum),
        // O formulário atual tem um único "valor declarado" total; repetimos por caixa.
        valorDeclarado: normalizeBRLPlain((c && c.valorDeclarado) || d.valorDeclarado),
      };
    }),
    // Mantemos esses campos para compatibilidade com o front,
    // mas o payload encaminhado ao webhook será um "shape" resumido.
    pesoBruto: str(d.pesoBruto),
    pesoCubado: str(d.pesoCubado),
    pesoConsiderado: str(d.pesoConsiderado),
    valorDeclarado: str(d.valorDeclarado),
    valorDeclaradoNumero: num(d.valorDeclaradoNumero),
    seguro: str(d.seguro),
  };

  const forwardPayload = {
    body: {
      protocolo,
      dados: {
        protocolo,
        contato: dadosClean.contato,
        origem: dadosClean.origem,
        destino: dadosClean.destino,
        caixas: dadosClean.caixas,
      },
    },
  };
  const forwardBody = JSON.stringify(forwardPayload);

  console.log(`${tag} protocolo=${protocolo} caixas=${dadosClean.caixas.length} valor=${dadosClean.valorDeclaradoNumero}`);
  console.log(`${tag} payload enviado ao webhook:`, JSON.stringify(forwardPayload, null, 2));

  const startedAt = Date.now();
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

  const elapsedMs = Date.now() - startedAt;
  const text = await upstream.text();
  let upstreamJson = null;
  try {
    upstreamJson = text ? JSON.parse(text) : null;
  } catch {
    /* texto puro */
  }

  console.log(
    `${tag} resposta webhook: HTTP ${upstream.status} em ${elapsedMs}ms — corpo:`,
    upstreamJson !== null ? upstreamJson : (text || "(vazio)")
  );

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (!upstream.ok) {
    console.warn(`${tag} webhook respondeu com erro HTTP ${upstream.status}`);
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

  console.log(`${tag} << OK 200 protocolo=${protocolo}`);

  return res.end(
    JSON.stringify({
      success: true,
      protocolo,
      webhookStatus: upstream.status,
      webhookResponse: upstreamJson !== null ? upstreamJson : text || null,
    })
  );
}
