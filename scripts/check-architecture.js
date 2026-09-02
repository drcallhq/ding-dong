/**
 * Regras estruturais que nenhuma ferramenta genérica expressa.
 *
 * O dependency-cruiser vê o grafo de imports; estas duas regras vivem fora
 * dele — uma no manifesto, outra no texto do código. Ambas estão limpas hoje
 * (medido em 2026-09-02); o gate existe para que continuem assim.
 *
 * Saída: 0 = conforme, 1 = violação.
 */

const fs = require('fs');
const path = require('path');

const violations = [];

/*
 * Regra 1 — zero dependências de runtime.
 *
 * Decisão deliberada do projeto, não acidente: o commit 5a9b086 removeu
 * `readable-stream` para usar o módulo `stream` nativo. Uma dependência
 * declarada aqui é herdada por todo consumidor da lib.
 */
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const runtimeDeps = Object.keys(pkg.dependencies || {});
if (runtimeDeps.length > 0) {
  violations.push(
      'package.json declara ' + runtimeDeps.length +
      ' dependência(s) de runtime: ' + runtimeDeps.join(', ') + '.\n' +
      '    Correção: mova para devDependencies, ou use o módulo nativo ' +
      'do Node equivalente.');
}

/*
 * Regra 2 — lib/ não lê process.env.
 *
 * Uma biblioteca é configurada por quem a chama (aqui, pelo objeto `options`
 * do construtor de AgiServer), nunca pelo ambiente do processo hospedeiro:
 * ler env acopla o consumidor a nomes de variáveis que ele não escolheu.
 */
const libFiles = fs.readdirSync('lib')
    .filter(function(f) {
      return f.endsWith('.js');
    })
    .map(function(f) {
      return path.join('lib', f);
    });

libFiles.forEach(function(file) {
  fs.readFileSync(file, 'utf8').split('\n').forEach(function(line, i) {
    if (/process\.env/.test(line)) {
      violations.push(
          file + ':' + (i + 1) + ' lê process.env dentro da lib.\n' +
          '    Correção: receba o valor via o objeto `options` do ' +
          'construtor e deixe a aplicação ler o ambiente.');
    }
  });
});

if (violations.length > 0) {
  console.error('check-architecture: ' + violations.length + ' violação(ões)');
  violations.forEach(function(v) {
    console.error('  ✗ ' + v + '\n');
  });
  process.exit(1);
}

console.log(
    'check-architecture: conforme (0 deps de runtime, ' + libFiles.length +
    ' arquivos em lib/ sem process.env)');
