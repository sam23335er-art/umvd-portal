import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// npm run dev    — режим разработки (http://localhost:5173)
// npm run build  — собирает ОДИН файл dist/index.html, который открывается двойным щелчком
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 4000, assetsInlineLimit: 100_000_000 },
});
