import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Backend Resolv (ASGI: HTTP e WebSocket no mesmo processo). Mesma origem => cookie de sessão e CSRF sem CORS.
  const target = env.VITE_API_PROXY || 'http://127.0.0.1:8000';
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: false },
        '/ws': { target, changeOrigin: false, ws: true },
      },
    },
    test: {
      environment: 'jsdom',
      env: { VITE_API_MODE: 'mock', VITE_API_URL: '' }, // testes sempre no modo mock, mesmo com .env.local
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
