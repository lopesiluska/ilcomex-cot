/**
 * Formulário de cotação ILG COMEX — lógica de UI, máscaras, ViaCEP e envio (API/Vercel ou webhook direto).
 * Configure ILG_COTACAO_CONFIG no HTML antes deste script.
 */
(function () {
  "use strict";

  const CFG = window.ILG_COTACAO_CONFIG || {};

  const PAIS_LIST = [
    "África do Sul",
    "Alemanha",
    "Argentina",
    "Austrália",
    "Bélgica",
    "Bolívia",
    "Canadá",
    "Chile",
    "China",
    "Colômbia",
    "Coreia do Sul",
    "Dinamarca",
    "Equador",
    "Espanha",
    "Estados Unidos",
    "França",
    "Grécia",
    "Holanda",
    "Índia",
    "Indonésia",
    "Irlanda",
    "Itália",
    "Japão",
    "México",
    "Noruega",
    "Nova Zelândia",
    "Paraguai",
    "Peru",
    "Portugal",
    "Reino Unido",
    "Rússia",
    "Suécia",
    "Suíça",
    "Tailândia",
    "Turquia",
    "Uruguai",
    "Venezuela",
  ];

  function onlyDigits(s) {
    return String(s || "").replace(/\D/g, "");
  }

  /** CEP brasileiro: 00000-000 */
  function maskCep(value) {
    const d = onlyDigits(value).slice(0, 8);
    if (d.length <= 5) return d;
    return d.slice(0, 5) + "-" + d.slice(5);
  }

  /** Telefone BR: (00) 0000-0000 ou (00) 00000-0000 */
  function maskPhoneBR(value) {
    const d = onlyDigits(value).slice(0, 11);
    if (d.length === 0) return "";
    if (d.length <= 2) return "(" + d;
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10)
      return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return (
      "(" +
      d.slice(0, 2) +
      ") " +
      d.slice(2, 7) +
      "-" +
      d.slice(7, 11)
    );
  }

  /** Real brasileiro a partir de dígitos (centavos) */
  function formatBRLFromDigits(centsDigits) {
    if (!centsDigits) return "";
    const n = parseInt(centsDigits, 10);
    if (!n && n !== 0) return "";
    const reais = (n / 100).toFixed(2);
    const [intPart, frac] = reais.split(".");
    const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "R$ " + intFmt + "," + frac;
  }

  function parseBRLToNumber(str) {
    const d = onlyDigits(str);
    if (!d) return 0;
    return parseInt(d, 10) / 100;
  }

  function formatKg(n) {
    return (
      n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " kg"
    );
  }

  /** Interpreta texto exibido na UI (ex.: "1.234,56 kg"). */
  function parseKgFromUi(text) {
    const t = String(text)
      .replace(/\s*kg\s*$/i, "")
      .trim();
    if (!t) return 0;
    return parseFloat(t.replace(/\./g, "").replace(",", ".")) || 0;
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
  }

  const COTACAO_FETCH_TIMEOUT_MS = 295000;
  const LOADING_MSGS = [
    "Estamos registrando sua solicitação e preparando sua cotação.",
    "Calculando pesos e volumes das suas caixas.",
    "Consultando opções de envio internacional — isso pode levar até 5 minutos.",
    "Por favor, não feche esta página. Estamos finalizando o cadastro no sistema.",
    "Quase lá! Aguarde só mais um instante.",
  ];

  function parseWebhookResponse(wr) {
    if (wr == null) return null;
    if (typeof wr === "string") {
      const trimmed = wr.trim();
      if (!trimmed) return { _raw: wr };
      try {
        return JSON.parse(trimmed);
      } catch {
        return { _raw: wr };
      }
    }
    if (typeof wr === "object") return wr;
    return { _raw: wr };
  }

  function extrairResultadoCotacao(apiJson) {
    const empty = {
      urlCotacao: null,
      cadastroRealizado: null,
      testeOk: false,
      webhookValidado: false,
    };
    if (!apiJson || typeof apiJson !== "object") return empty;

    if (apiJson.testeOk === true) {
      return {
        urlCotacao: apiJson.urlCotacao ? String(apiJson.urlCotacao).trim() : null,
        cadastroRealizado: true,
        testeOk: true,
        webhookValidado: true,
      };
    }

    if (apiJson.webhookValidado === true && apiJson.success === true) {
      const wr = parseWebhookResponse(apiJson.webhookResponse);
      const nested = wr && wr.body && typeof wr.body === "object" ? wr.body : wr;
      const testeOk = !!(nested && nested.teste === "ok");
      return {
        urlCotacao: apiJson.urlCotacao ? String(apiJson.urlCotacao).trim() : null,
        cadastroRealizado:
          typeof apiJson.cadastroRealizado === "boolean"
            ? apiJson.cadastroRealizado
            : testeOk
              ? true
              : apiJson.success === true
                ? true
                : null,
        testeOk,
        webhookValidado: true,
      };
    }

    if (apiJson.urlCotacao != null || apiJson.cadastroRealizado != null) {
      return {
        urlCotacao: apiJson.urlCotacao ? String(apiJson.urlCotacao).trim() : null,
        cadastroRealizado:
          typeof apiJson.cadastroRealizado === "boolean"
            ? apiJson.cadastroRealizado
            : null,
        testeOk: false,
        webhookValidado: apiJson.success === true,
      };
    }

    const wr = parseWebhookResponse(apiJson.webhookResponse);
    if (wr == null) return empty;

    const nested = wr.body && typeof wr.body === "object" ? wr.body : wr;
    const testeOk = nested && nested.teste === "ok";
    const urlCotacao =
      (nested &&
        (nested.urlCotacao ||
          nested.url_cotacao ||
          nested.cotacaoUrl ||
          nested.cotacao_url ||
          nested.url ||
          nested.link)) ||
      wr.urlCotacao ||
      wr.url ||
      null;

    let cadastroRealizado = null;
    if (testeOk) cadastroRealizado = true;
    else if (nested && typeof nested.cadastroRealizado === "boolean") {
      cadastroRealizado = nested.cadastroRealizado;
    } else if (nested && typeof nested.cadastro_realizado === "boolean") {
      cadastroRealizado = nested.cadastro_realizado;
    } else if (nested && typeof nested.realizado === "boolean") {
      cadastroRealizado = nested.realizado;
    } else if (typeof wr.success === "boolean") {
      cadastroRealizado = wr.success;
    } else if (apiJson.success === true) {
      cadastroRealizado = true;
    }

    return {
      urlCotacao: urlCotacao ? String(urlCotacao).trim() : null,
      cadastroRealizado,
      testeOk: !!testeOk,
      webhookValidado: apiJson.success === true,
    };
  }

  async function enviarApiCotacao(protocolo, dados) {
    const url = (CFG.apiSubmitUrl || "").trim();
    if (!url) return { skipped: true };
    const body = { protocolo, dados };
    const controller = new AbortController();
    const timeoutId = setTimeout(function () {
      controller.abort();
    }, COTACAO_FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (e && e.name === "AbortError") {
        throw new Error(
          "A cotação demorou mais de 5 minutos. Tente novamente ou fale conosco pelo WhatsApp."
        );
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || "Erro " + res.status);
    }
    return json;
  }

  function getCaixas(caixasContainer) {
    return Array.from(caixasContainer.querySelectorAll(".box-card"));
  }

  function renumberBoxes(caixasContainer) {
    getCaixas(caixasContainer).forEach(function (el, i) {
      const h = el.querySelector(".box-card__title");
      if (h) h.textContent = "Caixa " + (i + 1);
    });
    const first = caixasContainer.querySelector(".btn-remove");
    const n = getCaixas(caixasContainer).length;
    if (first) {
      if (n <= 1) first.classList.add("hidden");
      else first.classList.remove("hidden");
    }
  }

  function calcularPesos(caixasContainer, els) {
    let pesoBrutoTotal = 0;
    let pesoCubadoTotal = 0;
    getCaixas(caixasContainer).forEach(function (caixa) {
      const alt =
        parseFloat(caixa.querySelector('input[name="altura[]"]').value) || 0;
      const larg =
        parseFloat(caixa.querySelector('input[name="largura[]"]').value) || 0;
      const comp =
        parseFloat(caixa.querySelector('input[name="comprimento[]"]').value) ||
        0;
      const peso =
        parseFloat(caixa.querySelector('input[name="peso[]"]').value) || 0;
      const cubado = (alt * larg * comp) / 5000;
      const considerado = Math.max(peso, cubado);

      pesoBrutoTotal += peso;
      pesoCubadoTotal += cubado;

      const outCubado = caixa.querySelector("[data-box-peso-cubado]");
      const outConsiderado = caixa.querySelector("[data-box-peso-considerado]");
      if (outCubado) outCubado.textContent = formatKg(cubado);
      if (outConsiderado) outConsiderado.textContent = formatKg(considerado);
    });
    const pesoConsiderado = Math.max(pesoBrutoTotal, pesoCubadoTotal);
    els.pesoBruto.textContent = formatKg(pesoBrutoTotal);
    els.pesoCubado.textContent = formatKg(pesoCubadoTotal);
    els.pesoConsiderado.textContent = formatKg(pesoConsiderado);
    if (pesoCubadoTotal > pesoBrutoTotal)
      els.alertaCubagem.classList.add("is-visible");
    else els.alertaCubagem.classList.remove("is-visible");
 }

  function collectFormData(form, caixasContainer) {
    const fd = new FormData(form);
    const caixas = getCaixas(caixasContainer).map(function (caixa, index) {
      const alt =
        parseFloat(caixa.querySelector('input[name="altura[]"]').value) || 0;
      const larg =
        parseFloat(caixa.querySelector('input[name="largura[]"]').value) || 0;
      const comp =
        parseFloat(caixa.querySelector('input[name="comprimento[]"]').value) ||
        0;
      const pesoNum =
        parseFloat(caixa.querySelector('input[name="peso[]"]').value) || 0;
      const cubado = (alt * larg * comp) / 5000;
      const considerado = Math.max(pesoNum, cubado);

      return {
        numero: index + 1,
        altura: caixa.querySelector('input[name="altura[]"]').value,
        largura: caixa.querySelector('input[name="largura[]"]').value,
        comprimento: caixa.querySelector('input[name="comprimento[]"]').value,
        peso: caixa.querySelector('input[name="peso[]"]').value,
        pesoBruto: formatKg(pesoNum),
        pesoCubado: formatKg(cubado),
        pesoConsiderado: formatKg(considerado),
        valorDeclarado: (
          caixa.querySelector('input[name="valorDeclaradoCaixa[]"]')?.value || ""
        ).trim(),
      };
    });
    const pesoBrutoText = document.getElementById("pesoBruto").textContent;
    const pesoCubadoText = document.getElementById("pesoCubado").textContent;
    const pesoConsideradoText =
      document.getElementById("pesoConsiderado").textContent;

    return {
      protocolo: "",
      contato: {
        nome: (fd.get("nome") || "").trim(),
        email: (fd.get("email") || "").trim(),
        telefone: (fd.get("telefone") || "").trim(),
        observacoes: (fd.get("observacoes") || "").trim(),
      },
      origem: {
        cep: (fd.get("cep") || "").trim(),
        cidade: (fd.get("cidade") || "").trim(),
        estado: (fd.get("estado") || "").trim(),
        pais: "Brasil",
      },
      destino: {
        cidade: (fd.get("cidadeDestino") || "").trim(),
        estado: (fd.get("estadoDestino") || "").trim(),
        cep: (fd.get("cepDestino") || "").trim(),
        pais: (fd.get("paisDestino") || "").trim(),
      },
      caixas: caixas,
      pesoBruto: pesoBrutoText,
      pesoCubado: pesoCubadoText,
      pesoConsiderado: pesoConsideradoText,
      valorDeclarado: (fd.get("valorDeclarado") || "").trim(),
      valorDeclaradoNumero: parseBRLToNumber(fd.get("valorDeclarado")),
      seguro: fd.get("seguro") || "",
    };
  }

  /**
   * Estrutura alinhada a campos customizados do Bitrix24 (ajuste UF_CRM_* ao seu CRM).
   * Para crm.deal.add / crm.lead.add use o objeto `fields` conforme documentação REST.
   */
  function buildBitrixPayload(dados, protocolo) {
    const seguroSim = dados.seguro === "sim";
    const opportunity = dados.valorDeclaradoNumero;
    const pesoBrutoNum = parseKgFromUi(dados.pesoBruto);
    const pesoCubadoNum = parseKgFromUi(dados.pesoCubado);
    const pesoConsideradoNum = parseKgFromUi(dados.pesoConsiderado);

    const linesCaixas = dados.caixas
      .map(function (c) {
        return (
          "  #" +
          c.numero +
          ": " +
          c.altura +
          "x" +
          c.largura +
          "x" +
          c.comprimento +
          " cm, " +
          c.peso +
          " kg"
        );
      })
      .join("\n");

    const comments =
      "Contato: " +
      dados.contato.nome +
      " | " +
      dados.contato.email +
      " | " +
      dados.contato.telefone +
      "\n" +
      "Origem: " +
      dados.origem.cidade +
      "/" +
      dados.origem.estado +
      " — CEP " +
      dados.origem.cep +
      "\n" +
      "Destino: " +
      dados.destino.cidade +
      "/" +
      dados.destino.estado +
      " — " +
      dados.destino.pais +
      " — Postal " +
      dados.destino.cep +
      "\n" +
      "Volumes:\n" +
      linesCaixas +
      "\n" +
      "Peso bruto: " +
      dados.pesoBruto +
      "\n" +
      "Peso cubado: " +
      dados.pesoCubado +
      "\n" +
      "Peso considerado: " +
      dados.pesoConsiderado +
      "\n" +
      "Valor declarado: " +
      dados.valorDeclarado +
      "\n" +
      "Seguro: " +
      (seguroSim ? "Sim" : "Não") +
      (dados.contato.observacoes
        ? "\nObs.: " + dados.contato.observacoes
        : "");

    return {
      entityType: CFG.bitrixEntityType || "DEAL",
      fields: {
        TITLE: "Cotação " + protocolo + " — " + dados.contato.nome,
        TYPE_ID: CFG.bitrixTypeId || "QUOTE",
        STAGE_ID: CFG.bitrixStageId || "NEW",
        OPENED: "Y",
        ASSIGNED_BY_ID: CFG.bitrixAssignedById || 1,
        CURRENCY_ID: "BRL",
        OPPORTUNITY: opportunity,
        COMMENTS: comments,
        UF_CRM_PROTOCOLO: protocolo,
        UF_CRM_ORIGEM_CEP: dados.origem.cep,
        UF_CRM_ORIGEM_CIDADE: dados.origem.cidade,
        UF_CRM_ORIGEM_ESTADO: dados.origem.estado,
        UF_CRM_ORIGEM_PAIS: dados.origem.pais,
        UF_CRM_DESTINO_CIDADE: dados.destino.cidade,
        UF_CRM_DESTINO_ESTADO: dados.destino.estado,
        UF_CRM_DESTINO_CEP: dados.destino.cep,
        UF_CRM_DESTINO_PAIS: dados.destino.pais,
        UF_CRM_PESO_BRUTO: pesoBrutoNum,
        UF_CRM_PESO_CUBADO: pesoCubadoNum,
        UF_CRM_PESO_CONSIDERADO: pesoConsideradoNum,
        UF_CRM_VALOR_DECLARADO: opportunity,
        UF_CRM_SEGURO: seguroSim ? "Y" : "N",
        UF_CRM_DATA_COTACAO: new Date().toISOString(),
        UF_CRM_CAIXAS_JSON: JSON.stringify(dados.caixas),
      },
    };
  }

  async function enviarBitrixWebhook(payload) {
    const url = CFG.bitrixInboundWebhookUrl;
    if (!url || typeof url !== "string") {
      console.info(
        "[ILG Cotação] Bitrix: defina ILG_COTACAO_CONFIG.bitrixInboundWebhookUrl para enviar automaticamente."
      );
      return { skipped: true };
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "ilg.cotacao.submitted",
        payload: payload,
        // Alguns handlers esperam `fields` no topo:
        fields: payload.fields,
      }),
    });
    if (!res.ok) throw new Error("Bitrix webhook HTTP " + res.status);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return { ok: true, text: await res.text() };
  }

  function bindBoxCard(caixaEl, caixasContainer, els, calcFn) {
    caixaEl.querySelectorAll(".dimensao, .peso").forEach(function (inp) {
      inp.addEventListener("input", calcFn);
    });
    const removeBtn = caixaEl.querySelector(".btn-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        caixaEl.remove();
        renumberBoxes(caixasContainer);
        calcFn();
      });
    }
  }

  function createBoxTemplate(index) {
    const wrap = document.createElement("div");
    wrap.className = "box-card";
    wrap.innerHTML =
      '<div class="box-card__top">' +
      '<h4 class="box-card__title">Caixa ' +
      index +
      '</h4>' +
      '<button type="button" class="btn-remove" aria-label="Remover caixa">' +
      '<i class="ri-delete-bin-line"></i>' +
      "</button>" +
      "</div>" +
      '<div class="dim-grid">' +
      '<div class="field"><label>Altura (cm)</label><div class="input-wrap">' +
      '<i class="ri-arrow-up-down-line"></i>' +
      '<input type="number" name="altura[]" class="dimensao" min="0" step="0.01" required placeholder="0">' +
      "</div></div>" +
      '<div class="field"><label>Largura (cm)</label><div class="input-wrap">' +
      '<i class="ri-arrow-left-right-line"></i>' +
      '<input type="number" name="largura[]" class="dimensao" min="0" step="0.01" required placeholder="0">' +
      "</div></div>" +
      '<div class="field"><label>Comprimento (cm)</label><div class="input-wrap">' +
      '<i class="ri-ruler-line"></i>' +
      '<input type="number" name="comprimento[]" class="dimensao" min="0" step="0.01" required placeholder="0">' +
      "</div></div>" +
      '<div class="field"><label>Peso (kg)</label><div class="input-wrap">' +
      '<i class="ri-scales-3-line"></i>' +
      '<input type="number" name="peso[]" class="peso" min="0" step="0.01" required placeholder="0">' +
      "</div></div>" +
      '<div class="field"><label>Valor declarado (caixa)</label><div class="input-wrap">' +
      '<i class="ri-price-tag-3-line"></i>' +
      '<input type="text" name="valorDeclaradoCaixa[]" class="money-brl" inputmode="numeric" placeholder="R$ 0,00" autocomplete="off">' +
      "</div></div>" +
      "</div>";
    wrap.innerHTML +=
      '<p class="field-hint box-metrics">Cubado: <strong data-box-peso-cubado>0,00 kg</strong> · Considerado: <strong data-box-peso-considerado>0,00 kg</strong></p>';
    return wrap;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("cotacaoForm");
    const caixasContainer = document.getElementById("caixasContainer");
    const paisSelect = document.getElementById("paisDestino");
    const cepInput = document.getElementById("cep");
    const cidadeInput = document.getElementById("cidade");
    const estadoInput = document.getElementById("estado");
    const cepStatus = document.getElementById("cepStatus");
    const moneyInputs = Array.from(document.querySelectorAll(".money-brl"));
    const telefoneInput = document.getElementById("telefone");
    const seguroSelect = document.getElementById("seguro");
    const mensagemSeguro = document.getElementById("mensagemSeguro");
    const modal = document.getElementById("modalAgradecimento");
    const linkWhats = document.getElementById("linkWhatsApp");
    const bitrixPreview = document.getElementById("bitrixPreview");
    const loadingEl = document.getElementById("loadingCotacao");
    const loadingMsgEl = document.getElementById("loadingCotacaoMsg");
    const submitBtn = document.getElementById("btnSubmitCotacao");
    const modalTitle = document.getElementById("modalTitle");
    const modalLead = document.getElementById("modalLead");
    const modalIconWrap = document.getElementById("modalIconWrap");
    const resumoCadastroRow = document.getElementById("resumoCadastroRow");
    const resumoCadastroTexto = document.getElementById("resumoCadastroTexto");
    const resumoCadastroErroRow = document.getElementById("resumoCadastroErroRow");
    const resumoCadastroErroTexto = document.getElementById("resumoCadastroErroTexto");
    const resumoUrlCotacaoRow = document.getElementById("resumoUrlCotacaoRow");
    const resumoUrlCotacao = document.getElementById("resumoUrlCotacao");

    let loadingMsgTimer = null;
    let loadingMsgIndex = 0;

    function showLoadingCotacao() {
      if (!loadingEl) return;
      document.body.style.overflow = "hidden";
      loadingMsgIndex = 0;
      if (loadingMsgEl) loadingMsgEl.textContent = LOADING_MSGS[0];
      loadingEl.classList.add("is-open");
      loadingEl.setAttribute("aria-hidden", "false");
      if (loadingMsgTimer) clearInterval(loadingMsgTimer);
      loadingMsgTimer = setInterval(function () {
        loadingMsgIndex = (loadingMsgIndex + 1) % LOADING_MSGS.length;
        if (loadingMsgEl) loadingMsgEl.textContent = LOADING_MSGS[loadingMsgIndex];
      }, 8000);
    }

    function hideLoadingCotacao() {
      document.body.style.overflow = "";
      if (loadingMsgTimer) {
        clearInterval(loadingMsgTimer);
        loadingMsgTimer = null;
      }
      if (!loadingEl) return;
      loadingEl.classList.remove("is-open");
      loadingEl.setAttribute("aria-hidden", "true");
    }

    function setFormSubmitting(busy) {
      if (submitBtn) {
        submitBtn.disabled = !!busy;
        submitBtn.textContent = busy
          ? "Processando cotação…"
          : "Enviar solicitação de cotação";
      }
    }

    function resetModalResultado() {
      if (resumoCadastroRow) resumoCadastroRow.hidden = true;
      if (resumoCadastroErroRow) resumoCadastroErroRow.hidden = true;
      if (resumoUrlCotacaoRow) resumoUrlCotacaoRow.hidden = true;
      if (modalIconWrap) {
        modalIconWrap.className = "modal__success";
        modalIconWrap.innerHTML = '<i class="ri-check-line"></i>';
      }
    }

    function aplicarResultadoModal(apiJson, erroMsg) {
      resetModalResultado();
      if (erroMsg) {
        if (modalTitle) modalTitle.textContent = "Não foi possível concluir";
        if (modalLead) modalLead.textContent = erroMsg;
        if (modalIconWrap) {
          modalIconWrap.className = "modal__success modal__success--err";
          modalIconWrap.innerHTML = '<i class="ri-close-line"></i>';
        }
        if (resumoCadastroErroRow && resumoCadastroErroTexto) {
          resumoCadastroErroRow.hidden = false;
          resumoCadastroErroTexto.textContent = erroMsg;
        }
        return;
      }

      const meta = extrairResultadoCotacao(apiJson);
      const cadastroOk = meta.cadastroRealizado === true;
      const cadastroFalhou = meta.cadastroRealizado === false;

      if (meta.testeOk) {
        if (modalTitle) modalTitle.textContent = "Integração validada!";
        if (modalLead) {
          modalLead.textContent =
            "O webhook respondeu corretamente. Sua solicitação foi registrada.";
        }
        if (resumoCadastroRow && resumoCadastroTexto) {
          resumoCadastroRow.hidden = false;
          resumoCadastroTexto.textContent = 'Webhook OK — resposta: { "teste": "ok" }';
        }
      } else if (cadastroOk) {
        if (modalTitle) modalTitle.textContent = "Cotação registrada!";
        if (modalLead) {
          modalLead.textContent =
            "Seu cadastro foi realizado com sucesso. Confira o link da cotação abaixo.";
        }
        if (resumoCadastroRow && resumoCadastroTexto) {
          resumoCadastroRow.hidden = false;
          resumoCadastroTexto.textContent = "Cadastro realizado com sucesso.";
        }
      } else if (cadastroFalhou) {
        if (modalTitle) modalTitle.textContent = "Solicitação recebida";
        if (modalLead) {
          modalLead.textContent =
            "Recebemos seus dados, mas não foi possível confirmar o cadastro automático. Nossa equipe dará sequência.";
        }
        if (resumoCadastroErroRow && resumoCadastroErroTexto) {
          resumoCadastroErroRow.hidden = false;
          resumoCadastroErroTexto.textContent =
            "Cadastro não confirmado pelo sistema. Entre em contato se precisar de urgência.";
        }
        if (modalIconWrap) {
          modalIconWrap.className = "modal__success modal__success--err";
          modalIconWrap.innerHTML = '<i class="ri-error-warning-line"></i>';
        }
      } else if (meta.webhookValidado) {
        if (modalTitle) modalTitle.textContent = "Solicitação enviada!";
        if (modalLead) {
          modalLead.textContent =
            "Recebemos a confirmação do webhook. Em breve retornamos com sua cotação.";
        }
        if (resumoCadastroRow && resumoCadastroTexto) {
          resumoCadastroRow.hidden = false;
          resumoCadastroTexto.textContent = "Webhook respondeu com sucesso.";
        }
      } else {
        if (modalTitle) modalTitle.textContent = "Obrigado!";
        if (modalLead) {
          modalLead.textContent =
            "Sua solicitação foi enviada. Em breve retornamos com sua cotação.";
        }
      }

      if (meta.urlCotacao && resumoUrlCotacaoRow && resumoUrlCotacao) {
        resumoUrlCotacaoRow.hidden = false;
        resumoUrlCotacao.href = meta.urlCotacao;
        resumoUrlCotacao.textContent = meta.urlCotacao;
      }
    }

    function abrirModalAgradecimento() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
    }

    const els = {
      pesoBruto: document.getElementById("pesoBruto"),
      pesoCubado: document.getElementById("pesoCubado"),
      pesoConsiderado: document.getElementById("pesoConsiderado"),
      alertaCubagem: document.getElementById("alertaCubagem"),
    };

    PAIS_LIST.forEach(function (p) {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p;
      paisSelect.appendChild(o);
    });

    const calcFn = function () {
      calcularPesos(caixasContainer, els);
    };

    getCaixas(caixasContainer).forEach(function (card) {
      bindBoxCard(card, caixasContainer, els, calcFn);
    });
    renumberBoxes(caixasContainer);
    calcFn();

    document.getElementById("adicionarCaixa").addEventListener("click", function () {
      const n = getCaixas(caixasContainer).length + 1;
      const card = createBoxTemplate(n);
      caixasContainer.appendChild(card);
      bindBoxCard(card, caixasContainer, els, calcFn);
      bindMoneyInput(card.querySelector(".money-brl"));
      renumberBoxes(caixasContainer);
      calcFn();
    });

    cepInput.addEventListener("input", function () {
      const cur = cepInput.selectionStart;
      const before = cepInput.value;
      cepInput.value = maskCep(cepInput.value);
      if (cepStatus) {
        cepStatus.textContent = "";
        cepStatus.className = "cep-status";
      }
    });

    const buscarCep = debounce(function () {
      const raw = onlyDigits(cepInput.value);
      if (raw.length !== 8) return;
      if (cepStatus) {
        cepStatus.textContent = "…";
        cepStatus.className = "cep-status is-loading";
      }
      fetch("https://viacep.com.br/ws/" + raw + "/json/")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.erro) {
            cidadeInput.value = "";
            estadoInput.value = "";
            if (cepStatus) {
              cepStatus.textContent = "!";
              cepStatus.className = "cep-status is-error";
            }
            return;
          }
          cidadeInput.value = data.localidade || "";
          estadoInput.value = data.uf || "";
          if (cepStatus) {
            cepStatus.textContent = "";
            cepStatus.className = "cep-status";
          }
        })
        .catch(function (err) {
          console.error(err);
          if (cepStatus) {
            cepStatus.textContent = "!";
            cepStatus.className = "cep-status is-error";
          }
        });
    }, 400);

    cepInput.addEventListener("blur", buscarCep);

    if (telefoneInput) {
      telefoneInput.addEventListener("input", function () {
        telefoneInput.value = maskPhoneBR(telefoneInput.value);
      });
    }

    function bindMoneyInput(inp) {
      if (!inp) return;
      inp.addEventListener("input", function () {
        const digits = onlyDigits(inp.value);
        inp.value = formatBRLFromDigits(digits);
      });
    }
    moneyInputs.forEach(bindMoneyInput);

    seguroSelect.addEventListener("change", function () {
      mensagemSeguro.hidden = false;
      if (seguroSelect.value === "sim")
        mensagemSeguro.textContent =
          "O valor declarado é o valor assegurado em caso de dano, perda ou extravio.";
      else if (seguroSelect.value === "nao")
        mensagemSeguro.textContent =
          "Sem seguro, em caso de dano, perda ou extravio não haverá ressarcimento pelo valor declarado.";
      else mensagemSeguro.hidden = true;
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const apiUrl = (CFG.apiSubmitUrl || "").trim();
      if (apiUrl && submitBtn && submitBtn.disabled) return;

      const protocolo =
        (CFG.protocolPrefix || "ILG") +
        String(Date.now()).slice(-8);

      const dados = collectFormData(form, caixasContainer);
      dados.protocolo = protocolo;

      const bitrixPayload = buildBitrixPayload(dados, protocolo);

      document.getElementById("resumoOrigem").textContent =
        dados.origem.cidade + "/" + dados.origem.estado;
      document.getElementById("resumoDestino").textContent =
        dados.destino.cidade + "/" + dados.destino.pais;
      document.getElementById("resumoCaixas").textContent = String(
        dados.caixas.length
      );
      document.getElementById("resumoPeso").textContent =
        dados.pesoConsiderado;
      document.getElementById("resumoValor").textContent =
        dados.valorDeclarado;
      document.getElementById("resumoProtocolo").textContent = protocolo;

      const waPhone = CFG.whatsappE164 || "5562998666000";
      const waText =
        CFG.whatsappMessageTemplate ||
        "Olá! Minha solicitação de cotação é {protocolo}.";
      const msg = waText.replace(/\{protocolo\}/g, protocolo);
      linkWhats.href =
        "https://api.whatsapp.com/send?phone=" +
        onlyDigits(waPhone) +
        "&text=" +
        encodeURIComponent(msg);

      if (bitrixPreview)
        bitrixPreview.textContent = JSON.stringify(
          { cotacao: dados, bitrix: bitrixPayload },
          null,
          2
        );

      console.log("[ILG Cotação] dados:", dados);
      console.log("[ILG Cotação] bitrix:", bitrixPayload);

      const resumoBitrixRow = document.getElementById("resumoBitrixCotacaoRow");
      const resumoBitrix = document.getElementById("resumoBitrixCotacao");
      if (resumoBitrixRow && resumoBitrix) {
        resumoBitrixRow.style.display = "none";
        resumoBitrix.textContent = "";
      }

      if (apiUrl) {
        resetModalResultado();
        setFormSubmitting(true);
        showLoadingCotacao();

        enviarApiCotacao(protocolo, dados)
          .then(function (r) {
            if (bitrixPreview) bitrixPreview.textContent = JSON.stringify(r, null, 2);
            if (r && r.bitrixDealId && resumoBitrixRow && resumoBitrix) {
              resumoBitrixRow.style.display = "";
              resumoBitrix.textContent = "Negócio ID " + r.bitrixDealId;
            }
            aplicarResultadoModal(r, null);
            abrirModalAgradecimento();
          })
          .catch(function (err) {
            aplicarResultadoModal(null, err.message || String(err));
            abrirModalAgradecimento();
          })
          .finally(function () {
            hideLoadingCotacao();
            setFormSubmitting(false);
          });
      } else {
        enviarBitrixWebhook(bitrixPayload)
          .then(function (r) {
            if (r && !r.skipped) console.log("[ILG Cotação] Bitrix resposta:", r);
          })
          .catch(function (err) {
            console.error("[ILG Cotação] Bitrix erro:", err);
          });
        resetModalResultado();
        if (modalTitle) modalTitle.textContent = "Obrigado!";
        if (modalLead) {
          modalLead.textContent =
            "Em breve retornamos com sua cotação. Guarde o protocolo abaixo.";
        }
        abrirModalAgradecimento();
      }
    });

    linkWhats.addEventListener("click", function () {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      form.reset();
      cidadeInput.value = "";
      estadoInput.value = "";
      mensagemSeguro.hidden = true;
      if (cepStatus) {
        cepStatus.textContent = "";
        cepStatus.className = "cep-status";
      }
      while (getCaixas(caixasContainer).length > 1) {
        caixasContainer.removeChild(caixasContainer.lastElementChild);
      }
      renumberBoxes(caixasContainer);
      calcFn();
    });
  });
})();
