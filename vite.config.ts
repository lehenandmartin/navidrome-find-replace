/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// A relative base lets the same build work at the domain root or under /<repo>/ on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
})
