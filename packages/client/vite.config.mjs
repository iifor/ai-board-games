import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { px2vwPlugin } from '@consensus-mist/shared/vite-plugins/px2vw.mjs';

const apiPort = Number(process.env.API_PORT || 3001);
const webPort = Number(process.env.VITE_PORT || 5173);

export default defineConfig({
  plugins: [react(), px2vwPlugin()],
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
      },
      '/resources': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true
  }
});
