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
const webPort = Number(process.env.VITE_PORT || 5173);

export default defineConfig({
  root: 'client',
  cacheDir: '../node_modules/.vite-client',
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
      }
    }
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true
  }
});
