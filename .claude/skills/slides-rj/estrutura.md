# Estrutura padrão do deck

O que fixa a padronização: a sequência dos slides, o papel de cada um e os
tokens visuais. Dois casos diferentes viram dois decks comparáveis slide a
slide — é isso que permite pôr dois credores lado a lado numa mesa.

Os slides 7 a 10 saem das planilhas fornecidas pelo usuário, pelo contrato de
[avaliacao.md](avaliacao.md). Sem planilha, monte-os do que
`pdpj_relacao_credores` e `pdpj_ativos_garantias` devolverem e marque a
procedência como extração de edital — grau de confiança menor, declarado.

## Sequência

| # | Slide | Conteúdo | Fonte |
| --- | --- | --- | --- |
| 1 | Capa | Devedora, CNPJ, número CNJ, juízo, data do levantamento | campo |
| 2 | Retrato | Fase da LRF + quatro números: passivo lido, nº de credores, stay period, tempo de tramitação | campo + extração |
| 3 | Identificação | Classe, vara, ajuizamento, administrador judicial, coligadas identificadas | campo |
| 4 | Motivo do pedido | Causas agrupadas + um trecho citado do edital | extração |
| 5 | Linha do tempo | Marcos com o dispositivo de cada um | campo |
| 6 | Fatores legais | Um cartão por fator, na cor do seu tom | derivado |
| 7 | Passivo por classe | Tabela por classe do art. 41 + composição; qual relação foi usada | planilha |
| 8 | Maiores credores | Ordenados por valor, com classe e garantia vinculada | planilha |
| 9 | Patrimônio | Bem a bem: tipo, área, situação, gravame, credor titular | planilha |
| 10 | Garantias e cobertura | Estimativa por área × preço FNP, nível de confiança por item, cobertura da Classe II e ativo livre estimado | calculado |
| 11 | Cobertura e limites | **Obrigatório.** O que entrou, o que ficou sem referência, e o que esta triagem não verifica | — |
| 12 | Fontes | Relação de credores usada, data da referência FNP, DataJud com a data da carga, DJEN, data de geração | — |

O slide 11 é slide inteiro, nunca rodapé. Quem recebe o deck não esteve na
conversa que o produziu — e uma estimativa por preço regional circula com
aparência de avaliação se ninguém disser o contrário na mesma tela.

O slide 10 é o que a mesa procura: cobertura da Classe II, quanto está fora do
concurso pelo art. 49, §3º, e o ativo livre estimado contra o passivo
quirografário. Apresente a última razão como faixa, nunca como número cravado.

## Legenda de procedência

Todo slide que mistura as duas naturezas carrega a legenda:

- **●** dado de campo — classe, datas, movimentos, advogados
- **○** extraído de texto de edital — credores, motivo, bens
- **▣** fornecido pela planilha — quando o número veio do QGC ou da FNP

Fonte indisponível não vira espaço em branco: o slide diz "não avaliado —
fonte indisponível", com o motivo.

## Tokens visuais

Declare todos no `:root` puro antes de qualquer bloco de tema, e redefina
apenas os tokens nos blocos escuros.

```css
:root {
  --papel: #F6F7F5;          /* ground claro, levemente frio */
  --tinta: #14181C;          /* texto */
  --acento: #1F5F5B;         /* petróleo — títulos, régua, marcações */
  --neutro: #6B7671;         /* cinza com viés do acento */
  --linha: #DDE2DE;

  --ok: #2E7D5B;             /* semânticos: separados do acento */
  --alerta: #B07A16;
  --risco: #A63A2B;
}
```

Tipografia: **Fraunces** para títulos, **IBM Plex Sans** para texto, **IBM Plex
Mono** para número de processo, valores e qualquer coluna que precise alinhar
dígito — com `font-variant-numeric: tabular-nums`.

Formato: slides 16:9 empilhados, um `<section>` por slide, com `max-width` e
`aspect-ratio`; em largura de telefone viram blocos empilhados que rolam.
