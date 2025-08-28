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
  },
});
