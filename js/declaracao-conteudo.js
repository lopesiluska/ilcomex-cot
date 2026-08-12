/**
 * Declaração de conteúdo ILG COMEX — máscaras, ViaCEP, tabelas dinâmicas, XML, Bitrix.
 * Configure window.ILG_DECLARACAO_CONFIG no HTML.
 */
(function () {
  "use strict";

  var CFG = window.ILG_DECLARACAO_CONFIG || {};
  var FATOR_CUBAGEM = 6000;

  function getIdCotacaoFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var id =
        params.get("id") ||
        params.get("id_cotacao") ||
        params.get("idCotacao") ||
        params.get("cotacaoId") ||
        "";
      return String(id || "").trim();
    } catch (e) {
      return "";
    }
  }

  function onlyDigits(s) {
    return String(s || "").replace(/\D/g, "");
  }

  function maskCep(v) {
    var d = onlyDigits(v).slice(0, 8);
    if (d.length <= 5) return d;
    return d.slice(0, 5) + "-" + d.slice(5);
  }

  function maskPhoneBR(v) {
    var d = onlyDigits(v).slice(0, 11);
    if (!d.length) return "";
    if (d.length <= 2) return "(" + d;
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10)
      return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return (
      "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7, 11)
    );
  }

  function maskCpfCnpj(v) {
    var d = onlyDigits(v).slice(0, 14);
    if (d.length <= 11) {
      if (d.length <= 3) return d;
      if (d.length <= 6) return d.slice(0, 3) + "." + d.slice(3);
      if (d.length <= 9)
        return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
      return (
        d.slice(0, 3) +
        "." +
        d.slice(3, 6) +
        "." +
        d.slice(6, 9) +
        "-" +
        d.slice(9, 11)
      );
    }
    if (d.length <= 12)
      return (
        d.slice(0, 2) +
        "." +
        d.slice(2, 5) +
        "." +
        d.slice(5, 8) +
        "/" +
        d.slice(8, 12)
      );
    return (
      d.slice(0, 2) +
      "." +
      d.slice(2, 5) +
      "." +
      d.slice(5, 8) +
      "/" +
      d.slice(8, 12) +
      "-" +
      d.slice(12, 14)
    );
  }

  function formatBRLFromDigits(centsDigits) {
    if (!centsDigits) return "";
    var n = parseInt(centsDigits, 10);
    if (isNaN(n)) return "";
    var reais = (n / 100).toFixed(2);
    var parts = reais.split(".");
    var intFmt = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "R$ " + intFmt + "," + parts[1];
  }

  function parseBRL(str) {
    var d = onlyDigits(str);
    if (!d) return 0;
    return parseInt(d, 10) / 100;
  }

  function buildFetchTroubleshootingMessage(apiUrl, err) {
    var base = (err && err.message) ? err.message : String(err);
    var lines = ["Falha ao enviar para a API (failed to fetch)."];
    if (apiUrl) lines.push("URL: " + apiUrl);
    lines.push("");
    lines.push("Causas comuns:");
    if (window.location && window.location.protocol === "file:") {
      lines.push("- Você abriu o HTML via file://. Rode um servidor HTTP (ex.: npx vercel dev) e abra via http://.");
    }
    lines.push("- O endpoint da API não está acessível (404/500) ou a URL está errada.");
    lines.push("- Mixed content: página em https:// chamando API em http:// (o navegador bloqueia).");
    lines.push("- CORS bloqueado se estiver em domínios/portas diferentes.");
    lines.push("");
    lines.push("Detalhe: " + base);
    return lines.join("\n");
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var s = reader.result;
        if (typeof s !== "string") {
          reject(new Error("Leitura inválida."));
          return;
        }
        var comma = s.indexOf(",");
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      reader.onerror = function () {
        reject(new Error("Falha ao ler arquivo."));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Fotos para envio na API (limite total ~2 MB binário; Vercel ~4.5 MB no request).
   */
  function collectFotosPayload(input, opts) {
    var maxFiles = (opts && opts.maxFiles) || 15;
    var maxTotal = (opts && opts.maxTotalBytes) || 2 * 1024 * 1024;
    var files = input && input.files ? input.files : null;
    var n = files ? files.length : 0;
    if (!n) return Promise.resolve([]);
    if (n > maxFiles) {
      return Promise.reject(
        new Error("No máximo " + maxFiles + " fotos podem ser enviadas de uma vez.")
      );
    }
    var total = 0;
    for (var i = 0; i < n; i++) {
      total += files[i].size || 0;
    }
    if (total > maxTotal) {
      return Promise.reject(
        new Error(
          "Fotos excedem cerca de " +
            Math.round(maxTotal / (1024 * 1024)) +
            " MB no total (limite para envio). Comprima as imagens ou envie menos arquivos."
        )
      );
    }
    var tasks = [];
    for (var j = 0; j < n; j++) {
      (function (file, index) {
        var name = file.name || "foto_" + index;
        var mime = file.type || "application/octet-stream";
        tasks.push(
          readFileAsBase64(file).then(function (base64) {
            return { name: name, mimeType: mime, base64: base64 };
          })
        );
      })(files[j], j);
    }
    return Promise.all(tasks);
  }

  function base64ToBlob(b64, mime) {
    var bin = atob(b64);
    var len = bin.length;
    var arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || "application/octet-stream" });
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
  }

  function formatKg(n) {
    return (
      n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " kg"
    );
  }

  function checkDescricaoProduto(inputElem) {
    var descricao = inputElem.value.trim();
    var lower = descricao.toLowerCase();
    if (lower.indexOf("conjunto") !== -1) {
      alert(
        "Descreva melhor o que faz parte deste conjunto. Ex.: calcinha e sutiã, blusa e calça, top e saia, etc."
      );
    } else if (descricao.length > 0 && descricao.length < 5) {
      alert(
        "Verifique se a descrição está correta e bem detalhada. Ela será usada em documentos alfandegários."
      );
    }
  }

  function produtoRowCount() {
    return document.querySelectorAll("#remessaTable tbody tr").length;
  }

  function volumeRowCount() {
    return document.querySelectorAll("#volumeTable tbody tr").length;
  }

  function updateRemoveProdButtons() {
    var n = produtoRowCount();
    document.querySelectorAll("#remessaTable .remove-prod").forEach(function (btn) {
      btn.disabled = n <= 1;
      btn.classList.toggle("is-disabled", n <= 1);
    });
  }

  function updateRemoveVolumeButtons() {
    var n = volumeRowCount();
    document.querySelectorAll("#volumeTable .remove-volume").forEach(function (btn) {
      btn.disabled = n <= 1;
      btn.classList.toggle("is-disabled", n <= 1);
    });
  }

  function recalcRemessaRow(row) {
    var q =
      parseInt(row.querySelector(".quantidade").value, 10) || 0;
    var vu = parseBRL(row.querySelector(".valor-unitario").value);
    var total = q * vu;
    row.querySelector(".valor-total").value = formatBRLFromDigits(
      String(Math.round(total * 100))
    );
  }

  function updateRemessaTotals() {
    var totalQ = 0;
    var totalV = 0;
    document.querySelectorAll("#remessaTable tbody tr").forEach(function (row) {
      var q =
        parseInt(row.querySelector(".quantidade").value, 10) || 0;
      var vt = parseBRL(row.querySelector(".valor-total").value);
      totalQ += q;
      totalV += vt;
    });
    document.getElementById("totalQuantidade").textContent = String(totalQ);
    document.getElementById("totalValorTotal").textContent =
      totalV.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  }

  function recalcVolumeRow(row) {
    var alt = parseFloat(row.querySelector(".altura").value) || 0;
    var larg = parseFloat(row.querySelector(".largura").value) || 0;
    var comp = parseFloat(row.querySelector(".comprimento").value) || 0;
    var cub = (alt * larg * comp) / FATOR_CUBAGEM;
    row.querySelector(".peso-cubado").textContent = cub.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function updateVolumeTotals() {
    var totalBruto = 0;
    var totalCub = 0;
    document.querySelectorAll("#volumeTable tbody tr").forEach(function (row) {
      var pb = parseFloat(row.querySelector(".peso-bruto").value) || 0;
      var cell = row.querySelector(".peso-cubado").textContent.trim();
      var pc = parseFloat(cell.replace(/\./g, "").replace(",", ".")) || 0;
      totalBruto += pb;
      totalCub += pc;
    });
    document.getElementById("totalPesoBruto").textContent = formatKg(totalBruto);
    document.getElementById("totalPesoCubado").textContent = formatKg(totalCub);
    var considerado = Math.max(totalBruto, totalCub);
    document.getElementById("pesoConsiderado").textContent =
      formatKg(considerado);
    var msg = document.getElementById("mensagemVolume");
    if (totalCub > totalBruto) msg.classList.add("is-visible");
    else msg.classList.remove("is-visible");
  }

  function bindValorUnitario(input) {
    input.addEventListener("input", function () {
      var d = onlyDigits(input.value);
      input.value = formatBRLFromDigits(d);
    });
  }

  function bindQuantidade(input) {
    input.addEventListener("input", function () {
      input.value = onlyDigits(input.value).slice(0, 8);
    });
  }

  function gerarChaveNFe() {
    var cUF = "42";
    var anoMes =
      new Date().getFullYear().toString().substr(2, 2) +
      String(new Date().getMonth() + 1).padStart(2, "0");
    var cnpj = "12345678000195";
    var mod = "55";
    var serie = "001";
    var nNF = String(Math.floor(Math.random() * 1000000)).padStart(9, "0");
    var tpEmis = "1";
    var cNF = String(Math.floor(Math.random() * 1000000)).padStart(8, "0");
    var chave = cUF + anoMes + cnpj + mod + serie + nNF + tpEmis + cNF;
    var soma = 0;
    var peso = 2;
    for (var i = chave.length - 1; i >= 0; i--) {
      soma += parseInt(chave.charAt(i), 10) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    var resto = soma % 11;
    var dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
    return chave + dv;
  }

  function formatarXML(xml) {
    var PADDING = "  ";
    var reg = /(>)(<)(\/*)/g;
    var pad = 0;
    xml = xml.replace(reg, "$1\r\n$2$3");
    return xml
      .split("\r\n")
      .map(function (node) {
        var indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) indent = 0;
        else if (node.match(/^<\/\w/) && pad !== 0) pad -= 1;
        else if (node.match(/^<\w[^>]*[^\/]>.*$/)) indent = 1;
        else indent = 0;
        pad += indent;
        return PADDING.repeat(Math.max(0, pad - indent)) + node;
      })
      .join("\r\n");
  }

  function gerarXMLNFe(dados) {
    var dataAtual = new Date();
    var chaveNFe = gerarChaveNFe();
    var docId = dados.remetente.cpfCnpj.replace(/\D/g, "");
    var xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">\n' +
      '  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">\n' +
      '    <infNFe versao="4.00" Id="NFe' +
      chaveNFe +
      '">\n' +
      "      <ide>\n" +
      "        <cUF>42</cUF>\n" +
      "        <cNF>" +
      chaveNFe.substring(35, 43) +
      "</cNF>\n" +
      "        <natOp>Declaração de Conteúdo</natOp>\n" +
      "        <mod>55</mod>\n" +
      "        <serie>0</serie>\n" +
      "        <nNF>" +
      Math.floor(Math.random() * 100000) +
      "</nNF>\n" +
      "        <dhEmi>" +
      dataAtual.toISOString() +
      "</dhEmi>\n" +
      "        <tpNF>1</tpNF>\n" +
      "        <idDest>1</idDest>\n" +
      "        <cMunFG>4219309</cMunFG>\n" +
      "        <tpImp>1</tpImp>\n" +
      "        <tpEmis>1</tpEmis>\n" +
      "        <cDV>" +
      chaveNFe.substring(43, 44) +
      "</cDV>\n" +
      "        <tpAmb>2</tpAmb>\n" +
      "        <finNFe>1</finNFe>\n" +
      "        <indFinal>1</indFinal>\n" +
      "        <indPres>9</indPres>\n" +
      "        <procEmi>0</procEmi>\n" +
      "        <verProc>ILG COMEX Declaração de Conteúdo</verProc>\n" +
      "      </ide>\n" +
      "      <emit>\n" +
      "        <CNPJ>" +
      docId +
      "</CNPJ>\n" +
      "        <xNome>" +
      esc(dados.remetente.nome) +
      "</xNome>\n" +
      "        <enderEmit>\n" +
      "          <xLgr>" +
      esc(dados.remetente.endereco) +
      "</xLgr>\n" +
      "          <nro>SN</nro>\n" +
      "          <xBairro>Centro</xBairro>\n" +
      "          <cMun>4219309</cMun>\n" +
      "          <xMun>" +
      esc(dados.remetente.cidade) +
      "</xMun>\n" +
      "          <UF>" +
      esc(dados.remetente.estado) +
      "</UF>\n" +
      "          <CEP>" +
      onlyDigits(dados.remetente.cep) +
      "</CEP>\n" +
      "          <cPais>1058</cPais>\n" +
      "          <xPais>" +
      esc(dados.remetente.pais) +
      "</xPais>\n" +
      "          <fone>" +
      onlyDigits(dados.remetente.telefone) +
      "</fone>\n" +
      "        </enderEmit>\n" +
      "        <IE>ISENTO</IE>\n" +
      "        <CRT>3</CRT>\n" +
      "      </emit>\n" +
      "      <dest>\n" +
      "        <xNome>" +
      esc(dados.destinatario.nome) +
      "</xNome>\n";

    if (dados.destinatario.taxId) {
      xml +=
        "        <CNPJ>" +
        onlyDigits(dados.destinatario.taxId) +
        "</CNPJ>\n";
    }

    xml +=
      "        <enderDest>\n" +
      "          <xLgr>" +
      esc(dados.destinatario.endereco) +
      "</xLgr>\n" +
      "          <nro>SN</nro>\n" +
      "          <xBairro>Centro</xBairro>\n" +
      "          <cMun>0000000</cMun>\n" +
      "          <xMun>" +
      esc(dados.destinatario.cidade) +
      "</xMun>\n" +
      "          <UF>" +
      esc(dados.destinatario.estado || "EX") +
      "</UF>\n" +
      "          <CEP>" +
      (dados.destinatario.postal
        ? onlyDigits(dados.destinatario.postal)
        : "00000000") +
      "</CEP>\n" +
      "          <cPais>" +
      (dados.destinatario.pais === "Brasil" ? "1058" : "9999") +
      "</cPais>\n" +
      "          <xPais>" +
      esc(dados.destinatario.pais || "Exterior") +
      "</xPais>\n" +
      "          <fone>" +
      onlyDigits(dados.destinatario.telefone) +
      "</fone>\n" +
      "        </enderDest>\n" +
      "        <indIEDest>9</indIEDest>\n" +
      "      </dest>\n" +
      '      <det nItem="1">\n' +
      "        <prod>\n" +
      "          <cProd>DECLARACAO</cProd>\n" +
      "          <xProd>Declaração de Conteúdo</xProd>\n" +
      "          <NCM>99999999</NCM>\n" +
      "          <CFOP>6900</CFOP>\n" +
      "          <uCom>UN</uCom>\n" +
      "          <qCom>1.0000</qCom>\n" +
      "          <vUnCom>0.00</vUnCom>\n" +
      "          <vProd>0.00</vProd>\n" +
      "          <cEAN>SEM GTIN</cEAN>\n" +
      "          <uTrib>UN</uTrib>\n" +
      "          <qTrib>1.0000</qTrib>\n" +
      "          <vUnTrib>0.00</vUnTrib>\n" +
      "          <indTot>1</indTot>\n" +
      "        </prod>\n" +
      "        <imposto>\n" +
      "          <vTotTrib>0.00</vTotTrib>\n" +
      "          <ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>0.00</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00></ICMS>\n" +
      "          <PIS><PISNT><CST>07</CST></PISNT></PIS>\n" +
      "          <COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>\n" +
      "        </imposto>\n" +
      "      </det>\n";

    dados.produtos.forEach(function (produto) {
      xml +=
        '      <det nItem="' +
        (produto.nItem + 1) +
        '">\n' +
        "        <prod>\n" +
        "          <cProd>PROD" +
        produto.nItem +
        "</cProd>\n" +
        "          <xProd>" +
        esc(produto.descricao) +
        "</xProd>\n" +
        "          <NCM>99999999</NCM>\n" +
        "          <CFOP>6900</CFOP>\n" +
        "          <uCom>UN</uCom>\n" +
        "          <qCom>" +
        produto.quantidade.toFixed(4) +
        "</qCom>\n" +
        "          <vUnCom>" +
        produto.valorUnitario.toFixed(2) +
        "</vUnCom>\n" +
        "          <vProd>" +
        produto.valorTotal.toFixed(2) +
        "</vProd>\n" +
        "          <cEAN>SEM GTIN</cEAN>\n" +
        "          <uTrib>UN</uTrib>\n" +
        "          <qTrib>" +
        produto.quantidade.toFixed(4) +
        "</qTrib>\n" +
        "          <vUnTrib>" +
        produto.valorUnitario.toFixed(2) +
        "</vUnTrib>\n" +
        "          <indTot>1</indTot>\n" +
        "        </prod>\n" +
        "        <imposto>\n" +
        "          <vTotTrib>0.00</vTotTrib>\n" +
        "          <ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>" +
        produto.valorTotal.toFixed(2) +
        "</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00></ICMS>\n" +
        "          <PIS><PISNT><CST>07</CST></PISNT></PIS>\n" +
        "          <COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>\n" +
        "        </imposto>\n" +
        "      </det>\n";
    });

    var totalProdutos = dados.produtos.reduce(function (s, p) {
      return s + p.valorTotal;
    }, 0);

    xml +=
      "      <total>\n" +
      "        <ICMSTot>\n" +
      "          <vBC>" +
      totalProdutos.toFixed(2) +
      "</vBC>\n" +
      "          <vICMS>0.00</vICMS>\n" +
      "          <vICMSDeson>0.00</vICMSDeson>\n" +
      "          <vFCP>0.00</vFCP>\n" +
      "          <vBCST>0.00</vBCST>\n" +
      "          <vST>0.00</vST>\n" +
      "          <vFCPST>0.00</vFCPST>\n" +
      "          <vFCPSTRet>0.00</vFCPSTRet>\n" +
      "          <vProd>" +
      totalProdutos.toFixed(2) +
      "</vProd>\n" +
      "          <vFrete>0.00</vFrete>\n" +
      "          <vSeg>0.00</vSeg>\n" +
      "          <vDesc>0.00</vDesc>\n" +
      "          <vII>0.00</vII>\n" +
      "          <vIPI>0.00</vIPI>\n" +
      "          <vIPIDevol>0.00</vIPIDevol>\n" +
      "          <vPIS>0.00</vPIS>\n" +
      "          <vCOFINS>0.00</vCOFINS>\n" +
      "          <vOutro>0.00</vOutro>\n" +
      "          <vNF>" +
      totalProdutos.toFixed(2) +
      "</vNF>\n" +
      "          <vTotTrib>0.00</vTotTrib>\n" +
      "        </ICMSTot>\n" +
      "      </total>\n" +
      "      <transp><modFrete>9</modFrete></transp>\n" +
      "      <infAdic>\n" +
      "        <infCpl>Declaração de Conteúdo ILG COMEX — " +
      esc(dataAtual.toLocaleDateString("pt-BR")) +
      "</infCpl>\n" +
      "      </infAdic>\n" +
      "    </infNFe>\n" +
      "  </NFe>\n" +
      "</nfeProc>";

    return formatarXML(xml);
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function coletarFotosMeta(input) {
    var files = input.files;
    var list = [];
    for (var i = 0; i < files.length; i++) {
      list.push({
        name: files[i].name,
        size: files[i].size,
        type: files[i].type,
      });
    }
    return list;
  }

  function coletarDadosFormulario() {
    var ag = document.getElementById("agendamentoColeta").checked;
    var mesmo =
      document.querySelector('input[name="mesmoEndereco"]:checked') || {};
    var dados = {
      remetente: {
        nome: document.getElementById("remetenteNome").value.trim(),
        cpfCnpj: document.getElementById("remetenteCPF").value.trim(),
        endereco: document.getElementById("remetenteEndereco").value.trim(),
        cidade: document.getElementById("remetenteCidade").value.trim(),
        estado: document.getElementById("remetenteEstado").value.trim(),
        cep: document.getElementById("remetenteCEP").value.trim(),
        pais: document.getElementById("remetentePais").value.trim(),
        telefone: document.getElementById("remetenteTelefone").value.trim(),
        email: document.getElementById("remetenteEmail").value.trim(),
      },
      coleta: {
        agendamento: ag,
        mesmoEndereco: ag ? mesmo.value || null : null,
        endereco: document.getElementById("coletaEndereco").value.trim(),
        cidade: document.getElementById("coletaCidade").value.trim(),
        estado: document.getElementById("coletaEstado").value.trim(),
        cep: document.getElementById("coletaCEP").value.trim(),
        responsavel: document.getElementById("responsavelColeta").value.trim(),
        telefone: document.getElementById("telefoneColeta").value.trim(),
      },
      destinatario: {
        nome: document.getElementById("destinatarioNome").value.trim(),
        taxId: document.getElementById("destinatarioTaxID").value.trim(),
        endereco: document.getElementById("destinatarioEndereco").value.trim(),
        cidade: document.getElementById("destinatarioCidade").value.trim(),
        estado: document.getElementById("destinatarioEstado").value.trim(),
        postal: document.getElementById("destinatarioPostal").value.trim(),
        pais: document.getElementById("destinatarioPais").value.trim(),
        telefone: document.getElementById("destinatarioTelefone").value.trim(),
        email: document.getElementById("destinatarioEmail").value.trim(),
      },
      produtos: [],
      volumes: [],
      fotos: coletarFotosMeta(document.getElementById("fotosCaixa")),
      dataHora: new Date().toISOString(),
    };

    document.querySelectorAll("#remessaTable tbody tr").forEach(function (
      row,
      index
    ) {
      var desc = row.querySelector(".descricao-prod").value.trim();
      var quantidade =
        parseInt(row.querySelector(".quantidade").value, 10) || 0;
      var valorUnitario = parseBRL(row.querySelector(".valor-unitario").value);
      var valorTotal = parseBRL(row.querySelector(".valor-total").value);
      if (desc && quantidade > 0) {
        dados.produtos.push({
          nItem: index + 1,
          descricao: desc,
          quantidade: quantidade,
          valorUnitario: valorUnitario,
          valorTotal: valorTotal,
        });
      }
    });

    document.querySelectorAll("#volumeTable tbody tr").forEach(function (row) {
      var id = row.querySelector(".volume-id").value.trim();
      var alt = parseFloat(row.querySelector(".altura").value) || 0;
      var larg = parseFloat(row.querySelector(".largura").value) || 0;
      var comp = parseFloat(row.querySelector(".comprimento").value) || 0;
      var pesoBruto = parseFloat(row.querySelector(".peso-bruto").value) || 0;
      var pcText = row.querySelector(".peso-cubado").textContent.trim();
      var pesoCubado =
        parseFloat(pcText.replace(/\./g, "").replace(",", ".")) || 0;
      if (id) {
        dados.volumes.push({
          identificador: id,
          altura: alt,
          largura: larg,
          comprimento: comp,
          pesoBruto: pesoBruto,
          pesoCubado: pesoCubado,
        });
      }
    });

    return dados;
  }

  function validateColeta(dados) {
    if (!dados.coleta.agendamento) return true;
    if (dados.coleta.mesmoEndereco === "nao") {
      return (
        dados.coleta.endereco &&
        dados.coleta.cidade &&
        dados.coleta.estado &&
        dados.coleta.cep &&
        dados.coleta.responsavel &&
        dados.coleta.telefone
      );
    }
    return true;
  }

  function buildBitrixPayload(dados, protocolo, xmlResumo) {
    var totalMercadoria = dados.produtos.reduce(function (s, p) {
      return s + p.valorTotal;
    }, 0);
    var pesoC = dados.volumes.reduce(function (s, v) {
      return s + v.pesoBruto;
    }, 0);
    var pesoCub = dados.volumes.reduce(function (s, v) {
      return s + v.pesoCubado;
    }, 0);
    var considerado = Math.max(pesoC, pesoCub);

    var comments =
      "DECLARAÇÃO DE CONTEÚDO " +
      protocolo +
      "\n\nRemetente: " +
      dados.remetente.nome +
      " — " +
      dados.remetente.cpfCnpj +
      "\n" +
      dados.remetente.endereco +
      ", " +
      dados.remetente.cidade +
      "/" +
      dados.remetente.estado +
      " — CEP " +
      dados.remetente.cep +
      "\n" +
      dados.remetente.telefone +
      " | " +
      dados.remetente.email;

 if (dados.coleta.agendamento) {
      comments += "\n\nColeta: agendada. Mesmo endereço do remetente: " +
        (dados.coleta.mesmoEndereco === "sim" ? "Sim" : "Não");
      if (dados.coleta.mesmoEndereco === "nao") {
        comments +=
          "\nEnd. coleta: " +
          dados.coleta.endereco +
          ", " +
          dados.coleta.cidade +
          "/" +
          dados.coleta.estado +
          " — " +
          dados.coleta.cep +
          "\nResp.: " +
          dados.coleta.responsavel +
          " — " +
          dados.coleta.telefone;
      }
    }

    comments +=
      "\n\nDestinatário: " +
      dados.destinatario.nome +
      "\n" +
      dados.destinatario.endereco +
      ", " +
      dados.destinatario.cidade +
      "\n" +
      (dados.destinatario.pais || "") +
      " — Postal: " +
      (dados.destinatario.postal || "") +
      "\n" +
      dados.destinatario.telefone +
      " | " +
      dados.destinatario.email;

    comments +=
      "\n\nItens: " +
      dados.produtos.length +
      " | Volumes: " +
      dados.volumes.length +
      "\nValor total mercadoria: R$ " +
      totalMercadoria.toFixed(2) +
      "\nPeso considerado (est.): " +
      considerado.toFixed(2) +
      " kg";

    if (dados.fotos.length) {
      comments +=
        "\n\nFotos anexadas (metadados): " +
        dados.fotos
          .map(function (f) {
            return f.name;
          })
          .join(", ");
    }

    return {
      entityType: CFG.bitrixEntityType || "DEAL",
      fields: {
        TITLE: "Declaração de conteúdo " + protocolo,
        TYPE_ID: CFG.bitrixTypeId || "SERVICE",
        STAGE_ID: CFG.bitrixStageId || "NEW",
        OPENED: "Y",
        ASSIGNED_BY_ID: CFG.bitrixAssignedById || 1,
        CURRENCY_ID: "BRL",
        OPPORTUNITY: totalMercadoria,
        COMMENTS: comments,
        UF_CRM_PROTOCOLO_DECLARACAO: protocolo,
        UF_CRM_DECLARACAO_JSON: JSON.stringify(dados),
        UF_CRM_DECLARACAO_XML_LEN: xmlResumo ? xmlResumo.length : 0,
        UF_CRM_REMETENTE_DOC: dados.remetente.cpfCnpj,
        UF_CRM_DESTINO_PAIS: dados.destinatario.pais,
        UF_CRM_PESO_CONSIDERADO: considerado,
        UF_CRM_DATA_DECLARACAO: dados.dataHora,
      },
    };
  }

  function enviarBitrixWebhook(payload) {
    var url = CFG.bitrixInboundWebhookUrl;
    if (!url || typeof url !== "string") {
      console.info(
        "[ILG Declaração] Defina ILG_DECLARACAO_CONFIG.bitrixInboundWebhookUrl para envio automático."
      );
      return Promise.resolve({ skipped: true });
    }
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "ilg.declaracao_conteudo.submitted",
        payload: payload,
        fields: payload.fields,
      }),
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      var ct = res.headers.get("content-type") || "";
      if (ct.indexOf("application/json") !== -1) return res.json();
      return res.text().then(function (t) {
        return { ok: true, text: t };
      });
    });
  }

  function preencherResumo(dados, protocolo) {
    document.getElementById("numeroDeclaracaoResumo").textContent = protocolo;
    document.getElementById("dataDeclaracaoResumo").textContent =
      new Date().toLocaleDateString("pt-BR");

    document.getElementById("resumoRemetente").innerHTML =
      "<strong>" +
      esc(dados.remetente.nome) +
      "</strong><br>" +
      esc(dados.remetente.cpfCnpj) +
      "<br>" +
      esc(dados.remetente.endereco) +
      "<br>" +
      esc(dados.remetente.cidade + " — " + dados.remetente.estado) +
      "<br>CEP: " +
      esc(dados.remetente.cep) +
      "<br>" +
      esc(dados.remetente.telefone) +
      "<br>" +
      esc(dados.remetente.email);

    if (dados.coleta.agendamento) {
      document.getElementById("resumoRemetente").innerHTML +=
        "<br><br><em>Coleta agendada</em>" +
        (dados.coleta.mesmoEndereco === "nao"
          ? "<br>" +
            esc(dados.coleta.endereco) +
            ", " +
            esc(dados.coleta.cidade + "/" + dados.coleta.estado) +
            " — CEP " +
            esc(dados.coleta.cep) +
            "<br>Resp.: " +
            esc(dados.coleta.responsavel) +
            " — " +
            esc(dados.coleta.telefone)
          : "");
    }

    document.getElementById("resumoDestinatario").innerHTML =
      "<strong>" +
      esc(dados.destinatario.nome) +
      "</strong><br>" +
      (dados.destinatario.taxId
        ? "Tax ID: " + esc(dados.destinatario.taxId) + "<br>"
        : "") +
      esc(dados.destinatario.endereco) +
      "<br>" +
      esc(dados.destinatario.cidade) +
      (dados.destinatario.estado
        ? " — " + esc(dados.destinatario.estado)
        : "") +
      "<br>" +
      (dados.destinatario.postal
        ? "Postal: " + esc(dados.destinatario.postal) + "<br>"
        : "") +
      esc(dados.destinatario.pais || "") +
      "<br>" +
      esc(dados.destinatario.telefone) +
      "<br>" +
      esc(dados.destinatario.email);

    var tbP = document.querySelector("#resumoProdutos tbody");
    tbP.innerHTML = "";
    var totalP = 0;
    dados.produtos.forEach(function (p) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        esc(p.descricao) +
        "</td><td>" +
        p.quantidade +
        "</td><td>R$ " +
        p.valorUnitario.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) +
        "</td><td>R$ " +
        p.valorTotal.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) +
        "</td>";
      tbP.appendChild(tr);
      totalP += p.valorTotal;
    });
    document.getElementById("resumoTotalProdutos").textContent =
      "R$ " +
      totalP.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    var tbV = document.querySelector("#resumoVolumes tbody");
    tbV.innerHTML = "";
    var tb = 0;
    var tc = 0;
    dados.volumes.forEach(function (v) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        esc(v.identificador) +
        "</td><td>" +
        v.altura +
        " × " +
        v.largura +
        " × " +
        v.comprimento +
        "</td><td>" +
        v.pesoBruto.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) +
        "</td><td>" +
        v.pesoCubado.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) +
        "</td>";
      tbV.appendChild(tr);
      tb += v.pesoBruto;
      tc += v.pesoCubado;
    });
    document.getElementById("resumoTotalPesoBruto").textContent = formatKg(tb);
    document.getElementById("resumoTotalPesoCubado").textContent = formatKg(tc);
    document.getElementById("resumoPesoConsiderado").textContent = formatKg(
      Math.max(tb, tc)
    );
  }

  function setupCep(inputId, cidadeId, estadoId, statusId) {
    var input = document.getElementById(inputId);
    var cidade = document.getElementById(cidadeId);
    var estado = document.getElementById(estadoId);
    var statusEl = statusId ? document.getElementById(statusId) : null;

    input.addEventListener("input", function () {
      input.value = maskCep(input.value);
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.className = "cep-status";
      }
    });

    var buscar = debounce(function () {
      var raw = onlyDigits(input.value);
      if (raw.length !== 8) return;
      if (statusEl) {
        statusEl.textContent = "…";
        statusEl.className = "cep-status is-loading";
      }
      fetch("https://viacep.com.br/ws/" + raw + "/json/")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.erro) {
            cidade.value = "";
            estado.value = "";
            if (statusEl) {
              statusEl.textContent = "!";
              statusEl.className = "cep-status is-error";
            }
            return;
          }
          cidade.value = data.localidade || "";
          estado.value = data.uf || "";
          if (statusEl) {
            statusEl.textContent = "";
            statusEl.className = "cep-status";
          }
        })
        .catch(function () {
          if (statusEl) {
            statusEl.textContent = "!";
            statusEl.className = "cep-status is-error";
          }
        });
    }, 400);

    input.addEventListener("blur", buscar);
  }

  function bindRowInputs(row) {
    var desc = row.querySelector(".descricao-prod");
    if (desc)
      desc.addEventListener("blur", function () {
        checkDescricaoProduto(desc);
      });
    var q = row.querySelector(".quantidade");
    if (q) bindQuantidade(q);
    var vu = row.querySelector(".valor-unitario");
    if (vu) bindValorUnitario(vu);
    var vt = row.querySelector(".valor-total");
    if (vt) vt.readOnly = true;
  }

  function cloneProdutoRow() {
    var tbody = document.querySelector("#remessaTable tbody");
    var row = tbody.rows[0].cloneNode(true);
    row.querySelectorAll("input").forEach(function (inp) {
      if (inp.classList.contains("descricao-prod")) inp.value = "";
      else if (inp.classList.contains("quantidade")) inp.value = "";
      else if (inp.classList.contains("valor-unitario")) inp.value = "";
      else inp.value = "";
    });
    row.querySelector(".valor-total").value = "";
    tbody.appendChild(row);
    bindRowInputs(row);
    updateRemoveProdButtons();
  }

  function cloneVolumeRow(n) {
    var tbody = document.querySelector("#volumeTable tbody");
    var row = tbody.rows[0].cloneNode(true);
    row.querySelectorAll("input").forEach(function (inp) {
      if (inp.classList.contains("volume-id"))
        inp.value = "Volume " + n;
      else if (
        inp.classList.contains("altura") ||
        inp.classList.contains("largura") ||
        inp.classList.contains("comprimento") ||
        inp.classList.contains("peso-bruto")
      )
        inp.value = "";
    });
    row.querySelector(".peso-cubado").textContent = "0,00";
    tbody.appendChild(row);
    updateRemoveVolumeButtons();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("declaracaoForm");
    var xmlGerado = "";
    var protocoloAtual = "";
    var idCotacao = getIdCotacaoFromUrl();
    var idDisplay = document.getElementById("idCotacaoDisplay");
    if (idDisplay) {
      idDisplay.textContent = idCotacao || "(não informado na URL)";
    }


    document
      .querySelectorAll("#remessaTable tbody tr")
      .forEach(bindRowInputs);

    setupCep("remetenteCEP", "remetenteCidade", "remetenteEstado", "cepStatusRemetente");
    setupCep("coletaCEP", "coletaCidade", "coletaEstado", "cepStatusColeta");

    [
      "remetenteCPF",
      "remetenteTelefone",
      "destinatarioTelefone",
      "telefoneColeta",
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id === "remetenteCPF") {
        el.addEventListener("input", function () {
          el.value = maskCpfCnpj(el.value);
        });
      } else {
        el.addEventListener("input", function () {
          el.value = maskPhoneBR(el.value);
        });
      }
    });

    document
      .getElementById("agendamentoColeta")
      .addEventListener("change", function () {
        var on = this.checked;
        document
          .getElementById("mesmoEnderecoColeta")
          .classList.toggle("is-hidden", !on);
        if (!on) {
          document.getElementById("dadosColeta").classList.add("is-hidden");
        }
      });

    document.querySelectorAll('input[name="mesmoEndereco"]').forEach(function (
      r
    ) {
      r.addEventListener("change", function () {
        if (this.value === "nao")
          document.getElementById("dadosColeta").classList.remove("is-hidden");
        else document.getElementById("dadosColeta").classList.add("is-hidden");
      });
    });

    document.getElementById("addLinhaProd").addEventListener("click", function () {
      cloneProdutoRow();
 });

    document
      .querySelector("#remessaTable tbody")
      .addEventListener("input", function (e) {
        if (
          e.target.classList.contains("quantidade") ||
          e.target.classList.contains("valor-unitario")
        ) {
          var row = e.target.closest("tr");
          recalcRemessaRow(row);
          updateRemessaTotals();
        }
      });

    document
      .querySelector("#remessaTable tbody")
      .addEventListener("click", function (e) {
        var btn = e.target.closest(".remove-prod");
        if (!btn || btn.disabled) return;
        var tr = btn.closest("tr");
        if (produtoRowCount() <= 1) return;
        tr.remove();
        updateRemessaTotals();
        updateRemoveProdButtons();
      });

    document.getElementById("addLinhaVolume").addEventListener("click", function () {
      cloneVolumeRow(volumeRowCount() + 1);
 });

    document
      .querySelector("#volumeTable tbody")
      .addEventListener("input", function (e) {
        if (
          e.target.classList.contains("altura") ||
          e.target.classList.contains("largura") ||
          e.target.classList.contains("comprimento") ||
          e.target.classList.contains("peso-bruto")
        ) {
          var row = e.target.closest("tr");
          recalcVolumeRow(row);
          updateVolumeTotals();
        }
      });

    document
      .querySelector("#volumeTable tbody")
      .addEventListener("click", function (e) {
        var btn = e.target.closest(".remove-volume");
        if (!btn || btn.disabled) return;
        if (volumeRowCount() <= 1) return;
        btn.closest("tr").remove();
        updateVolumeTotals();
        updateRemoveVolumeButtons();
      });

    document.getElementById("fotosCaixa").addEventListener("change", function () {
      var ul = document.getElementById("fotosList");
      ul.innerHTML = "";
      var files = this.files;
      for (var i = 0; i < files.length; i++) {
        var li = document.createElement("li");
        li.textContent = files[i].name + " (" + Math.round(files[i].size / 1024) + " KB)";
        ul.appendChild(li);
      }
    });

    updateRemessaTotals();
    updateVolumeTotals();
    updateRemoveProdButtons();
    updateRemoveVolumeButtons();

    document.getElementById("btnImprimir").addEventListener("click", function () {
      window.print();
    });

    document.getElementById("btnDownloadPDF").addEventListener("click", function () {
      if (window.__ilgDeclaracaoPdfBase64) {
        var blob = base64ToBlob(window.__ilgDeclaracaoPdfBase64, "application/pdf");
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "declaracao_conteudo_" + protocoloAtual + ".pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      if (typeof html2pdf === "undefined") {
        alert(
          "PDF gerado no servidor não está disponível neste fluxo. Use \"Baixar PDF\" com html2pdf ou Imprimir / Salvar como PDF no navegador."
        );
        return;
      }
      var el = document.getElementById("resumoPage");
      html2pdf()
        .set({
          margin: 10,
          filename: "declaracao_conteudo_" + protocoloAtual + ".pdf",
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    });

    document.getElementById("btnDownloadXML").addEventListener("click", function () {
      var blob = new Blob([xmlGerado], { type: "application/xml" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "declaracao_conteudo_" + protocoloAtual + ".xml";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    document.getElementById("btnEnviarEmail").addEventListener("click", function () {
      var to = CFG.emailOperacional || "";
      var sub = encodeURIComponent(
        "Declaração de conteúdo " + protocoloAtual + " — ILG COMEX"
      );
      var body = encodeURIComponent(
        "Declaração " +
 protocoloAtual +
          " gerada em " +
          new Date().toLocaleString("pt-BR") +
          ".\nAnexe PDF/XML conforme processo interno."
      );
      if (to) {
        window.location.href = "mailto:" + to + "?subject=" + sub + "&body=" + body;
      } else {
        alert(
          "Configure ILG_DECLARACAO_CONFIG.emailOperacional para abrir o cliente de e-mail com destino preenchido."
        );
      }
    });

    document.getElementById("btnVoltar").addEventListener("click", function () {
      window.__ilgDeclaracaoPdfBase64 = null;
      var rb = document.getElementById("resumoBitrixLine");
      if (rb) {
        rb.textContent = "";
        rb.classList.add("is-hidden");
      }
      document.getElementById("resumoPage").classList.add("is-hidden");
      document.getElementById("declaracaoEditor").classList.remove("is-hidden");
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var dados = coletarDadosFormulario();
      if (!validateColeta(dados)) {
        alert(
          "Preencha todos os dados de coleta (endereço diferente do remetente)."
        );
        return;
      }
      if (!dados.produtos.length) {
        alert("Inclua ao menos um produto com descrição e quantidade maior que zero.");
        return;
      }
      if (!dados.volumes.length) {
        alert("Inclua ao menos um volume com identificador.");
        return;
      }

      protocoloAtual =
        (CFG.protocolPrefix || "ILG-DC") + String(Date.now()).slice(-8);
      xmlGerado = gerarXMLNFe(dados);

      function finalizarUi(protocolo, dealId, apiJson) {
        preencherResumo(dados, protocolo);
        var wa = CFG.whatsappE164 || "5562998666000";
        var tpl =
          CFG.whatsappMessageTemplate ||
          "Olá! Minha declaração de conteúdo é {protocolo}.";
        var msg = tpl.replace(/\{protocolo\}/g, protocolo);
        document.getElementById("whatsAppResumo").href =
          "https://api.whatsapp.com/send?phone=" +
          onlyDigits(wa) +
          "&text=" +
          encodeURIComponent(msg);

        var statusEl = document.getElementById("resumoStatusLine");
        var statusTxt = document.getElementById("resumoStatusTexto");
        if (statusEl && statusTxt) {
          var idUsado =
            (apiJson && (apiJson.id || apiJson.idCotacao)) || idCotacao || "";
          statusTxt.textContent = idUsado
            ? "Declaração enviada com sucesso. Vinculada à cotação ID " +
              idUsado +
              "."
            : "Declaração enviada com sucesso.";
          statusEl.classList.remove("is-hidden");
        }

        var rb = document.getElementById("resumoBitrixLine");
        if (rb) {
          if (dealId) {
            rb.textContent = "Negócio criado no Bitrix24 (ID: " + dealId + ").";
            rb.classList.remove("is-hidden");
          } else {
            rb.classList.add("is-hidden");
            rb.textContent = "";
          }
        }
        document.getElementById("declaracaoEditor").classList.add("is-hidden");
        document.getElementById("resumoPage").classList.remove("is-hidden");
        document.getElementById("resumoPage").scrollIntoView({ behavior: "smooth" });
      }

      var apiUrl = (CFG.apiSubmitUrl || "").trim();
      var bitrixPayload = buildBitrixPayload(dados, protocoloAtual, xmlGerado);
      if (apiUrl) {
        if (!idCotacao) {
          alert(
            "ID da cotação ausente.\n\n" +
              "Abra esta página com o id do 1º formulário na URL, por exemplo:\n" +
              "declaracao-conteudo.html?id=166042"
          );
          return;
        }
        if (window.location && window.location.protocol === "file:") {
          alert(
            "Você está abrindo o arquivo via file://.\n\n" +
              "Rode um servidor HTTP (ex.: npx vercel dev na pasta do projeto) e abra via http://."
          );
          return;
        }
        var fi = document.getElementById("fotosCaixa");
        collectFotosPayload(fi, {
          maxFiles: 15,
          maxTotalBytes: 2 * 1024 * 1024,
        })
          .then(function (fotos) {
            return fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tipoFormulario: "declaracao",
                id: idCotacao,
                protocolo: protocoloAtual,
                dados: dados,
                xmlGerado: xmlGerado,
                bitrix: bitrixPayload,
                fotos: fotos,
              }),
            });
          })
          .then(function (r) {
            return r.json().then(function (json) {
              if (!r.ok) throw new Error(json.error || "Erro " + r.status);
              return json;
            });
          })
          .then(function (json) {
            if (!json.success) throw new Error(json.error || "Falha no servidor");
            window.__ilgDeclaracaoPdfBase64 = json.pdfBase64 || null;
            var prev = document.getElementById("bitrixPreviewDeclaracao");
            if (prev) {
              prev.textContent = JSON.stringify(json, null, 2);
            }
            console.log("[ILG Declaração] API:", json);
            var dealId =
              json.bitrixDealId != null && json.bitrixDealId !== ""
                ? json.bitrixDealId
                : null;
            if (
              !dealId &&
              json.webhookResponse &&
              typeof json.webhookResponse === "object"
            ) {
              dealId =
                json.webhookResponse.bitrixDealId ||
                json.webhookResponse.dealId ||
                json.webhookResponse.id ||
                null;
            }
            finalizarUi(json.protocolo || protocoloAtual, dealId, json);
          })
          .catch(function (err) {
            var msg = err && err.message ? err.message : String(err);
            if (msg.indexOf("Fotos") !== -1 || msg.indexOf("fotos") !== -1) {
              alert(msg);
            } else {
              alert(buildFetchTroubleshootingMessage(apiUrl, err));
            }
          });
        return;
      }

      var preview = document.getElementById("bitrixPreviewDeclaracao");
      if (preview) {
        preview.textContent = JSON.stringify(
          {
            id: idCotacao || null,
            protocolo: protocoloAtual,
            dados: dados,
            bitrix: bitrixPayload,
          },
          null,
          2
        );
      }

      console.log("[ILG Declaração]", dados, bitrixPayload);

      enviarBitrixWebhook(bitrixPayload)
        .then(function (r) {
          if (r && !r.skipped) console.log("[ILG Declaração] Bitrix:", r);
        })
        .catch(function (err) {
          console.error("[ILG Declaração] Bitrix erro:", err);
        });

      finalizarUi(protocoloAtual, null);
    });
  });
})();
