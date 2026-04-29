import { iwsdkDev } from "@iwsdk/vite-plugin-dev";

import basicSsl from "@vitejs/plugin-basic-ssl";
import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { execSync } from "node:child_process";
import { isIPv4 } from "node:net";
import os from "node:os";
import { defineConfig } from "vite";

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

/** Mac's mDNS .local name (e.g. "Suvis-MacBook-Air.local"), if discoverable. */
function localMdnsName(): string | null {
  try {
    const name = execSync("scutil --get LocalHostName", { encoding: "utf8" }).trim();
    return name ? `${name}.local` : null;
  } catch {
    return null;
  }
}

const devPort = 8081;
const devHost = devHostForLan();
const mdnsHost = localMdnsName();
const certDomains = [devHost, "localhost", ...(mdnsHost ? [mdnsHost] : [])];

export default defineConfig({
  plugins: [
    basicSsl({ domains: certDomains }),
    iwsdkDev({
      emulator: {
        device: "metaQuest3",
      },
      ai: { tools: ["claude"], mode: "collaborate" },
      verbose: true,
    }),

    compileUIKit({ sourceDir: "ui", outputDir: "public/ui", verbose: true }),
  ],
  server: {
    host: "0.0.0.0",
    port: devPort,
    open: false,
    // Mobile: open https://<this-machine-LAN-IP>:8081 on the same Wi‑Fi. The cert is self-signed,
    // so Safari shows a "not private" warning — tap Show Details → Visit Website to proceed.
    // Camera/WebXR still work after accepting the warning.
    hmr: {
      protocol: "wss",
      host: devHost,
      port: devPort,
      clientPort: devPort,
    },
    allowedHosts: true,
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
