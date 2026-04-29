import { iwsdkDev } from "@iwsdk/vite-plugin-dev";

import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { isIPv4 } from "node:net";
import os from "node:os";
import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";

/** First LAN IPv4, or override with DEV_HOST=192.168.x.x for mobile browser testing. */
function devHostForLan(): string {
  const fromEnv = process.env.DEV_HOST?.trim();
  if (fromEnv) return fromEnv;
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    const addrs = ifaces[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      if (isIPv4(addr.address) && !addr.internal) return addr.address;
    }
  }
  return "localhost";
}

const devPort = 8081;
const devHost = devHostForLan();

// Stamp each server start so the client can tell "restart" from "reload"
const serverBootId = Date.now().toString(36);
function bootIdPlugin() {
  return {
    name: 'boot-id',
    transformIndexHtml(html: string) {
      return html.replace('__SERVER_BOOT_ID__', serverBootId);
    },
  };
}

export default defineConfig({
  plugins: [
    mkcert(),
    iwsdkDev({
      emulator: {
        device: "metaQuest3",
      },
      ai: { tools: ["claude"], mode: "collaborate" },
      verbose: true,
    }),

    compileUIKit({ sourceDir: "ui", outputDir: "public/ui", verbose: true }),
    bootIdPlugin(),
  ],
  server: {
    host: "0.0.0.0",
    port: devPort,
    open: false,
    // Mobile: open https://<this-machine-LAN-IP>:8081 (same Wi‑Fi). Install mkcert root CA on the phone
    // (run `mkcert -CAROOT`, copy rootCA.pem) or the browser will warn / block camera & XR.
    hmr: {
      protocol: "wss",
      host: devHost,
      port: devPort,
      clientPort: devPort,
    },
  },
  build: {
    outDir: "dist",
    sourcemap: process.env.NODE_ENV !== "production",
    target: "esnext",
    rollupOptions: { input: "./index.html" },
  },
  esbuild: { target: "esnext" },
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
    esbuildOptions: { target: "esnext" },
  },
  publicDir: "public",
  base: "./",
});
