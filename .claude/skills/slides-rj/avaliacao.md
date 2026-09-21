# Avaliação de garantias para triagem

Modelo de estimativa das áreas dadas em garantia, no nível de **screening**:
suficiente para ordenar casos e decidir onde aprofundar, insuficiente para
sustentar valor em juízo.

> **Isto não é avaliação.** Não segue a NBR 14653, não considera benfeitorias,
> topografia, aptidão agrícola, acesso, passivo ambiental, reserva legal e APP,
> nem restrições de matrícula. É área declarada multiplicada por preço regional
> de referência. O slide diz isso, com essas palavras.

## As três entradas

A skill lê três tabelas. Os nomes das colunas na planilha de origem não
importam — o que importa é que cada campo abaixo possa ser mapeado. Campo
ausente vira `—` e o item cai de nível de confiança; **nunca vira zero, nem
valor arbitrado**.

### 1. Credores — QGC ou relação inicial

| Campo | Obrigatório | Observação |
| --- | --- | --- |
| `credor` | sim | razão social ou nome |
| `documento` | não | CNPJ/CPF |
| `classe` | sim | I, II, III, IV ou extraconcursal (art. 41 e art. 49, §3º) |
| `valor` | sim | crédito habilitado |
| `bem_vinculado` | não | id do bem que garante este crédito |

Registre de qual relação veio — art. 52, §1º, art. 7º, §2º ou art. 18. A
diferença entre elas é material e vai no slide.

### 2. Bens — patrimônio do grupo, item a item

| Campo | Obrigatório | Observação |
| --- | --- | --- |
| `id` | sim | para vincular a credor e a gravame |
| `descricao` | sim | |
| `tipo` | sim | rural, urbano, industrial, maquinário, veículo, recebível |
| `uf`, `municipio` | para rural | chave de busca do preço de referência |
| `area`, `unidade` | para rural | hectare ou m² |
| `classe_de_terra` | não | lavoura, pastagem, cerrado — refina a referência |
| `matricula` | não | |
| `situacao` | sim | livre ou gravado |
| `gravame_tipo` | se gravado | hipoteca, alienação fiduciária, penhor, arrendamento, penhora |
| `credor_titular` | se gravado | quem é o titular da garantia |
| `valor_declarado` | não | se o grupo atribuiu valor; entra como comparação, não como resultado |

### 3. Referência FNP — preço de terra

| Campo | Observação |
| --- | --- |
| `uf`, `regiao` | granularidade da tabela |
| `classe_de_terra` | lavoura alta/média/baixa, pastagem, cerrado |
| `preco` + `unidade` | R$/ha, ou sacas/ha com a cotação usada |
| `data_referencia` | preço de terra se move; a data vai no slide |

## Cálculo

```
valor_estimado(bem) = area × preco_referencia(uf, regiao, classe_de_terra)
```

**Nível de confiança**, carimbado por item e exibido:

| Nível | Quando |
| --- | --- |
| `regional` | casou UF + região + classe de terra |
| `estadual` | casou só a UF — média do estado |
| `sem referência` | não há preço aplicável; o item entra na lista **sem valor** |

Item `sem referência` nunca é omitido e nunca recebe valor arbitrado: ele
aparece na contagem e fica fora das somas, e o slide informa quantos são e
quanta área representam. Uma soma que esconde o que não conseguiu avaliar é
pior que uma soma incompleta declarada.

Bem não rural (maquinário, veículo, recebível) só entra com `valor_declarado`,
marcado como declarado pelo grupo — não estimado.

## Cobertura, que é o resultado

**Por credor titular de garantia:**

```
cobertura = Σ valor_estimado(bens que garantem o credor) ÷ crédito do credor
```

**Anti-dupla-contagem:** um bem pode garantir mais de um credor, e somar duas
vezes infla a garantia total. Consolide por bem, não por vínculo: o valor de
cada bem entra uma única vez no total, e a repartição entre credores é
apresentada à parte, com a ressalva de que a prioridade entre eles depende do
grau da garantia e da ordem de registro.

**O número que a mesa procura:**

| Indicador | Leitura |
| --- | --- |
| Cobertura da Classe II | garantia estimada ÷ crédito com garantia real |
| Garantia fora do concurso | quanto do ativo está sob art. 49, §3º — não entra no rateio |
| **Ativo livre estimado** | o que sobra, em tese, para quirografários e ME/EPP |
| Passivo quirografário | Classe III + IV |

A razão entre os dois últimos é o que dá a ordem de grandeza da perspectiva de
recuperação dos quirografários. Apresente-a como ordem de grandeza — uma faixa,
nunca um número cravado.

## Ressalvas obrigatórias no slide de garantias

Todas, sempre, no próprio slide e não em nota de rodapé:

- Estimativa por preço regional × área declarada. Não é avaliação nem laudo.
- Data da referência FNP usada.
- Quantos itens ficaram sem referência e quanta área representam.
- Área declarada pode divergir da registrada em matrícula.
- Preço de terra nua não inclui benfeitorias nem considera restrições
  ambientais e de matrícula, que podem ser determinantes.
- A prioridade entre credores sobre o mesmo bem depende do grau e da ordem de
  registro da garantia, que esta triagem não verifica.
