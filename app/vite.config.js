import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Isolate heavy 3D libs into separate chunks — only loaded when Model tab opens
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          ifc: ['web-ifc'],
          // Split large constant data files out of the main bundle
          'data-modules': ['./src/constants/modules.js'],
          'data-seeds': ['./src/constants/seedAssemblies.js'],
          'data-carbon': ['./src/constants/embodiedCarbonDb.js'],
          'data-location': ['./src/constants/locationFactors.js'],
          // Isolate Supabase + Recharts from main bundle
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      // Forward /api/* to production Vercel serverless functions
      '/api': {
        target: 'https://app-nova-42373ca7.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
