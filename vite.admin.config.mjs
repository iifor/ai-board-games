import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function px2vwPlugin({ viewportWidth = 1920, unitPrecision = 5 } = {}) {
  const pxRe = /(-?\d*\.?\d+)px\b/g;
  const toVw = (code) => code.replace(pxRe, (match, rawValue) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value === 0) return match;
    return `${Number(((value / viewportWidth) * 100).toFixed(unitPrecision))}vw`;
  });

  return {
    name: 'local-px2vw',
    enforce: 'post',
    transform(code, id) {
      if (!id.endsWith('.css')) return null;
      return { code: toVw(code), map: null };
    },
    generateBundle(_, bundle) {
      Object.values(bundle).forEach((asset) => {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css') || typeof asset.source !== 'string') return;
        asset.source = toVw(asset.source);
      });
    }
  };
}

const apiPort = Number(process.env.API_PORT || 3001);
const adminPort = Number(process.env.ADMIN_PORT || 5175);

export default defineConfig({
  root: 'admin',
  base: '/admin/',
  cacheDir: '../node_modules/.vite-admin',
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
    outDir: '../dist/admin',
    emptyOutDir: true
  }
});
