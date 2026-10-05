import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { editorStyles } from "./build/editorStyles.js";

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "editor-types",
      closeBundle() {
        for (const entry of ["index", "client", "styles"])
          copyFileSync(
            path.join(root, `src/editor/${entry}.d.ts`),
            path.join(root, `dist/editor/${entry}.d.ts`),
          );
      },
    },
  ],
  resolve: { alias: { "@": path.join(root, "src") } },
  css: { postcss: { plugins: [editorStyles()] } },
  build: {
    outDir: "dist/editor",
    cssCodeSplit: false,
    lib: {
      entry: {
        index: path.join(root, "src/editor/index.js"),
        client: path.join(root, "src/editor/client.js"),
      },
      formats: ["es"],
      fileName: (_format, entry) => `${entry}.js`,
      cssFileName: "styles",
    },
    rolldownOptions: {
      external: /^(react(?:\/.*)?|react-dom(?:\/.*)?|ckeditor5)$/,
      output: { banner: '"use client";' },
    },
  },
});
