import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    "__BUILD_TS__": JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      include: ["src/**/*.{js,jsx}"],
      exclude: [
        "src/test/**",
        "src/**/__tests__/**",
        "src/**/*.test.*",
      ],
      thresholds: {
        statements: 25,
        branches: 20,
        functions: 20,
        lines: 25,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Isolate heavy 3D libs into separate chunks — only loaded when Model tab opens
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          ifc: ["web-ifc"],
          // Split large constant data files out of the main bundle
          "data-modules": ["./src/constants/modules.js"],
          "data-seeds": ["./src/constants/seedAssemblies.js"],
          "data-carbon": ["./src/constants/embodiedCarbonDb.js"],
          "data-location": ["./src/constants/locationFactors.js"],
          "data-palettes": ["./src/constants/palettes.js"],
          // Isolate Supabase + Recharts + Framer Motion from main bundle
          supabase: ["@supabase/supabase-js"],
          charts: ["recharts"],
          "framer-motion": ["framer-motion"],
          // react-grid-layout — only used in NovaDashboardPage (check if installed)
          // "grid-layout": ["react-grid-layout"],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      // Proxy /api/* to Vercel (production by default, or local via API_TARGET env var)
      // Usage: API_TARGET=http://localhost:3001 npm run dev  (for local function testing)
      "/api": {
        target: process.env.API_TARGET || "https://app-nova-42373ca7.vercel.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
