/** Configuracion de Jest para las pruebas unitarias del backend (se ejecutan en CI). */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Variables de entorno minimas para que los modulos carguen sin un .env real.
  setupFiles: ['<rootDir>/tests/helpers/setupEnv.js'],
  collectCoverageFrom: ['app.js', 'src/**/*.js'],
  coverageDirectory: 'coverage',
  clearMocks: true,
};
