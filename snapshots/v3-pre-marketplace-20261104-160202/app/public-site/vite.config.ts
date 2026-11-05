import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The public site contains no data: it reads /data/*.json from the published release at runtime.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
