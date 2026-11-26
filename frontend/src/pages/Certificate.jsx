import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { canonicalize, formatDate, isCertHash, parseReference, shareLink } from "../lib/certificate";
import { friendlyError } from "../lib/chain";
import { verifyByHash } from "../lib/verify";
import { CopyButton, QR, downloadQr } from "../components/ui";
import { downloadText } from "../lib/perf";

export default function Certificate() {
  const { certHash } = useParams();
  const [params] = useSearchParams();
  const key = params.get("k");
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [state, setState] = useState({ loading: false, result: null, error: "" });

  useEffect(() => {
    if (!certHash) return;
    if (!isCertHash(certHash) || !key) {
      setState({ loading: false, result: null, error: "This link is incomplete. Use the full certificate link you received from the Registrar." });
      return;
    }
    let live = true;
    setState({ loading: true, result: null, error: "" });
    verifyByHash(certHash, key)
      .then((result) => live && setState({ loading: false, result, error: "" }))
      .catch((e) => live && setState({ loading: false, result: null, error: friendlyError(e) }));
    return () => {
      live = false;
    };
  }, [certHash, key]);

  if (!certHash) {
    return (
      <div className="narrow">
        <h1>My certificate</h1>
        <p className="muted">Paste the certificate link you received from the Registrar&rsquo;s office. No login or wallet is needed.</p>
        <form
          className="searchbar"
          onSubmit={(e) => {
            e.preventDefault();
            const { certHash: h, key: k } = parseReference(input);
            if (h && k) navigate(`/certificate/${h}?k=${k}`);
            else setState({ loading: false, result: null, error: "That does not look like a full certificate link." });
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://…#/certificate/0x…?k=…" aria-label="Certificate link" />
          <button className="btn primary" disabled={!input.trim()}>
            Open
          </button>
        </form>
        {state.error && <div className="alert error">{state.error}</div>}
      </div>
    );
  }

  const { loading, result: r, error } = state;
  const link = r ? shareLink(r.certHash, key) : "";

  return (
    <div className="certpage">
      {loading && (
        <div className="panel loading">
          <span className="spinner" /> Opening your certificate…
        </div>
      )}
      {error && <div className="alert error narrow">{error}</div>}
      {r && !r.record && <div className="alert error narrow">No certificate with this reference is recorded on the blockchain.</div>}
      {r?.record && r.docCheck !== "match" && (
        <div className="alert warn narrow">The record exists but the document could not be opened. {r.docError}</div>
      )}

      {r?.record && r.doc && r.docCheck === "match" && (
        <>
          {r.outcome === "revoked" && (
            <div className="alert error narrow no-print">
              This certificate has been <b>revoked</b> by the university. Reason: {r.record.revocationReason}
            </div>
          )}
          <div className="toolbar no-print">
            <CopyButton text={link} label="Copy share link" className="btn primary" />
            <button className="btn" onClick={() => downloadQr(link, `UCU-certificate-QR-${r.certHash.slice(2, 10)}.png`)}>
              Download QR code
            </button>
            <button
              className="btn"
              onClick={() =>
                downloadText(`UCU-certificate-${r.doc.studentNumber || r.certHash.slice(2, 10)}.json`, canonicalize(r.doc), "application/json")
              }
            >
              Download certificate file
            </button>
            <button className="btn" onClick={() => window.print()}>
              Print / save as PDF
            </button>
            <Link className="btn ghost" to={`/verify/${r.certHash}?k=${key}`}>
              See verification
            </Link>
          </div>

          <article className={`certificate ${r.outcome === "revoked" ? "revoked" : ""}`}>
            <div className="cert-border">
              <p className="cert-inst">{r.doc.institution}</p>
              <p className="cert-motto">Faculty of Engineering, Design &amp; Technology</p>
              <p className="cert-this">This is to certify that</p>
              <h1 className="cert-name">{r.doc.studentName}</h1>
              <p className="cert-this">having satisfied all the requirements, was awarded the degree of</p>
              <h2 className="cert-prog">{r.doc.programme}</h2>
              <p className="cert-award">{r.doc.award}</p>
              <p className="cert-date">on {formatDate(r.doc.graduationDate)}</p>
              <div className="cert-foot">
                <div className="cert-meta">
                  <div>
                    <span>Student No.</span> {r.doc.studentNumber}
                  </div>
                  <div>
                    <span>Reg. No.</span> {r.doc.registrationNumber}
                  </div>
                  <div>
                    <span>Serial</span> {r.doc.serial}
                  </div>
                  <div className="cert-ref">
                    <span>Blockchain reference</span>
                    <code>{r.certHash}</code>
                  </div>
                </div>
                <div className="cert-qr">
                  <QR text={link} size={120} label="Scan to verify" />
                  <small>Scan to verify</small>
                </div>
              </div>
              {r.outcome === "revoked" && <div className="stamp">REVOKED</div>}
            </div>
          </article>
        </>
      )}
    </div>
  );
}
