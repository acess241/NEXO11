import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/NEXO11/' : '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
