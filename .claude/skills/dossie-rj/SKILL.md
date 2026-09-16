---
name: dossie-rj
description: Monta o dossiê de uma empresa em recuperação judicial ou falência a partir de fontes públicas — história e identificação da devedora, motivo do pedido de RJ, fatores legais mais relevantes da Lei 11.101/2005, relação de credores por classe do art. 41 e ativos separados entre livres e gravados. Use quando o pedido mencionar recuperação judicial, RJ, falência, recuperanda, quadro geral de credores, relação de credores, stay period, plano de recuperação, administrador judicial, ou pedir o dossiê/panorama de uma empresa em crise — seja por número de processo CNJ, seja pelo nome da empresa.
---

# Dossiê de recuperação judicial

Levanta, a partir das ferramentas `pdpj_*`, o retrato de uma empresa em
recuperação judicial: o que aconteceu, por que aconteceu, quem são os
credores e o que sobrou de patrimônio — separando sempre o que é dado do
que é leitura de texto.

## Ferramentas necessárias

Este dossiê depende do servidor MCP `pdpj` estar conectado. Confirme com
`pdpj_status` antes de começar. Se as ferramentas `pdpj_*` não existirem na
sessão, **pare e diga isso** — não substitua o levantamento por conhecimento
geral sobre a empresa, nem por busca na web apresentada como se fosse o
processo.

| Ferramenta | Papel no dossiê |
| --- | --- |
| `pdpj_dossie_recuperacao` | Chamada principal: fase, marcos, stay period, fatores legais, credores e ativos de uma vez |
| `pdpj_historico_empresa` | Acha a RJ pelo nome da empresa; situa a crise no tempo pelas execuções anteriores |
| `pdpj_relacao_credores` | Passivo completo, por classe do art. 41, com filtros e paginação |
| `pdpj_ativos_garantias` | Detalhe dos gravames, constrições e bens declarados livres |
| `pdpj_identificar_envolvidos` | Administrador judicial, advogados, partes |
| `pdpj_listar_movimentos` | Aprofundar um marco específico na linha do tempo |

## Roteiro

1. **Sem número de processo**: comece por `pdpj_historico_empresa` com a
   razão social. Ele devolve os processos da empresa e destaca os de
   insolvência. Confirme com o usuário qual é a RJ antes de seguir, se houver
   mais de uma.
2. **Com número**: chame `pdpj_dossie_recuperacao`. Ele é a espinha dorsal —
   as demais chamadas só complementam.
3. **Aprofunde apenas o que o pedido pediu.** Se o usuário quer o passivo,
   `pdpj_relacao_credores` com `limit` alto. Se quer o ativo,
   `pdpj_ativos_garantias`. Não dispare tudo por reflexo.
4. **Se nenhum edital for localizado**, repita com `max_publicacoes=100`
   antes de concluir que a relação não existe. O edital do art. 52, §1º sai
   logo depois do deferimento e costuma estar entre as publicações mais
   antigas do processo.
5. **Se a empresa tiver grupo econômico** (consolidação processual), o dossiê
   cobre apenas o número consultado. Diga isso, e ofereça rodar os demais.

## Estrutura do relatório

Escreva em prosa, em português, nesta ordem. Cada seção nomeia a fonte.

### 1. História e identificação
Razão social, CNPJ, classe, juízo (a vara especializada em si já diz algo),
data do ajuizamento, tempo de tramitação, administrador judicial. Se houver
`pdpj_historico_empresa`, some aqui a história **judicial**: desde quando há
execuções fiscais e trabalhistas, em quantos tribunais, e quando a curva
acelerou — é o que mostra a crise se formando antes do pedido.

Diga com todas as letras que fundação, sócios, capital social e filiais **não
estão em base judicial**: vêm da Junta Comercial e do CNPJ na Receita Federal.

### 2. Motivo do pedido
Os indícios vêm do resumo do pedido do devedor, que o edital do art. 52, §1º,
I, é obrigado a conter. Agrupe as causas (pandemia, queda de faturamento,
endividamento, inadimplência, custos, câmbio, clima, gestão) e **cite o
trecho** de pelo menos uma. Se nada foi encontrado, diga que o resumo não foi
ao diário e que a exposição completa está na inicial (art. 51, I) e no laudo
econômico-financeiro (art. 51, II).

### 3. Fatores legais mais relevantes
Use os fatores que a ferramenta devolve, com o dispositivo de cada um. Ordene
por consequência prática, não pela ordem em que vieram. Os que quase sempre
importam:

- **Fase e stay period** (art. 6º, §4º): em curso, prorrogado, ou vencido — e
  o que muda para as execuções em cada caso.
- **Créditos fora do concurso** (art. 49, §3º): é o fator que mais altera o
  valor efetivo do ativo e o poder de barganha dos credores sujeitos.
- **Deliberação do plano** (arts. 45, 56 e 58): aprovado, rejeitado, cram down.
- **Biênio de fiscalização** (art. 61) e risco de convolação (art. 73).
- **Verificação de créditos em disputa** (arts. 7º a 18): a lista publicada
  ainda não é o quadro geral.

### 4. Relação de credores
Tabela por classe, com contagem e soma, seguida dos maiores credores.
**Diga qual das três relações foi usada** — a diferença é material:

| Fonte | O que é | Confiabilidade |
| --- | --- | --- |
| art. 52, §1º | relação do próprio devedor | inicial, unilateral |
| art. 7º, §2º | relação do administrador judicial | já passou por habilitações e divergências |
| art. 18 | quadro geral de credores | definitiva, após julgadas as impugnações |

Informe quantos valores não puderam ser atribuídos a um nome. Não some por
cima disso como se a soma fosse o passivo total: é a soma do que foi lido.

### 5. Ativos — livres e gravados
Quatro blocos, nesta ordem, nunca misturados:

1. **Gravados, fora do concurso** (art. 49, §3º) — alienação e cessão
   fiduciária, arrendamento mercantil, reserva de domínio. O titular não se
   submete ao plano; o bem não entra no rateio. Ressalva: bens de capital
   essenciais não podem ser retirados durante a suspensão.
2. **Gravados, garantia real sujeita ao plano** (Classe II, art. 41, II) —
   hipoteca, penhor, anticrese, caução. Suprimir a garantia exige aprovação do
   credor titular (art. 50, §1º).
3. **Constrições** — penhora, bloqueio, indisponibilidade. Não são garantia;
   sobre bem essencial, a substituição compete ao juízo da recuperação
   (art. 6º, §7º-B).
4. **Declarados livres** — só o que o texto publicado afirma desembaraçado.

Some aqui os credores da Classe II: cada um implica um bem gravado, mesmo
quando o edital não descreve qual.

### 6. O que não dá para obter por fonte pública
Feche com a tabela de lacunas e onde supri-las: autos, Junta Comercial,
Receita Federal, cartório de registro de imóveis.

## Regras que não se negociam

- **Extração não é campo.** Credores, motivo e bens saem do texto de
  publicações. Diga isso, e mantenha os trechos de origem à mão para quem
  quiser conferir.
- **Ausência de gravame não faz bem livre.** A relação de bens é peça dos
  autos (art. 51, III e IV) e não vai ao diário. O levantamento de ativos
  nunca é apresentado como inventário patrimonial.
- **Não complete lacuna com memória.** Se o dado não veio das ferramentas,
  ele não entra no dossiê — nem como "provavelmente". Notícia sobre a empresa
  não é substituta de peça processual.
- **Datas e prazos são cálculo de calendário** sobre a data do movimento. O
  juízo pode ter fixado termo diverso, e o DataJud tem defasagem de carga que
  varia por tribunal. Cite a data da última atualização da base.
- **Segredo de justiça e carga incompleta** produzem resultado vazio, que não
  é o mesmo que ausência do fato. Diga qual das duas hipóteses se aplica
  quando der para distinguir.
- Para decisão profissional, o dossiê é ponto de partida: a confirmação é nos
  autos.

Os artigos citados estão reunidos em [referencia-lrf.md](referencia-lrf.md),
para consulta quando precisar de precisão maior do que a das ferramentas.
