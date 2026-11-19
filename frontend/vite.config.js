import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev rejimida /api va /media so'rovlari Django serveriga (8000-port) yo'naltiriladi — CORS kerak emas.
// Build (serverga chiqarish) paytida fayllar Django orqali /static/ manzilidan beriladi.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
    },
  },
}));
