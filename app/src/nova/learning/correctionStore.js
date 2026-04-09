// SHIM — consolidated into novaStore. Use useNovaStore directly.
// Lazy re-export avoids HMR temporal dead zone when Vite evaluates this before novaStore.
export { useNovaStore as useCorrectionStore } from "@/stores/novaStore";
