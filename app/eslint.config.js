import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default [
  // Ignore build artifacts and dependencies (must be first for flat config)
  {
    ignores: ["dist/**", "node_modules/**", ".vercel/**", "*.config.js", "coverage/**", "src/_backup/**"],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // React recommended (flat config)
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],

  {
    settings: {
      react: { version: "detect" },
    },
  },

  // Prettier — disables formatting rules that conflict
  prettier,

  // Project-specific overrides — frontend source files
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        indexedDB: "readonly",
        IDBKeyRange: "readonly",
        crypto: "readonly",
        performance: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        btoa: "readonly",
        atob: "readonly",
        structuredClone: "readonly",
        queueMicrotask: "readonly",
        Image: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLImageElement: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        DOMParser: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        Worker: "readonly",
        self: "readonly",
        caches: "readonly",
        Audio: "readonly",
        KeyboardEvent: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        Map: "readonly",
        Set: "readonly",
        Promise: "readonly",
        Proxy: "readonly",
        WeakMap: "readonly",
        WeakSet: "readonly",
        Symbol: "readonly",
        Uint8Array: "readonly",
        ArrayBuffer: "readonly",
        DataView: "readonly",
        XMLHttpRequest: "readonly",
        WebSocket: "readonly",
        MediaQueryList: "readonly",
        getComputedStyle: "readonly",
        matchMedia: "readonly",
        OffscreenCanvas: "readonly",
      },
    },
    rules: {
      // Downgrade to warnings — too many existing violations to error on day one
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "no-empty": "warn", // Empty catch blocks — will clean up gradually
      "no-useless-escape": "warn", // Unnecessary escapes in strings — cosmetic
      "no-dupe-keys": "warn", // Duplicate object keys — real bugs, but need investigation
      "no-constant-binary-expression": "warn",

      // React-specific tweaks
      "react/prop-types": "off", // No PropTypes in a JS-only codebase (future: TypeScript)
      "react/display-name": "off", // Not worth enforcing on 150+ components
      "react/no-unescaped-entities": "off", // Apostrophes in JSX text are fine

      // Hooks — only the two classic rules (v7 adds React Compiler rules we don't need yet)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // React Three Fiber files — suppress unknown-property for 3D JSX props
  {
    files: [
      "src/components/nova/NovaScene.jsx",
      "src/components/nova/NovacoreSphere.jsx",
      "src/components/nova/InnerParticles.jsx",
      "src/components/nova/PBRShell.jsx",
      "src/components/nova/EnergyWisps.jsx",
      "src/components/nova/Chamber.jsx",
      "src/components/insights/ArchitectSketch.jsx",
      "src/components/insights/BlueprintTab.jsx",
      "src/components/insights/SceneViewer.jsx",
      "src/components/ambient/**/*.jsx",
      "src/components/building-viewer/**/*.jsx",
      "src/components/spatial/**/*.jsx",
      "src/components/proposal/CostSnapshot3D.jsx",
      "src/pages/spatial/**/*.jsx",
    ],
    rules: {
      "react/no-unknown-property": "off",
    },
  },

  // Serverless API functions (Node runtime)
  {
    files: ["api/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        crypto: "readonly",
        structuredClone: "readonly",
        btoa: "readonly",
        atob: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Vitest files
  {
    files: ["src/**/*.{test,spec}.{js,jsx}", "src/test/**/*.{js,jsx}"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
      },
    },
  },
];
