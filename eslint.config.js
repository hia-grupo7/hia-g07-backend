// Configuración de ESLint (formato flat) para el backend. Se ejecuta con `npm run lint` y en el pipeline de CI.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    // Archivos generados, dependencias y datos que no se analizan.
    ignores: [
      'node_modules/**',
      'coverage/**',
      'public/**',
      'backup/**',
      'monitoring/**',
      'swagger_output.json',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // Variables sin usar: aviso (no bloquea). Se ignoran los argumentos con prefijo "_" y los de Express (next).
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^(_|next$)', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Regla de estilo (adjuntar `cause` al relanzar errores): aviso por ahora, para no tocar los servicios existentes.
      'preserve-caught-error': 'warn',
    },
  },
  {
    // Las pruebas usan los globales de Jest.
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
];
