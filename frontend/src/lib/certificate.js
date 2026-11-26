import { keccak256, toUtf8Bytes, hexlify, randomBytes } from "ethers";
import { INSTITUTION } from "./config";

export const CLASSES = [
  "First Class Honours",
  "Second Class Honours (Upper Division)",
  "Second Class Honours (Lower Division)",
  "Pass",
  "Distinction",
  "Credit",
];

/** Serialises with sorted keys so the same certificate always gives the same bytes. */
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Builds the certificate document. The random salt stops anyone guessing a hash from
 * known student details, and is kept inside the (encrypted) document so the hash can
 * be recomputed during verification.
 */
export function buildCertificate(form) {
  return {
    schema: "ucu-certificate/1",
    institution: INSTITUTION,
    studentName: form.studentName.trim(),
    studentNumber: form.studentNumber.trim(),
    registrationNumber: form.registrationNumber.trim(),
    programme: form.programme.trim(),
    award: form.award.trim(),
    graduationDate: form.graduationDate,
    serial: form.serial.trim(),
    salt: hexlify(randomBytes(16)),
  };
}

export function hashCertificate(doc) {
  return keccak256(toUtf8Bytes(canonicalize(doc)));
}

export function isCertHash(s) {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

/** Pulls a certificate hash and key out of a pasted reference, share link or QR text. */
export function parseReference(input) {
  const text = (input || "").trim();
  const hashMatch = text.match(/0x[0-9a-fA-F]{64}/);
  const keyMatch = text.match(/[?&]k=([A-Za-z0-9_-]+)/);
  return { certHash: hashMatch ? hashMatch[0].toLowerCase() : null, key: keyMatch ? keyMatch[1] : null };
}

function baseUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Link for verifiers. The key sits after '#', which browsers never send to a server. */
export function shareLink(certHash, key) {
  return `${baseUrl()}#/verify/${certHash}${key ? `?k=${key}` : ""}`;
}

export function certificateLink(certHash, key) {
  return `${baseUrl()}#/certificate/${certHash}${key ? `?k=${key}` : ""}`;
}

export function shortHash(h, n = 6) {
  return h ? `${h.slice(0, 2 + n)}…${h.slice(-n)}` : "";
}

export function formatDate(value) {
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
