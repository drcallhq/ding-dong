/**
 * Gate `lint` com baseline por impressão digital.
 *
 * O repositório tem 13 erros de lint pré-existentes, 11 deles concentrados em
 * lib/context.js — o arquivo central. Exigir zero erros hoje quebraria o
 * build; limitar o lint aos arquivos alterados puniria quem tocasse em
 * context.js com 11 erros herdados que não são dele. Então gravamos cada
 * violação conhecida e falhamos apenas nas NOVAS.
 *
 * A impressão digital é `arquivo|regra|linha-de-código-sem-espaços`, e não o
 * número da linha: inserir código acima de uma violação existente desloca a
 * linha sem criar violação nova, e o gate não pode acusar isso como regressão.
 *
 *   node scripts/lint-baseline.js --write   regrava o baseline
 *   node scripts/lint-baseline.js           verifica (usado pelo gate)
 */

const fs = require('fs');
const CLIEngine = require('eslint').CLIEngine;

const BASELINE_PATH = '.lintbaseline.json';

/**
 * Roda o ESLint e devolve cada violação com sua impressão digital.
 * @return {!Array<!Object>} violações encontradas
 */
function collectViolations() {
  const engine = new CLIEngine({});
  const report = engine.executeOnFiles(['.']);
  const sourceCache = {};
  const violations = [];

  report.results.forEach(function(result) {
    const relPath = result.filePath.replace(process.cwd() + '/', '');
    if (!sourceCache[relPath]) {
      sourceCache[relPath] = fs.readFileSync(relPath, 'utf8').split('\n');
    }
    const lines = sourceCache[relPath];

    result.messages.forEach(function(msg) {
      const rule = msg.ruleId || 'fatal';
      const code = (lines[msg.line - 1] || '').trim();
      violations.push({
        file: relPath,
        line: msg.line,
        rule: rule,
        message: msg.message,
        fingerprint: relPath + '|' + rule + '|' + code,
      });
    });
  });
  return violations;
}

/**
 * Conta quantas vezes cada impressão digital aparece.
 * @param {!Array<!Object>} violations violações
 * @return {!Object<string, number>} mapa impressão digital -> contagem
 */
function toCounts(violations) {
  const counts = {};
  violations.forEach(function(v) {
    counts[v.fingerprint] = (counts[v.fingerprint] || 0) + 1;
  });
  return counts;
}

/**
 * Regrava o arquivo de baseline com o estado atual do repositório.
 */
function writeBaseline() {
  const violations = collectViolations();
  const baseline = {
    note: 'Violações de lint pré-existentes, toleradas pelo gate `lint`. ' +
        'Nada de novo deve ser adicionado aqui — este arquivo só deve ' +
        'encolher. Regrave com `npm run gate:baseline` DEPOIS de corrigir ' +
        'violações.',
    generatedAt: new Date().toISOString().slice(0, 10),
    total: violations.length,
    violations: toCounts(violations),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
      'lint-baseline: ' + violations.length + ' violação(ões) gravadas em ' +
      BASELINE_PATH);
}

/**
 * Compara o estado atual contra o baseline.
 * @return {boolean} true se não há violações novas
 */
function checkLint() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(
        'lint: ' + BASELINE_PATH + ' não existe. ' +
        'Rode `npm run gate:baseline` uma vez para criá-lo.');
    return false;
  }

  const saved = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const baseline = saved.violations;
  const violations = collectViolations();
  const current = toCounts(violations);

  // Violações novas: as que excedem a contagem tolerada no baseline.
  const budget = Object.assign({}, baseline);
  const fresh = [];
  violations.forEach(function(v) {
    if (budget[v.fingerprint] > 0) {
      budget[v.fingerprint] -= 1;
    } else {
      fresh.push(v);
    }
  });

  if (fresh.length > 0) {
    console.error('lint: ' + fresh.length + ' violação(ões) NOVA(S)\n');
    fresh.forEach(function(v) {
      console.error(
          '  ✗ ' + v.file + ':' + v.line + '  ' + v.message +
          '  (' + v.rule + ')');
    });
    console.error(
        '\n  Corrija-as. Não regrave o baseline para silenciá-las: ' +
        '`npm run gate:baseline` só deve rodar depois de REDUZIR a dívida.');
    return false;
  }

  // Violações do baseline que sumiram: melhora, não falha — mas avisa, senão
  // o baseline nunca encolhe e volta a tolerar o que já foi corrigido.
  let fixed = 0;
  Object.keys(baseline).forEach(function(fp) {
    fixed += Math.max(0, baseline[fp] - (current[fp] || 0));
  });

  if (fixed > 0) {
    console.log(
        'lint: 0 violações novas · ' + fixed + ' do baseline foram ' +
        'corrigidas — rode `npm run gate:baseline` para o gate travar ' +
        'essa melhora');
  } else {
    console.log(
        'lint: 0 violações novas (' + violations.length +
        ' pré-existentes toleradas)');
  }
  return true;
}

module.exports = {checkLint: checkLint, writeBaseline: writeBaseline};

if (require.main === module) {
  if (process.argv.indexOf('--write') !== -1) {
    writeBaseline();
  } else {
    process.exit(checkLint() ? 0 : 1);
  }
}
