---
name: slides-rj
description: Transforma o levantamento do MCP pdpj em uma apresentação padronizada de recuperação judicial, publicada como Artifact — capa, retrato do caso, motivo do pedido, linha do tempo da Lei 11.101/2005, passivo por classe do art. 41, ativos separados entre gravados e livres, e o slide obrigatório de cobertura e limites. Use quando o pedido for slides, deck, apresentação, "monta uns slides", "prepara para o comitê", "leva para a reunião" sobre uma recuperação judicial, falência ou empresa em crise — ou quando o usuário pedir o dossiê já em formato de apresentação.
---

# Slides de recuperação judicial

Converte o que as ferramentas `pdpj_*` levantaram em um deck sempre com a
mesma espinha dorsal, para que dois casos diferentes possam ser comparados
slide a slide — e para que quem recebe saiba onde procurar cada coisa.

## Antes de desenhar, levante

Slides não são a fonte: são a apresentação dela. Rode o levantamento primeiro,
seguindo a skill **`dossie-rj`** se ela estiver disponível.

1. Sem número: `pdpj_localizar_processos` com o nome do grupo.
2. `pdpj_dossie_recuperacao` — é a espinha dorsal do deck inteiro.
3. `pdpj_relacao_credores` com `limit` alto, se o passivo for o foco.
4. `pdpj_ativos_garantias`, se o ativo for o foco.
5. `pdpj_historico_empresa`, para o slide de história judicial.

Se as ferramentas `pdpj_*` não existirem na sessão, **pare e diga isso**. Não
monte um deck com conhecimento geral sobre a empresa: um slide bonito com
número inventado é pior que slide nenhum, porque circula sem você junto.

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

- **Nenhum número inventado.** Valor que não foi lido é `—`, não zero e não
  estimativa. Soma parcial nunca é apresentada como passivo total: o rótulo diz
  "soma do que foi lido", e o número de valores não atribuídos aparece junto.
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
