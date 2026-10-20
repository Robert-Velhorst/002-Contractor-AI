import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    maxWorkers: 1,
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    include: ['frontend-tests/**/*.test.{js,jsx}'],
    setupFiles: ['./frontend-tests/setup.js'],
  },
})
