import { defineConfig } from "vite";
export default defineConfig({
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", target: "es2020" },
  test: { include: ["tests/**/*.test.ts"] },
});
