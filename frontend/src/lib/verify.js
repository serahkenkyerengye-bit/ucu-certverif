import { lookupCertificate } from "./chain";
import { hashCertificate } from "./certificate";
import { decryptText } from "./crypto";
import { fetchDocument } from "./storage";
import { NETWORK } from "./config";
import { logPerf } from "./perf";

/**
 * Full verification (Figure 5.4):
 *  1. read-only contract call by certificate hash;
 *  2. if the share link carries the key, fetch the encrypted document from IPFS, decrypt it,
 *     recompute its hash and compare it with the on-chain record.
 */
export async function verifyByHash(certHash, key) {
  const t0 = performance.now();
  const record = await lookupCertificate(certHash);
  const chainMs = Math.round(performance.now() - t0);
  const result = {
    certHash,
    record,
    outcome: !record ? "notfound" : record.status === "Revoked" ? "revoked" : "valid",
    chainMs,
    doc: null,
    docCheck: null,
    docError: "",
  };
  if (record && key) {
    try {
      const bytes = await fetchDocument(record.ipfsCID);
      const doc = JSON.parse(await decryptText(bytes, key));
      result.doc = doc;
      result.docCheck = hashCertificate(doc).toLowerCase() === certHash.toLowerCase() ? "match" : "mismatch";
    } catch (e) {
      result.docCheck = "unavailable";
      result.docError =
        e?.name === "OperationError" ? "The key in this link does not open the document." : e.message || String(e);
    }
  }
  result.totalMs = Math.round(performance.now() - t0);
  logPerf({ type: key ? "verify+document" : "verify", ms: result.totalMs, network: NETWORK.short, certHash });
  return result;
}

/** Verifies a downloaded certificate file: recompute its hash and look that hash up on-chain. */
export async function verifyFile(file) {
  const text = await file.text();
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error("This file is not a UCU digital certificate file (.json).");
  }
  if (doc?.schema !== "ucu-certificate/1") throw new Error("This file is not a UCU digital certificate file.");
  const certHash = hashCertificate(doc).toLowerCase();
  const t0 = performance.now();
  const record = await lookupCertificate(certHash);
  const ms = Math.round(performance.now() - t0);
  logPerf({ type: "verify-file", ms, network: NETWORK.short, certHash });
  return {
    certHash,
    record,
    outcome: !record ? "notfound" : record.status === "Revoked" ? "revoked" : "valid",
    chainMs: ms,
    totalMs: ms,
    doc,
    docCheck: record ? "match" : null,
    fromFile: true,
  };
}
