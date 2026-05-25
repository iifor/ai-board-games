import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { px2vwPlugin } from '@ai-presenter/shared/vite-plugins/px2vw.mjs';

const apiPort = Number(process.env.API_PORT || 3001);
const adminPort = Number(process.env.ADMIN_PORT || 5175);

export default defineConfig({
  base: '/admin/',
  plugins: [react(), px2vwPlugin()],
  server: {
    port: adminPort,
    strictPort: true,
    proxy: {
      '/api/admin': {
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
    outDir: '../../dist/admin',
    emptyOutDir: true
  }
});
