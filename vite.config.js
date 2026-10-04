import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Port backend: PORT diprioritaskan agar sama dengan server/index.js.
const SERVER_PORT = process.env.PORT || process.env.SERVER_PORT || 5174;
// Dev server Vite bisa dibuka dari PC lain lewat LAN (VITE_HOST=0.0.0.0).
const VITE_HOST = process.env.VITE_HOST || '127.0.0.1';
const VITE_PORT = Number(process.env.VITE_PORT || 5173);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: VITE_PORT,
    strictPort: true,
    host: VITE_HOST,
    // state.json & laporan uji sering berubah — jangan dipantau agar
    // dev server tidak melakukan full-reload tanpa perlu.
    watch: {
      ignored: ['**/server/data/**', '**/scripts/report/**', '**/dist/**']
    },
    proxy: {
      '/api': { target: `http://127.0.0.1:${SERVER_PORT}`, changeOrigin: true },
      '/socket.io': { target: `http://127.0.0.1:${SERVER_PORT}`, ws: true }
    }
  },
  preview: { port: VITE_PORT, strictPort: true, host: VITE_HOST },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
