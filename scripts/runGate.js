/**
 * Orquestrador dos quality gates (ver GATES.md).
 *
 *   node scripts/runGate.js          roda todos, na ordem, para no 1º erro
 *   node scripts/runGate.js lint     roda um gate isolado
 *
 * Ordem: barato → caro. Sai com código ≠ 0 em qualquer falha, para que CI e
 * as skills do fluxo SDD (`implement-feature`, `evaluator`) possam depender
 * dele.
 *
 * Para acrescentar um gate: empurre um `{id, label, run}` no array GATES na
 * posição de custo correspondente, adicione o script `gate:<id>` no
 * package.json e documente-o no GATES.md.
 */

const spawnSync = require('child_process').spawnSync;
const path = require('path');
const checkLint = require('./lint-baseline').checkLint;

/**
 * Caminho do executável de um pacote, com o sufixo do Windows quando preciso.
 * Resolvido explicitamente porque runGate também roda fora do `npm run`, onde
 * node_modules/.bin não está no PATH.
 * @param {string} name nome do binário
 * @return {string} caminho do executável
 */
function bin(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join('node_modules', '.bin', name + suffix);
}

/**
 * Roda um comando herdando a saída; true quando o código de saída é 0.
 * @param {string} cmd comando
 * @param {!Array<string>} args argumentos
 * @return {boolean} true se passou
 */
function run(cmd, args) {
  const result = spawnSync(cmd, args, {stdio: 'inherit', shell: false});
  if (result.error) {
    console.error(
        '  ✗ não consegui executar ' + cmd + ': ' + result.error.message);
    return false;
  }
  return result.status === 0;
}

const GATES = [
  {
    id: 'lint',
    label: 'ESLint — falha só em violações novas vs. .lintbaseline.json',
    run: function() {
      return checkLint();
    },
  },
  {
    id: 'arch',
    label: 'Limites estruturais — dependency-cruiser + regras do manifesto',
    run: function() {
      return run(bin('depcruise'), ['lib', 'test', 'example']) &&
          run(process.execPath, ['scripts/check-architecture.js']);
    },
  },
  {
    id: 'tests',
    label: 'Mocha — suíte unitária completa',
    run: function() {
      return run(bin('mocha'), ['--exit']);
    },
  },
  {
    id: 'deadcode',
    label: 'Knip — arquivos, exports e dependências sem uso',
    run: function() {
      return run(bin('knip'), ['--no-config-hints']);
    },
  },
];

const requested = process.argv[2];
const selected = requested ?
    GATES.filter(function(g) {
      return g.id === requested;
    }) :
    GATES;

if (requested && selected.length === 0) {
  console.error(
      'gate desconhecido: "' + requested + '". Disponíveis: ' +
      GATES.map(function(g) {
        return g.id;
      }).join(', '));
  process.exit(1);
}

let failed = null;
for (let i = 0; i < selected.length; i++) {
  console.log('\n─── [' + selected[i].id + '] ' + selected[i].label);
  if (!selected[i].run()) {
    failed = selected[i];
    break;
  }
}

console.log('');
if (failed) {
  const skipped = selected.slice(selected.indexOf(failed) + 1);
  console.error('✗ gate [' + failed.id + '] falhou.');
  if (skipped.length > 0) {
    console.error(
        '  Não executados: ' + skipped.map(function(g) {
          return g.id;
        }).join(', ') + ' (o orquestrador para na primeira falha).');
  }
  process.exit(1);
}

console.log('✓ ' + selected.map(function(g) {
  return g.id;
}).join(', ') + ' — tudo verde');
