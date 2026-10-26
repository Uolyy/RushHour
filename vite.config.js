import { defineConfig } from 'vite';

// Vite обслуживает клиент, API и WebSocket гонки проксируются на Node-сервер.
export default defineConfig({
  server: {
    host: true, // доступ по локальной сети — нужно для сетевой гонки
open: true, // браузер открывает игру сам, как только сервер готов
    proxy: {
      '/api': 'http://localhost:3001',
      '/race-ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});