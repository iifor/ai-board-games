import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.API_PORT || process.env.PORT || 3001);
const webPort = Number(process.env.VITE_PORT || 5173);

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: webPort,
    proxy: {
      '/api': `http://localhost:${apiPort}`,
      '/ws': {
        target: `ws://localhost:${apiPort}`,
        ws: true
      }
    }
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true
  }
});
