# Usar o pdpj como conector remoto (qualquer aparelho)

O servidor tem dois modos. O que você escolhe depende de onde quer usá-lo:

| | `npm start` (stdio) | `npm run start:http` (Streamable HTTP) |
| --- | --- | --- |
| Como roda | processo local, iniciado pelo cliente | serviço web, sempre no ar |
| Onde funciona | só na máquina onde está instalado | qualquer aparelho, inclusive celular |
| Onde se conecta | Claude Code, Claude Desktop | claude.ai como conector personalizado |
| Precisa hospedar | não | sim |

Este documento cobre o segundo caso: publicar o servidor e ligá-lo ao Claude
como qualquer outro conector.

---

## 1. Escolha um token de acesso

Sem token, qualquer pessoa que descubra a URL usa o seu servidor. As ferramentas
são somente leitura sobre bases públicas, mas o consumo cai sobre a sua cota da
API do CNJ. Gere um token e guarde-o:

```bash
openssl rand -hex 32
```

Ele vai na variável `PDPJ_AUTH_TOKEN` do serviço e no cabeçalho
`Authorization: Bearer <token>` do cliente.

---

## 2. Publique o serviço

O repositório traz um `Dockerfile` pronto. Qualquer plataforma que aceite Docker
serve. O serviço escuta na porta indicada por `PORT` (8080 se nada for dito) e
expõe `/mcp` para o MCP e `/health` para a sonda de saúde.

### Railway

```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway variables --set "PDPJ_AUTH_TOKEN=<seu-token>"
railway domain          # gera a URL pública https
```

### Render

Crie um Web Service apontando para o repositório, ambiente Docker, e adicione
`PDPJ_AUTH_TOKEN` nas variáveis. O health check é `/health`.

### Fly.io

```bash
fly launch --no-deploy
fly secrets set PDPJ_AUTH_TOKEN=<seu-token>
fly deploy
```

### Google Cloud Run

```bash
gcloud run deploy pdpj-mcp \
  --source . \
  --allow-unauthenticated \
  --set-env-vars PDPJ_AUTH_TOKEN=<seu-token>
```

`--allow-unauthenticated` libera a camada do Google; quem protege o servidor é o
seu token.

### Confira antes de seguir

```bash
curl https://<sua-url>/health
```

Deve responder algo como:

```json
{"ok":true,"servidor":"pdpj-mcp-server","transporte":"streamable-http","protegido":true}
```

Se `protegido` vier `false`, o token não chegou ao serviço — corrija antes de
expor a URL.

---

## 3. Ligue ao Claude

Em **claude.ai → Configurações → Conectores → Adicionar conector personalizado**:

- **URL**: `https://<sua-url>/mcp`
- **Autenticação**: cabeçalho `Authorization` com o valor `Bearer <seu-token>`

Feito isso, o `pdpj` aparece na lista de conectores em qualquer aparelho onde
você use o Claude — navegador, desktop, celular — como Gamma ou Drive.

Se preferir usar no Claude Code apontando para o serviço remoto em vez do
processo local:

```bash
claude mcp add -s user -t http pdpj https://<sua-url>/mcp \
  -H "Authorization: Bearer <seu-token>"
```

---

## 4. Variáveis do serviço

| Variável | Necessária | Para que serve |
| --- | --- | --- |
| `PDPJ_AUTH_TOKEN` | recomendada | Exige `Authorization: Bearer` em `/mcp` |
| `PORT` | injetada pela plataforma | Porta de escuta (padrão 8080) |
| `PDPJ_API_KEY` | opcional | Sua chave do DataJud, se tiver uma própria |
| `PDPJ_CACHE_TTL` | opcional | Cache em segundos (padrão 300) |
| `PDPJ_TIMEOUT` | opcional | Tempo limite por chamada, em ms (padrão 30000) |
| `PDPJ_DEMO` | opcional | `1` responde com fixture local, sem rede |

---

## Notas de operação

**Sem estado.** Cada requisição cria seu próprio servidor e transporte, e os
descarta ao fim. Não há sessão a preservar, então a plataforma pode reciclar ou
multiplicar instâncias à vontade. O cache é por instância e apenas acelera
repetições — nada depende dele.

**Rede de saída.** A máquina que hospeda precisa alcançar
`api-publica.datajud.cnj.jus.br` e `comunicaapi.pje.jus.br`. Em plataformas
públicas isso é o padrão; em rede corporativa, confirme antes.

**Custo.** O serviço fica ocioso quase todo o tempo. Plataformas com free tier
ou com escala a zero (Cloud Run, Fly) tendem a sair de graça ou perto disso.

**Girar o token.** Basta trocar a variável de ambiente e atualizar o cabeçalho no
conector. Nada no código muda.
