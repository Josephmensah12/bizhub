import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Build v1.0.1 - cache bust
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
