import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        try {
          const manifest = readFileSync(resolve(__dirname, 'public/manifest.json'), 'utf-8');
          writeFileSync(resolve(__dirname, 'dist/manifest.json'), manifest);
          console.log('Successfully copied manifest.json to dist/');
        } catch (err) {
          console.error('Failed to copy manifest.json:', err);
        }
      }
    }
  ],
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
        background: resolve(__dirname, 'src/background/serviceWorker.ts'),
        processor: resolve(__dirname, 'src/worklet/surround-processor.ts'),
        dashboard: resolve(__dirname, 'src/dashboard/index.html')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          if (chunkInfo.name === 'processor') {
            return 'worklet/surround-processor.js';
          }
          if (chunkInfo.name === 'offscreen') {
            return 'offscreen/offscreen.js';
          }
          if (chunkInfo.name === 'dashboard') {
            return 'dashboard/dashboard.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three')) {
              return 'vendor-three';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            return 'vendor';
          }
        }
      }
    }
  }
});
