import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["robots.txt", "logo.png"],
      manifest: {
        name: "ARCADE Survival Gear",
        short_name: "ARCADE",
        description: "ARCADE event platform for missions, mini-games, and rewards.",
        theme_color: "#0b0f14",
        background_color: "#0b0f14",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/logo.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Card artwork is large (2-4 MB each) and loaded on demand. Keep it
        // out of the precache so the PWA install stays lightweight; the
        // browser HTTP cache handles repeat views fine.
        globIgnores: [
          "**/attack.png",
          "**/defend.png",
          "**/heal.png",
          "**/hintlow.png",
          "**/hintmid.png",
          "**/hinthigh.png",
        ],
        // Safety net: allow up to 5 MiB per file if we ever precache big
        // assets explicitly. Prevents a single oversized file from failing
        // the whole build.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/scheduler")) {
            return "vendor-react";
          }

          if (id.includes("node_modules/react-router") || id.includes("node_modules/@remix-run")) {
            return "vendor-router";
          }

          if (id.includes("node_modules/@supabase") || id.includes("node_modules/ws") || id.includes("node_modules/@types/ws")) {
            return "vendor-supabase";
          }

          if (id.includes("node_modules/@tanstack")) {
            return "vendor-query";
          }

          if (id.includes("node_modules/framer-motion") || id.includes("node_modules/motion")) {
            return "vendor-motion";
          }

          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }

          if (id.includes("node_modules/@radix-ui")) {
            return "vendor-radix";
          }

          return;
        },
      },
    },
  },
}));
