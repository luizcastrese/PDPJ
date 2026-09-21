# Estrutura padrão do deck

O que fixa a padronização: a sequência dos slides, o papel de cada um e os
tokens visuais. Dois casos diferentes viram dois decks comparáveis slide a
slide — é isso que permite pôr dois credores lado a lado numa mesa.

> **Pendente.** Os slides 7 a 9 dependem do esquema da planilha FNP (QGC ou
> relação inicial de credores, patrimônio do grupo com ônus e gravames, valor
> das garantias). Enquanto o esquema não estiver definido, monte-os a partir do
> que `pdpj_relacao_credores` e `pdpj_ativos_garantias` devolverem, e deixe
> explícito no slide que a fonte é extração de edital, não a planilha.

## Sequência

| # | Slide | Conteúdo | Fonte |
| --- | --- | --- | --- |
| 1 | Capa | Devedora, CNPJ, número CNJ, juízo, data do levantamento | campo |
| 2 | Retrato | Fase da LRF + quatro números: passivo lido, nº de credores, stay period, tempo de tramitação | campo + extração |
| 3 | Identificação | Classe, vara, ajuizamento, administrador judicial, coligadas identificadas | campo |
| 4 | Motivo do pedido | Causas agrupadas + um trecho citado do edital | extração |
| 5 | Linha do tempo | Marcos com o dispositivo de cada um | campo |
| 6 | Fatores legais | Um cartão por fator, na cor do seu tom | derivado |
| 7 | Passivo por classe | Tabela por classe do art. 41 + composição | planilha / extração |
| 8 | Maiores credores | Ordenados por valor, com classe | planilha / extração |
| 9 | Ativos | Fora do concurso (art. 49, §3º) · Classe II · Constrições · Livres | planilha / extração |
| 10 | Cobertura e limites | **Obrigatório.** O que foi consultado, em que período, e o que ficou fora por construção | — |
| 11 | Fontes | DataJud com a data da carga, DJEN, data de geração | — |

O slide 10 é slide inteiro, nunca rodapé. Quem recebe o deck não esteve na
conversa que o produziu.

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
