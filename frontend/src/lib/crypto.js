// AES-256-GCM encryption in the browser. Personal details never leave the browser unencrypted.

function toB64Url(bytes) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Encrypts text. Returns the encrypted bytes (IV + ciphertext) and the key for the share link. */
export async function encryptText(text) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { bytes: out, key: toB64Url(raw) };
}

/** Decrypts bytes produced by encryptText. Throws if the key is wrong or the data was altered. */
export async function decryptText(bytes, keyB64) {
  const key = await crypto.subtle.importKey("raw", fromB64Url(keyB64), "AES-GCM", false, ["decrypt"]);
  const iv = bytes.slice(0, 12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes.slice(12));
  return new TextDecoder().decode(pt);
}
