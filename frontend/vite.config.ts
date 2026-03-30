import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/scenarios': 'http://localhost:8002',
      '/sim': 'http://localhost:8002',
      '/results': 'http://localhost:8002',
      '/health': 'http://localhost:8002',
      '/ws': {
        target: 'ws://localhost:8002',
        ws: true,
      },
    },
  },
})
