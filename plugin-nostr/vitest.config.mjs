import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    globals: true,
    isolate: true,
    root: '.',
    reporters: 'default',
    watch: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['lib/**/*.js'],
      exclude: [
        'test/**',
        'node_modules/**',
        '**/*.test.js',
        '**/*.config.js',
      ],
      reportsDirectory: './coverage',
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
});
