import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  // three.js alone is ~700 kB; split it out once the game grows
  build: { chunkSizeWarningLimit: 1200 },
});
