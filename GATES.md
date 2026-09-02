# Quality Gates — ding-dong

Checagens determinísticas de aprovação/reprovação que guardam a integridade
estrutural e comportamental do projeto. Um único ponto de entrada roda todas,
na ordem, e para na primeira falha.

```bash
npm run gate           # todos os gates, barato → caro, para no 1º erro
npm run gate:lint      # um gate isolado
```

Construídos em 2026-09-02 em modo **brownfield**: o projeto já tinha ESLint e
uma suíte Mocha, então os gates se adaptaram ao que existe em vez de substituir.

---

## Os gates

| `id` | O que verifica | Comando isolado |
|---|---|---|
| `lint` | ESLint (config `google`), falhando só em violações **novas** | `npm run gate:lint` |
| `arch` | Limites estruturais do grafo de módulos e do manifesto | `npm run gate:arch` |
| `tests` | Suíte unitária Mocha (72 testes) | `npm run gate:tests` |
| `deadcode` | Arquivos, exports e dependências sem uso (Knip) | `npm run gate:deadcode` |

Ordem de execução: `lint → arch → tests → deadcode`.

Estes são os `id`s que o `spec-writer` declara no `contract.md` de cada feature
e que `implement-feature` / `evaluator` executam via `npm run gate:<id>`.

### `lint` — baseline por impressão digital

O repositório tinha 13 erros de lint pré-existentes, **11 deles em
`lib/context.js`** — justamente o arquivo central. Exigir zero erros quebraria
o build; limitar o lint aos arquivos alterados puniria quem tocasse em
`context.js` com 11 erros herdados que não são dele.

Então `.lintbaseline.json` grava cada violação conhecida e o gate falha apenas
nas novas. A impressão digital é `arquivo|regra|linha-de-código`, **não** o
número da linha: inserir código acima de uma violação existente desloca a
linha sem criar violação nova, e isso não pode ser acusado como regressão.

```bash
npm run gate:baseline   # regrava o baseline
```

Rode isso **somente depois de reduzir a dívida**, nunca para silenciar uma
violação nova — o arquivo só deve encolher. Quando o gate detecta que
violações do baseline foram corrigidas, ele avisa para você travar a melhora.

A regra `camelcase` isenta `escape_digits` (`.eslintrc.json`). Não é
silenciamento: é nome de parâmetro da API pública, documentado em
[`API.md`](API.md) e espelhando o protocolo AGI do Asterisk. Isso eliminou 18
dos 31 erros originais.

### `arch` — quatro regras, todas medidas neste repositório

Três vivem em `.dependency-cruiser.cjs` (grafo de imports):

1. **`no-circular`** — dois módulos que se exigem mutuamente não podem ser
   carregados nem testados isoladamente.
2. **`no-orphans`** — módulo que ninguém importa e que não importa ninguém:
   ou está morto, ou o import que deveria existir foi esquecido.
3. **`lib-not-to-test-or-example`** — `lib/` é o artefato publicado; importar
   de `test/` ou `example/` levaria código não publicado para dentro do pacote.
4. **`lib-no-runtime-deps`** — `lib/` só depende de módulos nativos do Node e
   de si mesma.

A quarta vive em `scripts/check-architecture.js`, porque nenhuma ferramenta
genérica a expressa:

5. **`dependencies` fica vazio** em `package.json`. Invariante real deste
   projeto, não preferência: o commit `5a9b086` removeu `readable-stream` para
   usar o `stream` nativo. Qualquer dependência declarada aqui é herdada por
   todo consumidor da biblioteca.
6. **`lib/` não lê `process.env`.** Uma biblioteca é configurada por quem a
   chama — pelo objeto `options` do construtor de `AgiServer` — nunca pelo
   ambiente do processo hospedeiro: ler env acopla o consumidor a nomes de
   variáveis que ele não escolheu.

> ⚠️ Em `.dependency-cruiser.cjs`, `doNotFollow` mantém o módulo npm como nó do
> grafo sem entrar nele. **Não troque por `exclude`**: excluir apaga a aresta
> `lib → pacote` e a regra `lib-no-runtime-deps` passa a aprovar silenciosamente
> o que deveria barrar. Isso aconteceu de verdade durante a construção destes
> gates, e só apareceu porque cada gate foi testado contra uma violação
> deliberada.

### `deadcode`

Knip, configurado em `knip.json`. `scripts/check-architecture.js` está
declarado como *entry* porque `runGate` o invoca como subprocesso, não como
import — sem isso o Knip o acusa de órfão. `dependency-cruiser` está em
`ignoreDependencies` pela mesma razão: é executado por caminho, então nenhuma
análise estática o enxerga como usado.

---

## Como cada gate foi verificado

Todo gate foi provado nos dois sentidos: verde no estado atual, **e vermelho
contra uma violação deliberada**, revertida em seguida.

| Gate | Verde no baseline | Falha provada com |
|---|---|---|
| `lint` | 0 violações novas (13 toleradas) | linha de 100+ colunas em `lib/state.js` → exit 1 |
| `arch` | 11 módulos, 0 violações | `dependencies` não-vazio → exit 1; `require('mocha')` em `lib/` → exit 1 |
| `tests` | 72/72 passando | asserção alterada → 1 failing, exit 1 |
| `deadcode` | 0 achados | arquivo órfão em `lib/` → exit 1 |

---

## O que estes gates NÃO verificam

Um run verde é rotineiramente confundido com "verificado". As lacunas abaixo
são invisíveis justamente porque nada as reporta. Esta seção é o único lugar
versionado onde essas obrigações vivem — a pasta `.claude/` é gitignorada e não
chega ao time.

- **Nenhum Asterisk real.** Todos os 72 testes trocam o socket por um
  `memorystream`. Nada aqui conecta a um PBX de verdade nem fala FastAGI numa
  conexão TCP real. A conformidade da biblioteca com o protocolo AGI é
  verificada contra a *expectativa escrita no teste*, não contra o Asterisk —
  se o entendimento do protocolo estiver errado, os testes concordam com o erro
  e passam. Isso exige uma validação manual contra uma instância real.
- **`mocha --exit` mascara handles abertos.** A flag mata o processo à força ao
  fim da suíte, então socket ou timer vazado nunca aparece como falha. Um
  vazamento de recurso em `Context` passa por estes gates sem ruído.
- **Não há limiar de cobertura.** 72 testes passam, mas nada afirma que fração
  de `lib/` eles tocam. Função nova sem teste algum passa no gate `tests`.
- **As 13 violações de lint do baseline são toleradas em silêncio.** Estão
  listadas em `.lintbaseline.json`, com nome de arquivo e regra. Não são
  reportadas a cada run; só o crescimento é.
- **Não há `typecheck`.** Foi avaliado e deliberadamente omitido: `tsc
  --checkJs` acusa 6 erros em `lib/context.js` que são falsos positivos
  estruturais — a herança via `util.inherits` ([`lib/context.js:38`](lib/context.js#L38))
  não é compreendida pelo TypeScript, que então nega `emit`/`on` num objeto que
  comprovadamente os tem. Corrigi-los exigiria anotar código de aplicação.
  Nenhum contrato de tipos é verificado neste projeto.
- **A matriz de versões do Node não é verificada.** `.travis.yml` declara Node
  8, 10, 11 e 12 — todas em fim de vida. Os gates rodam no Node local (v22
  durante a construção). Nada garante que a biblioteca funcione nas versões que
  ela afirma suportar, nem que a declaração ainda faça sentido.
- **Não há gate de segurança.** `npm audit` reporta 17 vulnerabilidades, todas
  em `devDependencies` (o projeto tem zero dependências de runtime, então nada
  disso chega a quem consome a lib). Nenhum gate falha por causa delas.
