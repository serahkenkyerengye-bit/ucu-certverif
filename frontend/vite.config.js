import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";

const STORE = path.resolve(".local-ipfs");

/**
 * Offline stand-in for IPFS used when running the demo locally (npm run dev / preview).
 * Files are stored under their real IPFS CID (CIDv1, raw, sha-256), so the content
 * addressing is the same as on the public network.
 */
function localIpfs() {
  const handler = async (req, res, next) => {
    const url = (req.url || "").split("?")[0];
    if (!url.startsWith("/local-ipfs/")) return next();
    try {
      if (url === "/local-ipfs/health") return res.end("ok");
      if (url === "/local-ipfs/add" && req.method === "POST") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const bytes = new Uint8Array(Buffer.concat(chunks));
        if (bytes.length > 5 * 1024 * 1024) {
          res.statusCode = 413;
          return res.end("too large");
        }
        const cid = CID.create(1, raw.code, await sha256.digest(bytes)).toString();
        fs.mkdirSync(STORE, { recursive: true });
        fs.writeFileSync(path.join(STORE, cid), bytes);
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ cid }));
      }
      const cid = url.slice("/local-ipfs/".length);
      if (!/^[a-z0-9]+$/i.test(cid)) {
        res.statusCode = 400;
        return res.end("bad cid");
      }
      const file = path.join(STORE, cid);
      if (!fs.existsSync(file)) {
        res.statusCode = 404;
        return res.end("not found");
      }
      res.setHeader("Content-Type", "application/octet-stream");
      return res.end(fs.readFileSync(file));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  };
  return {
    name: "local-ipfs",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), localIpfs()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
