// IPFS storage for encrypted certificate documents.
// Hosted mode pins to IPFS through Pinata. The local demo server stores files by their real
// IPFS content identifier (CID) so the app also works with no internet connection.

const LS_PINATA = "ucu-pinata-jwt";

export function getPinataJwt() {
  if (import.meta.env.VITE_PINATA_JWT) return import.meta.env.VITE_PINATA_JWT;
  try {
    return localStorage.getItem(LS_PINATA) || "";
  } catch {
    return "";
  }
}

export function setPinataJwt(jwt) {
  try {
    if (jwt) localStorage.setItem(LS_PINATA, jwt.trim());
    else localStorage.removeItem(LS_PINATA);
  } catch {
    /* ignore */
  }
}

export function pinataFromBuild() {
  return !!import.meta.env.VITE_PINATA_JWT;
}

let localAvailable;
async function hasLocalStore() {
  if (localAvailable !== undefined) return localAvailable;
  try {
    const r = await fetch("local-ipfs/health", { cache: "no-store" });
    localAvailable = r.ok;
  } catch {
    localAvailable = false;
  }
  return localAvailable;
}

export async function storageMode() {
  if (getPinataJwt()) return "pinata";
  if (await hasLocalStore()) return "local";
  return "none";
}

/** Uploads encrypted bytes and returns the IPFS CID. */
export async function uploadDocument(bytes, name) {
  const mode = await storageMode();
  if (mode === "pinata") {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/octet-stream" }), name);
    form.append("pinataMetadata", JSON.stringify({ name }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
    const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${getPinataJwt()}` },
      body: form,
    });
    if (!r.ok) throw new Error(`IPFS upload failed (${r.status}). Check the Pinata key in Settings.`);
    return (await r.json()).IpfsHash;
  }
  if (mode === "local") {
    const r = await fetch("local-ipfs/add", { method: "POST", body: bytes });
    if (!r.ok) throw new Error("Local IPFS store rejected the upload.");
    return (await r.json()).cid;
  }
  throw new Error("No document storage is set up. Add a Pinata API key under Settings on the Registrar page.");
}

const GATEWAYS = [
  import.meta.env.VITE_IPFS_GATEWAY,
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
].filter(Boolean);

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return new Uint8Array(await r.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

/** Fetches a document by CID, trying the local store and then public IPFS gateways. */
export async function fetchDocument(cid) {
  if (await hasLocalStore()) {
    try {
      return await fetchWithTimeout(`local-ipfs/${cid}`, 5000);
    } catch {
      /* not stored locally */
    }
  }
  for (const gw of GATEWAYS) {
    try {
      return await fetchWithTimeout(`${gw.replace(/\/?$/, "/")}${cid}`, 12000);
    } catch {
      /* try the next gateway */
    }
  }
  throw new Error("The certificate document could not be retrieved from IPFS right now.");
}
