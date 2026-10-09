module.exports = [
  {
    files: ['src/**/*.js', 'tests/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 'latest',
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        matchMedia: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        process: 'readonly', global: 'readonly'
      }
    },
    rules: {
      complexity: ['error', 10],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-class-members': 'error',
      'no-duplicate-case': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error'
    }
  }
];
