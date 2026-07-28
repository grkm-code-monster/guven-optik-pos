import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  preview: {
    allowedHosts: [
      'pos.guvenoptik.net.tr',
      'pos.guvenoptik.com',
      '89.252.133.40',
      'localhost',
    ],
  },
})
