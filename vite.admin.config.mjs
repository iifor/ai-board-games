import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.API_PORT || 3001);
const adminPort = Number(process.env.ADMIN_PORT || 5175);

export default defineConfig({
  root: 'admin',
  base: '/admin/',
  plugins: [react()],
  server: {
    port: adminPort,
    strictPort: true,
    proxy: {
      '/api/admin': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist/admin',
    emptyOutDir: true
  }
});
