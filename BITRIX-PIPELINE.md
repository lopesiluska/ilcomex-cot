# Pipeline de teste — Bitrix24 + PHP (declaração de conteúdo)

Este documento descreve o fluxo ponta a ponta para **testar** a integração: formulário HTML → **PHP** (`declaracao-submit.php`) → PDF no servidor → **crm.deal.add** → opcional **Disk** (fotos + PDF).

---

## 1. Pré-requisitos

- Conta **Bitrix24** (cloud) com permissão de administrador para criar webhooks.
- **PHP 8.1+** com extensões: `curl`, `fileinfo`, `json`, `mbstring`.
- **Composer** na pasta `novo projeto/php`.
- Servidor HTTP servindo:
  - os arquivos estáticos do formulário (`declaracao-conteudo.html`, `js/`, `css/`), e
  - o endpoint `php/public/declaracao-submit.php` (via `DocumentRoot` em `public/` ou rota equivalente).

> O navegador não pode abrir o formulário como `file://` e chamar a API em `http://localhost` sem CORS adequado; use sempre **http(s)** para HTML e PHP.

---

## 2. Instalação do backend PHP

```bash
cd "novo projeto/php"
composer install
copy config.example.php config.php
```

Edite `config.php`:

| Chave | Uso |
|--------|-----|
| `bitrix_webhook_base` | URL do webhook de entrada, **com barra no final** |
| `bitrix_disk_folder_id` | ID numérico da pasta do Disk (ou `null`) |
| `bitrix_uf_enabled` | `false` até criar campos UF no CRM com os mesmos códigos |
| `cors_origins` | Em produção, liste origens exatas em vez de `*` |

Pastas `php/uploads/` devem ser graváveis pelo usuário do PHP.

---

## 3. Criar o webhook de entrada (teste)

1. Bitrix24 → **Aplicativos** → **Webhooks** → **Webhook de entrada**.
2. Conceda permissões mínimas para o pipeline de teste:
   - **CRM (crm)** — criar/editar negócios.
   - **Armazenamento em disco (disk)** — só se for usar `bitrix_disk_folder_id`.
3. Copie a URL no formato:

   `https://SEU_SUBDOMINIO.bitrix24.com.br/rest/1/XXXXXXXXXXXX/`

4. Cole em `config.php` em `bitrix_webhook_base` (com `/` no final).

---

## 4. Testar o REST sem o PHP (sanidade)

No navegador ou Postman, chame um método somente leitura:

`GET https://.../rest/1/CODIGO/profile`

Ou:

`POST https://.../rest/1/CODIGO/crm.deal.fields`

Corpo JSON vazio ou `{}`. Resposta deve conter `result` sem `error`.

---

## 5. Testar criação de negócio (crm.deal.add)

**POST** para: `https://.../rest/1/CODIGO/crm.deal.add`

Corpo JSON de exemplo:

```json
{
  "fields": {
    "TITLE": "Teste ILG pipeline",
    "TYPE_ID": "SERVICE",
    "STAGE_ID": "NEW",
    "OPENED": "Y",
    "ASSIGNED_BY_ID": 1,
    "CURRENCY_ID": "BRL",
    "OPPORTUNITY": 100.5,
    "COMMENTS": "Teste manual do webhook"
  }
}
```

- Ajuste `STAGE_ID` ao funil real (em alguns portais `NEW` não existe — use o ID retornado em `crm.deal.fields` / funil).
- Ajuste `ASSIGNED_BY_ID` a um usuário válido (o `1` costuma existir).

Resposta esperada: `"result": 123` (ID do negócio).

---

## 6. Pasta do Disk para fotos (opcional)

1. Bitrix24 → **Drive** → crie uma pasta (ex.: `Declarações ILG`).
2. Obtenha o **ID da pasta** (via interface de desenvolvedor, ou método `disk.folder.getlist` / link do objeto).
3. Preencha `bitrix_disk_folder_id` em `config.php`.

O PHP usa `disk.folder.uploadfile` com `fileContent` em Base64 (compatível com a referência REST mais comum). Se o seu portal exigir multipart, adapte `BitrixClient::diskFolderUploadFile`.

---

## 7. Campos personalizados (UF_CRM_*)

O mapper PHP só envia `UF_CRM_*` se `bitrix_uf_enabled` for `true`.

1. CRM → **Configurações** → **Campos do negócio** → crie campos com **exatamente** os códigos usados em `DeclaracaoBitrixMapper.php` (ex.: `UF_CRM_PROTOCOLO_DECLARACAO`).
2. Só então defina `bitrix_uf_enabled` => `true`.

Se enviar UF inexistente, `crm.deal.add` retorna erro.

---

## 8. Ligando o formulário ao PHP

Em `declaracao-conteudo.html`, em `ILG_DECLARACAO_CONFIG`:

```js
apiSubmitUrl: "https://seu-servidor/caminho/declaracao-submit.php",
```

Fluxo ao enviar:

1. O JS monta `FormData`: campo `payload` (JSON com `protocolo`, `dados`, `xmlGerado`) e arquivos `fotos[]`.
2. O PHP valida, grava imagens em `uploads/{protocolo}/`, gera PDF (Dompdf), chama `crm.deal.add`, opcionalmente envia arquivos ao Disk.
3. Resposta JSON: `success`, `protocolo`, `bitrixDealId`, `pdfBase64`, `filesSaved`, `diskUploads`.

O botão **PDF** no resumo passa a preferir o PDF retornado pelo servidor (`pdfBase64`), com layout tabular estável (sem o desalinhamento do html2pdf no cliente).

---

## 9. Pipeline de teste resumido (checklist)

| Passo | Ação |
|--------|------|
| 1 | `composer install` + `config.php` |
| 2 | Webhook com permissão **crm** (+ **disk** se subir fotos) |
| 3 | Teste `crm.deal.add` manual (Postman) |
| 4 | (Opcional) ID da pasta Disk + teste upload |
| 5 | Subir PHP atrás de HTTPS/HTTP e definir `apiSubmitUrl` |
| 6 | Enviar formulário com 1 foto e conferir negócio + PDF em `uploads/` |

---

## 10. Segurança (antes de produção)

- Não commitar `config.php` nem `uploads/` com dados reais.
- Restringir `cors_origins`.
- Limitar tamanho/número de uploads (já há limites em `config.example.php`).
- Colocar autenticação na frente de `declaracao-submit.php` (token, sessão, IP allowlist) conforme política da ILG.
- Revisar se o XML gerado no cliente atende uso real; o PDF oficial passa a ser o do servidor.

---

## 11. Referência de arquivos

| Arquivo | Função |
|---------|--------|
| `php/public/declaracao-submit.php` | Endpoint POST multipart |
| `php/src/BitrixClient.php` | Chamadas REST |
| `php/src/DeclaracaoBitrixMapper.php` | `fields` do negócio |
| `php/src/DeclaracaoPdfRenderer.php` | Dompdf |
| `php/templates/declaracao_pdf.php` | HTML do PDF |
| `js/declaracao-conteudo.js` | Envio `apiSubmitUrl` + download PDF Base64 |

Para dúvidas oficiais de método REST, use a documentação Bitrix24 em [apidocs.bitrix24.com](https://apidocs.bitrix24.com/).
