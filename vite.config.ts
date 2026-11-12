import { defineConfig } from 'vite';

const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  base: './',
  // allowedHosts: the dev server is also reached through a preview proxy hostname
  server: { host: true, port, allowedHosts: true },
  preview: { host: true, port, allowedHosts: true },
  // the Rapier build embeds its WebAssembly, which makes the single bundle large
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
});
