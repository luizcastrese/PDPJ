# pdpj-mcp-server

Servidor **MCP (Model Context Protocol)** para a **API Pública do DataJud**, a base
de metadados processuais do CNJ hospedada na PDPJ. Em vez de uma tela para você
operar, o assistente passa a ter as ferramentas: você pede em português, ele
consulta o tribunal certo e devolve a análise.

```
                                                  ┌→ DataJud  (metadados e movimentos)
você  →  Claude (a interface)  →  pdpj-mcp-server ─┤
                                                  └→ DJEN     (publicações, advogados, OAB)
```

---

## O que dá para pedir

> "Analisa o processo 1000123-69.2023.8.26.0100"
> "Esse processo está parado? Há quanto tempo?"
> "Quanto tempo levou do ajuizamento até a sentença?"
> "Lista as movimentações de 2024 que falam em penhora"
> "Compara esses cinco processos e diz qual está mais travado"
> "Quais execuções fiscais foram ajuizadas no TJSP em 2023?"
> "De que tribunal é o número 0010123-81.2019.5.02.0011?"
> "Quem são os advogados desse processo?"
> "Quem foi nomeado administrador judicial?"
> "Quais processos têm intimação para a OAB/SP 214556?"

---

## Ferramentas

| Ferramenta | O que faz |
| --- | --- |
| `pdpj_analisar_processo` | Diagnóstico completo: situação inferida, métricas de tempo, marcos, distribuição de movimentos e pontos de atenção |
| `pdpj_consultar_processo` | Metadados e movimentações do processo, sem interpretação |
| `pdpj_listar_movimentos` | Linha do tempo com filtros (categoria, texto, período) e paginação |
| `pdpj_buscar_processos` | Busca por classe, assunto, órgão julgador, grau e período de ajuizamento |
| `pdpj_comparar_processos` | Compara de 2 a 10 processos lado a lado, com agregados |
| `pdpj_consulta_avancada` | Query Elasticsearch livre, para o que os filtros não cobrem |
| `pdpj_identificar_envolvidos` | Advogados (nome e OAB), partes e auxiliares da justiça: administrador judicial, perito, curador, inventariante, leiloeiro |
| `pdpj_buscar_publicacoes` | Publicações do DJEN por processo, OAB, nome de advogado ou de parte |
| `pdpj_validar_numero` | Valida o dígito verificador e identifica o tribunal — offline |
| `pdpj_listar_tribunais` | Os 91 tribunais cobertos e seus aliases — offline |
| `pdpj_status` | Como o servidor está configurado (sem expor a chave) |

Todas são somente leitura (`readOnlyHint`) e aceitam `response_format`:
`markdown` (padrão, legível) ou `json` (dados completos).

### O que a análise calcula

- **Situação inferida**: em tramitação, movimentação lenta, parado há mais de um
  ano, suspenso, transitado em julgado, baixado.
- **Tempo**: tramitação total, tempo desde o último movimento, maior intervalo sem
  andamento, ajuizamento → sentença, sentença → trânsito em julgado.
- **Ritmo**: intervalo médio entre movimentos e movimentos por ano.
- **Composição**: movimentos por categoria (recursos, audiências, decisões,
  perícias, execução…) e por ano.
- **Alertas**: paralisação prolongada, sigilo, litigiosidade recursal elevada,
  defasagem da própria base do DataJud.

Os movimentos são classificados pelo **nome** na Tabela Processual Unificada do
CNJ, com a ordem de precedência calibrada para não confundir "cumprimento de
sentença", "conclusão para julgamento" ou "sessão de julgamento" com o ato de
sentenciar.

### Duas fontes, dois graus de confiança

O servidor consulta duas bases públicas, e a diferença entre elas importa:

| | DataJud | DJEN |
| --- | --- | --- |
| Traz | Metadados e movimentos | Publicações e intimações |
| Advogados / partes | Não existem | **Campo estruturado** — nome e OAB |
| Administrador judicial, perito | Não existem | Só no **corpo do texto** |

Advogados e partes vêm prontos do DJEN: são dado. Já administrador judicial,
perito, curador, inventariante e leiloeiro não são campo em base alguma — o
servidor os **extrai do texto** da publicação, e por isso devolve junto o trecho
de origem e um aviso explícito. Pode haver falso positivo e falso negativo;
confira antes de qualquer uso profissional.

A leitura do nome não depende de maiúsculas (publicações vêm ora em caixa alta,
ora não): ela acumula palavras até esbarrar em pontuação, em palavra funcional
ou no texto voltando a correr — o que evita colar "prestará contas" no fim de
uma razão social.

---

## Instalação

```bash
git clone https://github.com/luizcastrese/PDPJ.git
cd PDPJ
npm install
npm run build
```

### Registrar no Claude Code

Dentro do diretório do projeto:

```bash
claude mcp add pdpj -- node "$(pwd)/dist/src/index.js"
```

O repositório também traz um `.mcp.json`: ao abrir este diretório no Claude Code,
o servidor é oferecido automaticamente (basta aprovar).

### Registrar no Claude Desktop

Em `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pdpj": {
      "command": "node",
      "args": ["/caminho/absoluto/para/PDPJ/dist/src/index.js"]
    }
  }
}
```

### Conferir com o Inspector

```bash
npm run inspector
```

---

## Configuração

Copie `.env.example` para `.env` e ajuste o que precisar. Todas as variáveis são
opcionais.

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `PDPJ_API_KEY` | chave pública do CNJ | Chave enviada no header `Authorization: APIKey …` |
| `PDPJ_BASE_URL` | `https://api-publica.datajud.cnj.jus.br` | Endereço base da API do DataJud |
| `PDPJ_DJEN_URL` | `https://comunicaapi.pje.jus.br` | Endereço base da API do DJEN (aberta, sem chave) |
| `PDPJ_CACHE_TTL` | `300` | Cache das consultas em segundos (`0` desativa) |
| `PDPJ_TIMEOUT` | `30000` | Tempo limite por chamada, em milissegundos |
| `PDPJ_DEMO` | desligado | `1` responde com uma fixture local, sem rede |

**Sobre a chave.** O padrão embutido é a chave pública que o próprio CNJ divulga
na [documentação da API](https://datajud-wiki.cnj.jus.br/api-publica/acesso) —
não é um segredo e é compartilhada por todos os consumidores da API pública. Se
você tiver uma chave própria, defina `PDPJ_API_KEY`; ela nunca é exibida nas
respostas das ferramentas.

---

## Como o tribunal é descoberto

O número único da Resolução CNJ 65/2008 carrega o tribunal:

```
NNNNNNN-DD.AAAA.J.TR.OOOO
                  │  └── código do tribunal dentro do segmento
                  └───── segmento do judiciário
```

`…8.26.…` → Justiça Estadual de São Paulo → índice `api_publica_tjsp`.
`…5.02.…` → TRT da 2ª Região → `api_publica_trt2`.

Por isso quase nunca é preciso informar o tribunal. Os 91 índices públicos estão
mapeados: STJ, TST, TSE, STM, 6 TRFs, 24 TRTs, 27 TREs, 27 TJs e os 3 tribunais
de justiça militar estadual. O STF e o CNJ não têm índice na API pública.

O dígito verificador é conferido pelo módulo 97 base 10 (ISO 7064) antes de
qualquer chamada — número errado vira mensagem com o número corrigido, não uma
consulta perdida.

---

## Limites do dado

O DataJud publica **metadados**, nunca o conteúdo dos autos: não há partes,
advogados, petições, decisões na íntegra ou documentos. Esses nomes só chegam
pelo DJEN, e com as ressalvas da seção anterior. Além disso:

- Processos em segredo de justiça não aparecem, ou aparecem parcialmente.
- A carga é feita pelos tribunais; há defasagem, e ela varia por tribunal. As
  ferramentas sempre reportam a data da última atualização da base.
- A **situação processual é inferida** pelo texto dos movimentos — é uma leitura,
  não um campo oficial. Para decisão profissional, confirme no sistema do tribunal.
- O DJEN cobre as comunicações a partir da adesão de cada tribunal. Processo
  antigo, em papel ou em segredo de justiça pode não ter publicação eletrônica —
  ausência de advogado no resultado não significa ausência de advogado nos autos.

---

## Desenvolvimento

```bash
npm run build     # compila TypeScript para dist/
npm run watch     # recompila ao salvar
npm test          # build + suíte de testes (node:test)
npm run inspector # MCP Inspector sobre o servidor compilado
```

Estrutura:

```
src/
  index.ts          entrada: McpServer + transporte stdio
  config.ts         variáveis de ambiente (carrega .env sem dependências)
  constants.ts      limites de resposta e paginação
  types.ts          tipos do domínio
  schemas/          schemas Zod de entrada das ferramentas
  services/
    cnj.ts          número único: validação, dígito verificador, decomposição
    djen.ts         cliente do DJEN, com leitura tolerante a variações de schema
    pessoas.ts      consolidação de advogados e extração de auxiliares da justiça
    tribunais.ts    catálogo dos 91 índices e dedução pelo número
    datajud.ts      cliente HTTP, cache e erros acionáveis
    analise.ts      motor de análise: categorias, métricas, marcos, alertas
    resolver.ts     fluxo comum: valida → descobre tribunal → consulta → analisa
    formato.ts      renderização markdown
    demo.ts         fixture do modo demonstração
  tools/            registro das ferramentas MCP
test/               testes unitários e de integração ponta a ponta
```

Os testes de integração sobem o servidor em memória (`InMemoryTransport`) e
chamam as ferramentas como um cliente MCP faria, em modo demonstração — a suíte
roda sem acesso à rede.

---

## Licença

MIT.
