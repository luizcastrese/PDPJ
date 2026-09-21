---
name: slides-rj
description: Monta a triagem de uma recuperação judicial como apresentação padronizada, publicada em Artifact — passivo por classe do art. 41 a partir do QGC ou da relação inicial de credores, patrimônio bem a bem com ônus e gravames, estimativa das áreas dadas em garantia por preço de referência FNP, e a cobertura resultante (garantia estimada contra crédito garantido, e ativo livre contra passivo quirografário). Complementa com fase, marcos da Lei 11.101/2005 e dados do processo via MCP pdpj. Use quando o pedido for slides, deck, apresentação, triagem, screening, "prepara para o comitê", "leva para a reunião", ou quando houver QGC, relação de credores, planilha de patrimônio ou de garantias para analisar.
---

# Slides de recuperação judicial

Converte o que as ferramentas `pdpj_*` levantaram em um deck sempre com a
mesma espinha dorsal, para que dois casos diferentes possam ser comparados
slide a slide — e para que quem recebe saiba onde procurar cada coisa.

## As entradas mandam

O eixo do deck são as planilhas que o usuário fornece — QGC ou relação inicial
de credores, patrimônio do grupo item a item, e a referência de preço de terra
FNP. Delas saem o passivo, o patrimônio e a estimativa de garantias. O contrato
de cada uma, o modelo de estimativa e o cálculo de cobertura estão em
[avaliacao.md](avaliacao.md) — **leia antes de calcular qualquer coisa**.

Falta uma das três? Monte o deck com o que há e diga, no slide, o que não pôde
ser calculado por falta de qual entrada. Não substitua planilha ausente por
extração de edital sem avisar: são graus de confiança diferentes.

## O MCP complementa

O `pdpj` responde o que a planilha não tem — número, juízo, classe, fase,
marcos da Lei 11.101/2005, stay period, administrador judicial. Rode o
levantamento seguindo a skill **`dossie-rj`** se ela estiver disponível.

1. Sem número: `pdpj_localizar_processos` com o nome do grupo.
2. `pdpj_dossie_recuperacao` — é a espinha dorsal do deck inteiro.
3. `pdpj_relacao_credores` com `limit` alto, se o passivo for o foco.
4. `pdpj_ativos_garantias`, se o ativo for o foco.
5. `pdpj_historico_empresa`, para o slide de história judicial.

Se as ferramentas `pdpj_*` não existirem na sessão, siga com as planilhas e
diga que os slides de processo ficaram sem fonte. Nunca preencha nenhum dos
dois lados com conhecimento geral sobre a empresa: um slide bonito com número
inventado é pior que slide nenhum, porque circula sem você junto.

## Depois, desenhe

Leia [estrutura.md](estrutura.md): ele fixa a sequência dos slides, o conteúdo
de cada um e os tokens visuais que fazem os decks parecerem da mesma família.

Carregue também a skill **`artifact-design`** antes de escrever a página, e
**`dataviz`** antes de desenhar o gráfico de composição do passivo.

Publique como Artifact HTML. Título: o nome da devedora mais a expressão que
identifica o caso — "Metalúrgica Andrade · Recuperação Judicial" —, nunca
"Apresentação" nem "Dossiê".

## As regras que não se negociam

Valem mais aqui do que no relatório em prosa, porque o deck circula sozinho:

- **Nenhum número inventado.** Valor que não foi lido é `—`, não zero. Soma
  parcial nunca é apresentada como total: o rótulo diz o que ela soma, e o que
  ficou de fora aparece contado ao lado.
- **Estimativa nunca se disfarça de avaliação.** O valor das áreas é área
  declarada vezes preço regional de referência, e o slide diz isso com essas
  palavras, junto da data da referência FNP e de quantos itens ficaram sem
  preço aplicável.
- **Dado e extração ficam visualmente distintos.** Classe, datas e movimentos
  vêm de campo; credores, motivo e bens vêm de texto de edital. O deck marca a
  diferença — a legenda está em `estrutura.md`.
- **Fonte indisponível não vira slide vazio.** Se o DJEN não respondeu, os
  slides que dependem dele dizem "não avaliado — fonte indisponível", com o
  motivo. Vazio por indisponibilidade não é vazio por ausência, e num slide
  essa confusão é irreversível.
- **O slide de cobertura e limites nunca sai.** É o último, é obrigatório, e
  não é rodapé em corpo 8: é slide inteiro. Quem recebe o deck não esteve nesta
  conversa e não sabe o que ficou de fora.
- **Cada afirmação jurídica cita o dispositivo.** As ferramentas já devolvem a
  base de cada marco e de cada fator; leve-a para o slide.
- **A situação é inferida**, não é campo oficial — e a data da última carga do
  DataJud vai no slide de fontes.

## Quando o caso é de grupo

Se `pdpj_localizar_processos` encontrou mais de uma razão social do mesmo
núcleo, diga na capa qual processo o deck cobre e liste as coligadas
identificadas no slide de identificação. Consolidação processual reúne as
devedoras num processo só, mas nem todo grupo consolida — não presuma.
