import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.API_PORT || 3001);
const webPort = Number(process.env.VITE_PORT || 5173);

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: webPort,
    proxy: {
      '/api/toc/ws': {
        target: `ws://127.0.0.1:${apiPort}`,
        ws: true
      },
      '/api/toc': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true
      },
      '/avatars': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true
  }
});
