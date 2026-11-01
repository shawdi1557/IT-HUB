import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// IT HUB — Staff Portal Vite Configuration
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: [
        (filePath: string) => {
          const normalized = filePath.replace(/\\/g, "/");
          return (
            normalized.includes("/dist/") ||
            normalized.includes("/node_modules/") ||
            normalized.includes("/.git/")
          );
        },
      ],
    },
  },
  preview: {
    port: 5174,
  },
});
