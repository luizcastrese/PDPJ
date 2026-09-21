# Escopo do pdpj-mcp-server

Versão 1.3.0 · documento de escopo

Servidor MCP que dá ao assistente acesso de **leitura** às duas bases públicas
de dados processuais do Judiciário brasileiro, e um módulo de análise de
recuperação judicial construído sobre o que a Lei 11.101/2005 obriga a publicar.

---

## 1. Fontes

| Fonte | O que é | O que entrega |
| --- | --- | --- |
| **DataJud** (CNJ) | Base Nacional de Dados do Poder Judiciário, instituída pela Resolução CNJ nº 331/2020 como fonte do sistema de estatística | Metadados e movimentos: classe, assuntos, órgão julgador, grau, datas, histórico da Tabela Processual Unificada |
| **DJEN** (PJe) | Diário de Justiça Eletrônico Nacional | Texto das comunicações e editais; advogados intimados com nome e OAB |

O DataJud **não tem partes, advogados nem peças** — por desenho, não por
bloqueio: peça processual nunca é enviada pelos tribunais ao CNJ. Nomes e
conteúdo só chegam pelo DJEN, e só na medida em que foram publicados.

---

## 2. Ferramentas (16)

### Processo — 6
`pdpj_analisar_processo` · `pdpj_consultar_processo` · `pdpj_listar_movimentos`
· `pdpj_buscar_processos` · `pdpj_comparar_processos` · `pdpj_consulta_avancada`

Consulta e leitura interpretada do andamento: situação inferida, tempo de
tramitação, tempo desde o último movimento, maior intervalo sem andamento,
ritmo, distribuição por categoria e por ano, pontos de atenção. Busca por
classe, assunto, órgão julgador, grau e período, por tribunal.

### Pessoas — 2
`pdpj_identificar_envolvidos` · `pdpj_buscar_publicacoes`

Advogados com nome e OAB (campo estruturado do DJEN), partes, e auxiliares da
justiça — administrador judicial, perito, curador, inventariante, leiloeiro —
extraídos do texto, com o trecho de origem.

### Recuperação judicial — 5
`pdpj_dossie_recuperacao` · `pdpj_relacao_credores` · `pdpj_ativos_garantias` ·
`pdpj_localizar_processos` · `pdpj_historico_empresa`

Ver a seção 3.

### Referência — 3
`pdpj_validar_numero` · `pdpj_listar_tribunais` · `pdpj_status`

Validação do dígito verificador pelo módulo 97 base 10 e dedução do tribunal
pelo número; catálogo dos 91 índices públicos. Funcionam sem rede.

Todas são somente leitura (`readOnlyHint`) e aceitam resposta em markdown ou
JSON.

---

## 3. Módulo de recuperação judicial

A premissa: a relação de credores e o resumo do pedido do devedor não são campo
de base alguma, mas os arts. 52, §1º, 7º, §2º e 18 da Lei 11.101/2005 mandam
publicá-los em edital — e edital vai ao diário. O módulo lê por essa janela.

**Entrega**

- **Fase e marcos** da LRF: deferimento (art. 52), plano (art. 53), assembleia
  (arts. 35 a 46), concessão (art. 58), biênio (art. 61), encerramento
  (art. 63), convolação em falência (art. 73), e mais uma dezena.
  Reconhecidos no nome do movimento **e** no texto da decisão publicada.
- **Stay period**: 180 dias corridos do deferimento, 360 com prorrogação
  registrada (art. 6º, §4º), com os dias decorridos e restantes.
- **Motivo do pedido**: trechos do resumo que o edital do art. 52, §1º, I é
  obrigado a conter, classificados por causa.
- **Relação de credores** pelas quatro classes do art. 41, com somas, e a
  identificação de qual das três relações foi usada.
- **Ativos**, separados pelo efeito jurídico: fora do concurso (art. 49, §3º —
  fiduciária, leasing, reserva de domínio), garantia real sujeita ao plano
  (Classe II), constrições, e bens declarados livres.
- **Fatores legais**: prazos em curso, desfechos e riscos, cada um com o
  dispositivo.
- **Localização pelo nome do grupo**, com reagrupamento por processo e
  reconhecimento da assinatura da consolidação processual (arts. 69-G a 69-J).

---

## 4. Maturidade, por área

Declarada porque o número que sai de um levantamento circula sem quem o
produziu.

| Área | Estado |
| --- | --- |
| Consulta e andamento de processo | **Confirmado** contra dado real do CNJ |
| Validação de número, catálogo de tribunais | **Confirmado** — offline |
| Advogados e partes | Campo estruturado do DJEN; alta confiança |
| Auxiliares da justiça | Extração de texto; exige conferência |
| Fase, marcos e stay period | Corrigido para ler também o texto publicado; **sem validação em edital real** |
| Relação de credores | **Sem validação em edital real** |
| Ativos e gravames | **Sem validação em edital real** |
| Localização pelo nome do grupo | **Sem validação em busca real** |

---

## 5. Fora do escopo

Limites da fonte, não do código. O diário publica a existência do ato, não o
seu conteúdo — fora das hipóteses em que a lei manda publicar.

- **Peças dos autos**: petição inicial, plano de recuperação, laudo
  econômico-financeiro, balanços, atas de assembleia, relatórios do
  administrador judicial, decisões na íntegra.
- **Relação de bens** do devedor (art. 51, III e IV) e **avaliação de
  patrimônio**: área, matrícula, localização, valor.
- **Busca por CNPJ**: nenhuma das duas bases o indexa. Toda busca por empresa
  depende da grafia do nome.
- **História societária**: fundação, sócios, capital, filiais — Junta Comercial
  e Receita Federal.
- **Fora do Judiciário**: arbitragem, execução extrajudicial, protesto, dívida
  ativa.
- **Processos em segredo de justiça**, e processos sem publicação eletrônica.
- **Monitoramento**: é consulta sob demanda. Não há alerta nem acompanhamento
  contínuo.

**Não há garantia de exaustividade.** Ausência de resultado não significa
ausência de processo.

---

## 6. Condições de operação

- **O DJEN só responde a conexões originadas no Brasil.** Fora do país, a
  distribuidora de conteúdo do serviço recusa por geolocalização — e com ela
  caem credores, motivo do pedido e ativos.
- **A API do DataJud é lenta**: uma busca por classe pode levar quase um
  minuto. O tempo limite padrão é de 90 segundos.
- **A chave do DataJud é a pública divulgada pelo CNJ**, compartilhada por
  todos os consumidores. Chave própria pode ser configurada.
- **Defasagem de carga**: os tribunais enviam ao CNJ com atraso que varia. Toda
  resposta traz a data da última atualização da base.

---

## 7. Formas de uso

| Forma | Onde funciona | Instalação |
| --- | --- | --- |
| **Extensão `.mcpb`** | App Claude para computador | Um clique; não exige Node.js |
| **Servidor local (stdio)** | Claude Code, app Claude | `claude mcp add` ou `npm run instalar:desktop` |
| **Conector remoto (HTTP)** | claude.ai em qualquer aparelho | Hospedagem com URL pública e token |

Acompanham o servidor três **prompts MCP**, que viram comando de barra no
cliente, e duas **skills** de projeto: `dossie-rj`, que fixa a estrutura do
relatório e as regras de honestidade, e `slides-rj`, que monta a triagem como
apresentação padronizada.

---

## 8. Princípios que o código sustenta

- **Extração não é campo.** Credores, motivo e bens saem de texto; cada item
  devolve o trecho de origem.
- **Vazio por indisponibilidade não é vazio por ausência.** Falha de fonte
  aparece no relatório, nunca vira seção em branco.
- **Nenhum valor arbitrado.** O que não foi lido é travessão; somas parciais
  são rotuladas pelo que somam, com o resto contado ao lado.
- **A situação processual é inferida**, não é campo oficial.
- **Toda afirmação jurídica cita o dispositivo.**

Para decisão profissional, o levantamento é ponto de partida: a confirmação é
nos autos.
