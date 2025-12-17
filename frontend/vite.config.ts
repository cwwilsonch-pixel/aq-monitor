import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/aq-monitor/',
  server: { 
    port: 5173
    // No proxy: API calls will use relative paths, matching production
  }
});