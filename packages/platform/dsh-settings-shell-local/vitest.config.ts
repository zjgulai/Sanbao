import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // 两支都要在：真实产物 seam（test/）与源码级守卫（src/）。
    include: ['test/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
  },
})
