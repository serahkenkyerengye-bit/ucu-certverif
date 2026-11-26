import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { explorerAddress, explorerTx } from "../lib/config";
import { shortHash } from "../lib/certificate";

export function QR({ text, size = 180, label = "QR code" }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: "#1f2a5c", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [text, size]);
  return src ? <img className="qr" src={src} width={size} height={size} alt={label} /> : <div className="qr" style={{ width: size, height: size }} />;
}

export async function downloadQr(text, filename) {
  const url = await QRCode.toDataURL(text, { margin: 2, width: 800, color: { dark: "#1f2a5c", light: "#ffffff" } });
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function CopyButton({ text, label = "Copy", className = "btn ghost small" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt("Copy this:", text);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export function Hash({ value, n = 8, copy = true }) {
  return (
    <span className="hash" title={value}>
      <code>{shortHash(value, n)}</code>
      {copy && <CopyButton text={value} label="Copy" />}
    </span>
  );
}

export function TxLink({ hash }) {
  const url = explorerTx(hash);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      <code>{shortHash(hash, 8)}</code> ↗
    </a>
  ) : (
    <code title={hash}>{shortHash(hash, 8)}</code>
  );
}

export function AddressLink({ address }) {
  const url = explorerAddress(address);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      <code>{shortHash(address, 6)}</code> ↗
    </a>
  ) : (
    <code title={address}>{shortHash(address, 6)}</code>
  );
}

const OUTCOME = {
  valid: { cls: "ok", icon: "✓", title: "Valid certificate", text: "This certificate was issued by Uganda Christian University and has not been revoked." },
  revoked: { cls: "bad", icon: "!", title: "Certificate revoked", text: "This certificate was issued but has since been withdrawn by the university." },
  notfound: { cls: "none", icon: "✕", title: "Not found", text: "No certificate with this reference was issued by Uganda Christian University. It may be forged or altered." },
};

export function Outcome({ kind, children }) {
  const o = OUTCOME[kind];
  return (
    <div className={`outcome ${o.cls}`} role="status">
      <div className="outcome-icon" aria-hidden>
        {o.icon}
      </div>
      <div>
        <h2>{o.title}</h2>
        <p>{o.text}</p>
        {children}
      </div>
    </div>
  );
}

export function Steps({ steps }) {
  return (
    <ol className="steps">
      {steps.map((s) => (
        <li key={s.label} className={s.state}>
          <span className="dot" aria-hidden>
            {s.state === "done" ? "✓" : s.state === "error" ? "✕" : ""}
          </span>
          {s.label}
          {s.note && <small> — {s.note}</small>}
        </li>
      ))}
    </ol>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
