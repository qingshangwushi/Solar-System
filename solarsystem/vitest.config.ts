import { defineConfig } from 'vitest/config'

/**
 * Astronomy verification runs in Node: the unit tests validate the closed-form
 * propagators against the high-accuracy ephemeris engine and against published
 * reference values, with no DOM or WebGL involved.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    testTimeout: 30_000,
  },
})