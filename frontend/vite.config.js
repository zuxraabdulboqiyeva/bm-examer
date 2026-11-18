import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev rejimida /api va /media so'rovlari Django serveriga (8000-port) yo'naltiriladi — CORS kerak emas
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
    },
  },
});
