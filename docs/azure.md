# Hospedar no Azure (Container Apps)

Caminho para quem usa ambiente Microsoft e quer o `pdpj` como **conector do
claude.ai** — funcionando em qualquer aparelho, inclusive celular, sem ninguém
instalar arquivo nenhum.

O serviço fica em **Brazil South (São Paulo)**, e a razão é técnica, não de
preferência: o DJEN recusa conexões originadas fora do Brasil. Hospedado nos
Estados Unidos ou na Europa, o conector responderia consultas de processo e
andamento, mas credores, motivo do pedido e ativos voltariam vazios — metade do
módulo de recuperação judicial.

---

## Por que Container Apps, e não App Service

| | Container Apps | App Service |
| --- | --- | --- |
| Escala a zero | **sim** | só em planos específicos |
| Custo parado | perto de zero | do plano contratado |
| Docker | nativo | Web App for Containers |

O servidor fica ocioso quase todo o tempo — é chamado quando alguém faz uma
pergunta. Escalar a zero é o que mantém a conta baixa. A contrapartida é a
partida a frio: a primeira chamada depois de um período parado demora alguns
segundos a mais.

---

## 1. Gere o token

Qualquer sequência longa e aleatória. Ela protege o servidor: sem ela, quem
descobrir a URL consome a sua cota da API do CNJ.

```bash
openssl rand -hex 32
```

Sem terminal à mão, sirva-se de qualquer gerador de senha com 40 caracteres ou
mais. Guarde: ela vai na configuração do serviço **e** na URL do conector.

---

## 2. Crie o Container App

No portal do Azure, **Create a resource → Container App**.

| Campo | Valor |
| --- | --- |
| Region | **Brazil South** |
| Deployment source | **Container image** → *Use quickstart image* por ora |
| Ingress | **Enabled**, Accepting traffic from **Anywhere** |
| Target port | `8080` |

Crie e prossiga. A imagem definitiva vem do seu repositório no passo seguinte.

---

## 3. Ligue ao repositório

Dentro do Container App, **Continuous deployment → GitHub**.

| Campo | Valor |
| --- | --- |
| Repository | `luizcastrese/PDPJ` |
| Branch | a branch padrão do repositório |
| Dockerfile | `Dockerfile` (na raiz) |

O Azure cria sozinho um workflow do GitHub Actions no repositório e faz o
primeiro build. O `Dockerfile` já está pronto: compila o TypeScript, instala só
as dependências de produção, não roda como root e expõe a porta 8080.

---

## 4. Configure a variável e a sonda

Em **Containers → Edit and deploy → Environment variables**:

| Nome | Valor |
| --- | --- |
| `PDPJ_AUTH_TOKEN` | o token do passo 1 — marque como **secret** |

Opcionais, se quiser ajustar: `PDPJ_API_KEY` (chave própria do DataJud),
`PDPJ_CACHE_TTL`, `PDPJ_TIMEOUT` (o padrão é 90000 ms, porque a API do CNJ é
lenta).

Em **Health probes**, aponte a sonda de prontidão para `/health` na porta 8080.

Em **Scale**, deixe **Min replicas = 0** para escalar a zero.

---

## 5. Confira antes de expor

Abra no navegador:

```
https://<seu-app>.brazilsouth.azurecontainerapps.io/health
```

Deve responder:

```json
{"ok":true,"servidor":"pdpj-mcp-server","transporte":"streamable-http","protegido":true}
```

Se `protegido` vier `false`, o token não chegou ao serviço — corrija antes de
distribuir a URL, ou o servidor fica aberto.

---

## 6. Ligue ao Claude

Em **claude.ai → Configurações → Conectores → Adicionar conector
personalizado**, no campo *URL do servidor MCP*:

```
https://<seu-app>.brazilsouth.azurecontainerapps.io/mcp/<seu-token>
```

O token vai **no caminho** porque essa tela só tem o campo da URL — não há onde
informar cabeçalho. Clientes que aceitam cabeçalho (Claude Code, curl, o
Inspector) podem usar `/mcp` com `Authorization: Bearer <token>`.

---

## O que muda ao distribuir essa URL

Ela é, na prática, uma senha compartilhada: quem a tiver usa o seu servidor e a
sua cota do CNJ, e o token não é revogável por pessoa — girar o token derruba
todo mundo de uma vez. Para um grupo pequeno e conhecido, funciona. Para
distribuição mais aberta, a extensão `.mcpb` é melhor: cada um instala a sua,
sem segredo compartilhado e com a cota de cada um.

Trate a URL completa como senha, e gire o token trocando a variável de ambiente
se ela vazar.
