# Usar o pdpj como conector remoto (qualquer aparelho)

O servidor tem dois modos. O que você escolhe depende de onde quer usá-lo:

| | `npm start` (stdio) | `npm run start:http` (Streamable HTTP) |
| --- | --- | --- |
| Como roda | processo local, iniciado pelo cliente | serviço web, sempre no ar |
| Onde funciona | só na máquina onde está instalado | qualquer aparelho, inclusive celular |
| Onde se conecta | Claude Code, Claude Desktop | claude.ai como conector personalizado |
| Precisa de URL pública | não | sim — por túnel ou hospedagem |

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

Há dois caminhos. O túnel é imediato e não envolve plataforma nenhuma; a
hospedagem é para quando você quiser o conector no ar sem depender do seu Mac.

### Caminho rápido: túnel a partir do seu Mac

O servidor continua rodando na sua máquina; o túnel só lhe dá um endereço
público. Nada é enviado para lugar nenhum, não há conta a criar nem custo.

Instale o cloudflared uma vez:

```bash
brew install cloudflared
```

Em um terminal, suba o servidor:

```bash
cd ~/PDPJ
PDPJ_AUTH_TOKEN=<seu-token> npm run start:http
```

Em outro terminal, abra o túnel:

```bash
cloudflared tunnel --url http://localhost:8080
```

O cloudflared imprime uma URL do tipo
`https://algo-aleatorio.trycloudflare.com`. É ela que vai no conector, com
`/mcp` no fim.

O que esperar desse caminho:

- Funciona só enquanto os dois comandos estiverem rodando e o Mac ligado.
- **A URL muda a cada execução do cloudflared.** Toda vez que você reinicia o
  túnel, o conector aponta para um endereço morto e passa a falhar com 502 —
  é preciso editá-lo com a URL nova. Em uso diário isso cansa rápido.
- Bom para provar que funciona, ruim para conviver.

### Caminho intermediário: túnel com endereço fixo (ngrok)

Resolve exatamente o problema acima: continua rodando do seu Mac, sem
hospedagem, mas o endereço não muda mais — o conector é configurado uma vez e
pronto. A conta gratuita do ngrok dá um domínio estático.

```bash
brew install ngrok
ngrok config add-authtoken <token-da-sua-conta-ngrok>
```

Pegue seu domínio estático no painel do ngrok (algo como
`nome-escolhido.ngrok-free.app`) e suba o túnel sempre com ele:

```bash
ngrok http 8080 --url=nome-escolhido.ngrok-free.app
```

A URL do conector passa a ser estável:
`https://nome-escolhido.ngrok-free.app/mcp/<seu-token>`

Continua dependendo do Mac ligado e do comando rodando, mas você para de
reconfigurar o conector a cada reinício.

### Caminho definitivo: hospedar

O repositório traz um `Dockerfile` pronto. Qualquer plataforma que aceite Docker
serve. O serviço escuta na porta indicada por `PORT` (8080 se nada for dito) e
expõe `/mcp` para o MCP e `/health` para a sonda de saúde.

#### Railway

```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway variables --set "PDPJ_AUTH_TOKEN=<seu-token>"
railway domain          # gera a URL pública https
```

#### Render

Crie um Web Service apontando para o repositório, ambiente Docker, e adicione
`PDPJ_AUTH_TOKEN` nas variáveis. O health check é `/health`.

#### Fly.io

```bash
fly launch --no-deploy
fly secrets set PDPJ_AUTH_TOKEN=<seu-token>
fly deploy
```

#### Google Cloud Run

```bash
gcloud run deploy pdpj-mcp \
  --source . \
  --allow-unauthenticated \
  --set-env-vars PDPJ_AUTH_TOKEN=<seu-token>
```

`--allow-unauthenticated` libera a camada do Google; quem protege o servidor é o
seu token.

#### Confira antes de seguir

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

Em **claude.ai → Configurações → Conectores → Adicionar conector personalizado**,
o único campo obrigatório é a URL, e a tela de autenticação oferece OAuth — não
há onde digitar um cabeçalho. Por isso o servidor também aceita o token no
próprio caminho:

- **URL**: `https://<sua-url>/mcp/<seu-token>`

O `/mcp` sozinho continua valendo para clientes que deixam definir cabeçalhos
(Claude Code, curl, Inspector), com `Authorization: Bearer <seu-token>`.

Feito isso, o `pdpj` aparece na lista de conectores em qualquer aparelho onde
você use o Claude — navegador, desktop, celular — como Gamma ou Drive.

**O que muda ao pôr o token na URL.** Ele deixa de ser um segredo de cabeçalho e
passa a viajar no endereço: aparece em logs de proxy e no histórico de quem
tiver acesso à máquina. Para este servidor o risco é contido — as ferramentas
são somente leitura sobre bases públicas, e o pior caso é alguém consumir a sua
cota da API do CNJ. Ainda assim, trate a URL completa como senha e gire o token
(`.env` + reinício) se ela vazar.

Se preferir usar no Claude Code apontando para o serviço remoto em vez do
processo local:

```bash
claude mcp add -s user -t http pdpj https://<sua-url>/mcp \
  -H "Authorization: Bearer <seu-token>"
```

---

## Quando o conector falha

| Sintoma | Causa provável |
| --- | --- |
| `502` na verificação | O túnel ou o host não alcança o servidor: ele parou, ou está em outra porta |
| `404` | Faltou `/mcp` (ou `/mcp/<token>`) no fim da URL |
| `401` | Token errado, ou ausente onde o cliente não manda cabeçalho — use `/mcp/<token>` |
| Conecta mas não lista ferramentas | Confirme com `curl <url>/health`; se `protegido` vier `false`, o token não chegou ao serviço |

Em vez de conferir item a item, rode o diagnóstico — ele percorre a corrente
do servidor local até o túnel e diz onde quebrou:

```bash
npm run diagnostico
npm run diagnostico -- https://<sua-url>   # inclui o teste ponta a ponta
```

Com a URL informada e tudo certo, ele imprime a URL completa, com token, pronta
para colar no conector.

Rode numa aba de terminal **livre**. O servidor e o cloudflared ocupam as abas
onde foram iniciados: comandos digitados ali não executam, ficam esperando. Se
um comando "não retornou nada", quase sempre é isso.

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
