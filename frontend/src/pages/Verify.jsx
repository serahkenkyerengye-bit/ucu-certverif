import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { formatDate, isCertHash, parseReference } from "../lib/certificate";
import { friendlyError } from "../lib/chain";
import { verifyByHash, verifyFile } from "../lib/verify";
import { AddressLink, Hash, Outcome } from "../components/ui";
import { NETWORK } from "../lib/config";

export default function Verify() {
  const { certHash } = useParams();
  const [params] = useSearchParams();
  const key = params.get("k");
  const navigate = useNavigate();
  const [input, setInput] = useState(params.get("q") || "");
  const [state, setState] = useState({ loading: false, result: null, error: "" });
  const fileRef = useRef();

  useEffect(() => {
    if (!certHash) {
      setState({ loading: false, result: null, error: "" });
      return;
    }
    if (!isCertHash(certHash)) {
      setState({ loading: false, result: null, error: "That is not a valid certificate reference." });
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

  function submit(e) {
    e.preventDefault();
    const { certHash: h, key: k } = parseReference(input);
    if (!h) {
      setState({ loading: false, result: null, error: "Enter a reference that starts with 0x followed by 64 characters, or paste the full share link." });
      return;
    }
    navigate(`/verify/${h}${k ? `?k=${k}` : ""}`);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setState({ loading: true, result: null, error: "" });
    try {
      const result = await verifyFile(file);
      setState({ loading: false, result, error: "" });
    } catch (err) {
      setState({ loading: false, result: null, error: friendlyError(err) });
    }
  }

  const r = state.result;
  return (
    <div className="narrow">
      <h1>Verify a certificate</h1>
      <p className="muted">
        Enter the reference printed on the certificate, paste the share link, or scan the QR code with your phone
        camera. Nothing to install; no account needed.
      </p>

      <form className="searchbar" onSubmit={submit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x… reference or share link" aria-label="Certificate reference" />
        <button className="btn primary" disabled={!input.trim()}>
          Verify
        </button>
      </form>
      <div className="filecheck">
        or{" "}
        <button type="button" className="linkbtn" onClick={() => fileRef.current?.click()}>
          check a downloaded certificate file
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
      </div>

      {state.loading && (
        <div className="panel loading">
          <span className="spinner" /> Checking the blockchain record on the {NETWORK.name}…
        </div>
      )}
      {state.error && <div className="alert error">{state.error}</div>}

      {r && (
        <div className="result">
          <Outcome kind={r.outcome}>
            <p className="timing">
              Answered in <b>{r.totalMs} ms</b>
              {r.totalMs !== r.chainMs && <> (blockchain lookup {r.chainMs} ms)</>}
            </p>
          </Outcome>

          {r.record && (
            <div className="panel">
              <h3>Blockchain record</h3>
              <dl className="details">
                <dt>Status</dt>
                <dd>
                  <span className={`pill ${r.outcome}`}>{r.record.status}</span>
                </dd>
                {r.record.status === "Revoked" && (
                  <>
                    <dt>Reason for revocation</dt>
                    <dd>{r.record.revocationReason}</dd>
                  </>
                )}
                <dt>Programme</dt>
                <dd>{r.record.programme}</dd>
                <dt>Recorded on</dt>
                <dd>{formatDate(r.record.issueDate)}</dd>
                <dt>Issued by (Registrar wallet)</dt>
                <dd>
                  <AddressLink address={r.record.issuer} />
                </dd>
                <dt>Certificate reference</dt>
                <dd>
                  <Hash value={r.certHash} />
                </dd>
                <dt>IPFS document (CID)</dt>
                <dd>
                  <Hash value={r.record.ipfsCID} n={10} />
                </dd>
              </dl>
            </div>
          )}

          {r.doc && (
            <div className="panel">
              <h3>{r.fromFile ? "Certificate file" : "Certificate document"}</h3>
              {r.docCheck === "match" && (
                <div className="alert success">
                  ✓ {r.fromFile ? "This file" : "The document stored on IPFS"} matches the hash recorded on the
                  blockchain. It has not been altered.
                </div>
              )}
              {r.docCheck === "mismatch" && (
                <div className="alert error">✕ The document does not match the blockchain record. It has been altered.</div>
              )}
              <dl className="details">
                <dt>Name</dt>
                <dd>
                  <b>{r.doc.studentName}</b>
                </dd>
                <dt>Student number</dt>
                <dd>{r.doc.studentNumber}</dd>
                <dt>Registration number</dt>
                <dd>{r.doc.registrationNumber}</dd>
                <dt>Award</dt>
                <dd>
                  {r.doc.programme}
                  <br />
                  <small>{r.doc.award}</small>
                </dd>
                <dt>Graduation date</dt>
                <dd>{formatDate(r.doc.graduationDate)}</dd>
                <dt>Serial number</dt>
                <dd>{r.doc.serial}</dd>
              </dl>
            </div>
          )}

          {r.fromFile && r.outcome === "notfound" && (
            <div className="alert error">
              The hash of this file (<code>{r.certHash.slice(0, 14)}…</code>) is not on the blockchain. If any detail in
              the file was changed, even one letter, its hash changes and it no longer matches.
            </div>
          )}
          {r.docCheck === "unavailable" && (
            <div className="alert warn">The blockchain record was found, but the document could not be checked: {r.docError}</div>
          )}
          {r.record && !key && !r.fromFile && (
            <p className="muted small">
              Only the public record is shown. To also see and check the holder&rsquo;s details, open the full share link
              that the graduate gave you.
            </p>
          )}
          {r.record && key && (
            <p className="small">
              <Link to={`/certificate/${r.certHash}?k=${key}`}>View printable certificate →</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
