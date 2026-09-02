/**
 * Regras estruturais do gate `arch` (ver GATES.md).
 *
 * Derivadas do que foi medido neste repositório, não de um catálogo genérico:
 * `lib/` é uma biblioteca de runtime sem dependências externas, e os commits
 * mostram isso como decisão deliberada (5a9b086 trocou `readable-stream` pelo
 * módulo `stream` nativo).
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Dependência circular: dois módulos se exigem mutuamente, então ' +
        'nenhum pode ser carregado ou testado isoladamente.',
      from: {},
      to: {circular: true},
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment:
        'Módulo órfão: ninguém o importa e ele não importa ninguém. ' +
        'Ou está morto, ou o import que deveria existir foi esquecido.',
      from: {orphan: true},
      to: {},
    },
    {
      name: 'lib-not-to-test-or-example',
      severity: 'error',
      comment:
        'lib/ é o artefato publicado; importar de test/ ou example/ ' +
        'levaria código não publicado para dentro do pacote.',
      from: {path: '^lib/'},
      to: {path: '^(test|example)/'},
    },
    {
      name: 'lib-no-runtime-deps',
      severity: 'error',
      comment:
        'lib/ só pode depender de módulos nativos do Node e de si mesma. ' +
        'Zero dependências de runtime é invariante deste projeto — qualquer ' +
        'pacote npm importado aqui vira dependência de todo consumidor.',
      from: {path: '^lib/'},
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
        ],
      },
    },
  ],
  options: {
    // `doNotFollow` mantém o módulo npm como nó do grafo sem entrar nele.
    // NÃO troque por `exclude`: excluir apaga a aresta lib -> pacote e a
    // regra lib-no-runtime-deps para de enxergar o que deveria barrar.
    doNotFollow: {path: 'node_modules'},
  },
};
