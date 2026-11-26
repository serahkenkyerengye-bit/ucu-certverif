import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isAddress } from "ethers";
import { CHAIN_ID, NETWORK, getRegistry } from "../lib/config";
import {
  connectLocalDemoAccount,
  connectMetaMask,
  deployRegistry,
  friendlyError,
  getRoles,
  getWriteContract,
  hasMetaMask,
  loadHistory,
} from "../lib/chain";
import { CLASSES, buildCertificate, canonicalize, certificateLink, formatDate, hashCertificate, shareLink, shortHash } from "../lib/certificate";
import { encryptText } from "../lib/crypto";
import { getPinataJwt, pinataFromBuild, setPinataJwt, storageMode, uploadDocument } from "../lib/storage";
import { clearPerfLog, downloadText, getPerfLog, logPerf, perfCsv } from "../lib/perf";
import { AddressLink, CopyButton, Field, Hash, QR, Steps, TxLink, downloadQr } from "../components/ui";

const PROGRAMMES = [
  "Bachelor of Science in Information Technology",
  "Bachelor of Science in Computer Science",
  "Bachelor of Science in Software Engineering",
  "Bachelor of Business Administration",
  "Bachelor of Laws",
  "Bachelor of Science in Civil Engineering",
  "Bachelor of Arts in Mass Communication",
  "Bachelor of Science in Nursing",
];

const LS_ISSUED = `ucu-issued-${CHAIN_ID}`;
function loadIssuedLinks() {
  try {
    return JSON.parse(localStorage.getItem(LS_ISSUED) || "{}");
  } catch {
    return {};
  }
}
function rememberIssued(certHash, entry) {
  try {
    const all = loadIssuedLinks();
    all[certHash.toLowerCase()] = entry;
    localStorage.setItem(LS_ISSUED, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function fmtMs(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function newSerial() {
  return `UCU/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
}

const EMPTY_FORM = {
  studentName: "",
  studentNumber: "",
  registrationNumber: "",
  programme: PROGRAMMES[0],
  award: CLASSES[1],
  graduationDate: new Date().toISOString().slice(0, 10),
  serial: "",
};

export default function Admin() {
  const [registry, setRegistry] = useState(getRegistry());
  const [signer, setSigner] = useState(null);
  const [roles, setRoles] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("issue");

  const connect = useCallback(
    async (useDemo) => {
      setConnecting(true);
      setError("");
      try {
        const s = useDemo ? await connectLocalDemoAccount() : await connectMetaMask();
        setSigner(s);
        if (getRegistry()) setRoles(await getRoles(s));
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setConnecting(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!window.ethereum?.on) return;
    const reset = () => {
      setSigner(null);
      setRoles(null);
    };
    window.ethereum.on("accountsChanged", reset);
    window.ethereum.on("chainChanged", reset);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", reset);
      window.ethereum.removeListener?.("chainChanged", reset);
    };
  }, []);

  return (
    <div className="wide">
      <div className="pagehead">
        <div>
          <h1>Registrar portal</h1>
          <p className="muted">Issue and revoke Uganda Christian University certificates on the {NETWORK.name}.</p>
        </div>
        {roles && (
          <div className="whoami">
            <AddressLink address={roles.address} />
            <span className={`pill ${roles.isIssuer ? "valid" : "notfound"}`}>{roles.isIssuer ? "Authorised administrator" : "Not authorised"}</span>
          </div>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}

      {!signer && (
        <ConnectPanel connecting={connecting} onConnect={connect} />
      )}

      {signer && !registry && (
        <DeployPanel
          signer={signer}
          onDeployed={async (reg) => {
            setRegistry(reg);
            setRoles(await getRoles(signer));
          }}
        />
      )}

      {signer && registry && roles && !roles.isIssuer && (
        <div className="panel">
          <h3>This wallet cannot issue certificates</h3>
          <p>
            The smart contract only accepts issuance and revocation from wallets that hold the administrator role. The
            connected wallet <code>{shortHash(roles.address)}</code> does not. Switch to the Registrar wallet in
            MetaMask.
          </p>
        </div>
      )}

      {signer && registry && roles?.isIssuer && (
        <>
          <div className="tabs" role="tablist">
            {[
              ["issue", "Issue certificate"],
              ["list", "Certificates"],
              ["log", "Audit trail"],
              ["settings", "Settings"],
            ].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "issue" && <IssuePanel signer={signer} />}
          {tab === "list" && <ListPanel signer={signer} />}
          {tab === "log" && <AuditPanel />}
          {tab === "settings" && <SettingsPanel signer={signer} roles={roles} onRolesChanged={async () => setRoles(await getRoles(signer))} />}
        </>
      )}
    </div>
  );
}

function ConnectPanel({ connecting, onConnect }) {
  return (
    <div className="panel connect">
      <h3>Sign in with the Registrar wallet</h3>
      <p>
        Only wallets holding the administrator role in the smart contract can issue or revoke certificates. The
        contract enforces this, not the website.
      </p>
      <div className="row">
        <button className="btn primary" disabled={connecting} onClick={() => onConnect(false)}>
          🦊 {connecting ? "Approve in the MetaMask window…" : "Connect MetaMask"}
        </button>
        {CHAIN_ID === 31337 && (
          <button className="btn" disabled={connecting} onClick={() => onConnect(true)}>
            Use local demo account
          </button>
        )}
      </div>
      {!hasMetaMask() && (
        <p className="small muted">
          MetaMask is not installed in this browser. Install it from{" "}
          <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            metamask.io
          </a>
          , then import the Registrar demo wallet.
          {CHAIN_ID === 31337 && " On the local network you can use the demo account instead."}
        </p>
      )}
    </div>
  );
}

function DeployPanel({ signer, onDeployed }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  return (
    <div className="panel">
      <h3>Set up the certificate registry</h3>
      <p>
        No smart contract is configured for the {NETWORK.name} yet. Deploy one now; the connected wallet becomes the
        Registrar administrator.
      </p>
      <button
        className="btn primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            const r = await deployRegistry(signer);
            setDone(r);
            onDeployed(r);
          } catch (e) {
            setErr(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Deploying… confirm in your wallet" : "Deploy registry contract"}
      </button>
      {err && <div className="alert error">{err}</div>}
      {done && (
        <div className="alert success">
          Deployed at <code>{done.address}</code> (block {done.block}). Add this address to the app&rsquo;s
          deployments.json so every computer uses it.
        </div>
      )}
    </div>
  );
}

const STEP_LABELS = [
  "Build certificate document",
  "Encrypt in the browser (AES-256)",
  "Store encrypted document on IPFS",
  "Approve the transaction in the wallet",
  "Recorded on the blockchain",
];

function IssuePanel({ signer }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, serial: newSerial() });
  const [steps, setSteps] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [issued, setIssued] = useState(null);
  const [mode, setMode] = useState("…");

  useEffect(() => {
    storageMode().then(setMode);
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function mark(i, state, note) {
    setSteps((s) => s.map((st, j) => (j === i ? { ...st, state, note } : st)));
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setIssued(null);
    setBusy(true);
    setSteps(STEP_LABELS.map((label) => ({ label, state: "todo" })));
    let i = 0;
    try {
      mark(0, "active");
      const doc = buildCertificate(form);
      const certHash = hashCertificate(doc);
      mark(0, "done", shortHash(certHash));

      i = 1;
      mark(1, "active");
      const { bytes, key } = await encryptText(canonicalize(doc));
      mark(1, "done");

      i = 2;
      mark(2, "active");
      const cid = await uploadDocument(bytes, `ucu-cert-${certHash.slice(2, 12)}.bin`);
      mark(2, "done", shortHash(cid, 8));

      i = 3;
      mark(3, "active");
      const contract = getWriteContract(signer);
      const issueDate = Math.floor(Date.now() / 1000);
      const tx = await contract.issueCertificate(certHash, doc.programme, issueDate, cid);
      const tSent = performance.now();
      mark(3, "done");

      i = 4;
      mark(4, "active", "waiting for confirmation…");
      const receipt = await tx.wait();
      const ms = Math.round(performance.now() - tSent);
      mark(4, "done", `block ${receipt.blockNumber}, ${fmtMs(ms)}`);

      const gasUsed = receipt.gasUsed.toString();
      logPerf({ type: "issue", ms, gasUsed, network: NETWORK.short, certHash, txHash: receipt.hash });
      const entry = {
        certHash,
        key,
        name: doc.studentName,
        studentNumber: doc.studentNumber,
        programme: doc.programme,
        txHash: receipt.hash,
        gasUsed,
        ms,
        cid,
        at: new Date().toISOString(),
      };
      rememberIssued(certHash, entry);
      setIssued(entry);
      setForm({ ...EMPTY_FORM, serial: newSerial() });
    } catch (e2) {
      mark(i, "error", friendlyError(e2));
      setErr(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  function fillSample() {
    const n = Math.floor(Math.random() * 90000 + 10000);
    const names = ["Namubiru Grace", "Okello Daniel", "Atuhaire Patience", "Mugisha Brian", "Nakato Esther", "Ssemakula Ivan"];
    setForm({
      ...EMPTY_FORM,
      studentName: names[Math.floor(Math.random() * names.length)],
      studentNumber: `B${n}`,
      registrationNumber: `S22B13/${String(n).slice(-3)}`,
      serial: newSerial(),
    });
  }

  return (
    <div className="grid2">
      <form className="panel" onSubmit={submit}>
        <div className="row spread">
          <h3>New certificate</h3>
          <button type="button" className="btn ghost small" onClick={fillSample} disabled={busy}>
            Fill sample data
          </button>
        </div>
        <Field label="Graduate's full name">
          <input required value={form.studentName} onChange={set("studentName")} placeholder="e.g. Namubiru Grace" />
        </Field>
        <div className="row2">
          <Field label="Student number">
            <input required value={form.studentNumber} onChange={set("studentNumber")} placeholder="B12345" />
          </Field>
          <Field label="Registration number">
            <input required value={form.registrationNumber} onChange={set("registrationNumber")} placeholder="S22B13/001" />
          </Field>
        </div>
        <Field label="Programme">
          <input required list="programmes" value={form.programme} onChange={set("programme")} />
          <datalist id="programmes">
            {PROGRAMMES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <div className="row2">
          <Field label="Class of award">
            <select value={form.award} onChange={set("award")}>
              {CLASSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Graduation date">
            <input required type="date" value={form.graduationDate} onChange={set("graduationDate")} />
          </Field>
        </div>
        <Field label="Certificate serial number">
          <input required value={form.serial} onChange={set("serial")} />
        </Field>
        <p className="small muted">
          Only the hash, programme, date and IPFS address go on the blockchain. Personal details stay inside the
          encrypted document. Storage: <b>{mode === "pinata" ? "IPFS (Pinata)" : mode === "local" ? "local IPFS store (offline demo)" : "not set up, see Settings"}</b>
        </p>
        <button className="btn primary block" disabled={busy}>
          {busy ? "Issuing…" : "Issue certificate"}
        </button>
      </form>

      <div>
        {steps && (
          <div className="panel">
            <h3>Progress</h3>
            <Steps steps={steps} />
          </div>
        )}
        {err && !steps && <div className="alert error">{err}</div>}
        {issued && <IssuedCard entry={issued} />}
        {!steps && !issued && (
          <div className="panel placeholder">
            <p>Fill in the form and press <b>Issue certificate</b>. MetaMask will ask you to approve the transaction.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function IssuedCard({ entry }) {
  const link = shareLink(entry.certHash, entry.key);
  const certUrl = certificateLink(entry.certHash, entry.key);
  return (
    <div className="panel issued">
      <h3>✓ Certificate issued</h3>
      <div className="issued-body">
        <QR text={link} size={150} />
        <dl className="details compact">
          <dt>Graduate</dt>
          <dd>{entry.name}</dd>
          <dt>Reference</dt>
          <dd>
            <Hash value={entry.certHash} n={6} />
          </dd>
          <dt>Transaction</dt>
          <dd>
            <TxLink hash={entry.txHash} />
          </dd>
          <dt>Confirmed in</dt>
          <dd>
            {fmtMs(entry.ms)} · gas {Number(entry.gasUsed).toLocaleString()}
          </dd>
        </dl>
      </div>
      <p className="small muted">
        Give the graduate this link. It contains the key that opens their certificate, so it is not stored anywhere
        else. Keep a copy.
      </p>
      <div className="row wrap">
        <CopyButton text={certUrl} label="Copy graduate link" className="btn primary small" />
        <CopyButton text={link} label="Copy verification link" className="btn small" />
        <button className="btn small" onClick={() => downloadQr(link, `QR-${entry.studentNumber}.png`)}>
          Download QR
        </button>
        <Link className="btn ghost small" to={`/certificate/${entry.certHash}?k=${entry.key}`}>
          Open certificate →
        </Link>
      </div>
    </div>
  );
}

function ListPanel({ signer }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const local = loadIssuedLinks();

  const refresh = useCallback((minBlock) => {
    setErr("");
    loadHistory(typeof minBlock === "number" ? minBlock : undefined)
      .then(setData)
      .catch((e) => setErr(friendlyError(e)));
  }, []);
  useEffect(() => refresh(), [refresh]);

  async function revoke(certHash) {
    setBusy(true);
    setErr("");
    try {
      const tx = await getWriteContract(signer).revokeCertificate(certHash, reason.trim());
      const t0 = performance.now();
      const receipt = await tx.wait();
      logPerf({ type: "revoke", ms: Math.round(performance.now() - t0), gasUsed: receipt.gasUsed.toString(), network: NETWORK.short, certHash, txHash: receipt.hash });
      setRevoking(null);
      setReason("");
      refresh(receipt.blockNumber);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!data && !err) return <div className="panel loading"><span className="spinner" /> Loading certificates from the blockchain…</div>;

  const filtered = (data?.certs || []).filter((c) => {
    if (!q) return true;
    const l = local[c.certHash.toLowerCase()];
    const hay = `${c.certHash} ${c.programme} ${l?.name || ""} ${l?.studentNumber || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="panel">
      {err && <div className="alert error">{err}</div>}
      {data && (
        <>
          <div className="stats">
            <div>
              <b>{data.totalIssued}</b>
              <span>issued</span>
            </div>
            <div>
              <b>{data.totalIssued - data.totalRevoked}</b>
              <span>valid</span>
            </div>
            <div>
              <b>{data.totalRevoked}</b>
              <span>revoked</span>
            </div>
          </div>
          <div className="row spread">
            <input className="filter" placeholder="Search by name, student no., programme or reference" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn ghost small" onClick={() => refresh()}>
              Refresh
            </button>
          </div>
          {filtered.length === 0 && <p className="muted">No certificates yet.</p>}
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Graduate</th>
                  <th>Programme</th>
                  <th>Recorded</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const l = local[c.certHash.toLowerCase()];
                  return (
                    <tr key={c.certHash}>
                      <td>
                        {l ? (
                          <>
                            {l.name}
                            <br />
                            <small className="muted">{l.studentNumber}</small>
                          </>
                        ) : (
                          <small className="muted">encrypted</small>
                        )}
                      </td>
                      <td>{c.programme}</td>
                      <td>{formatDate(c.issueDate)}</td>
                      <td>
                        <Link to={`/verify/${c.certHash}${l ? `?k=${l.key}` : ""}`}>
                          <code>{shortHash(c.certHash, 5)}</code>
                        </Link>
                      </td>
                      <td>
                        <span className={`pill ${c.revoked ? "revoked" : "valid"}`} title={c.revocationReason}>
                          {c.revoked ? "Revoked" : "Valid"}
                        </span>
                      </td>
                      <td className="actions">
                        {!c.revoked && revoking !== c.certHash && (
                          <button className="btn danger small" onClick={() => setRevoking(c.certHash)}>
                            Revoke
                          </button>
                        )}
                        {revoking === c.certHash && (
                          <div className="revokebox">
                            <input autoFocus placeholder="Reason, e.g. academic misconduct" value={reason} onChange={(e) => setReason(e.target.value)} />
                            <button className="btn danger small" disabled={busy || !reason.trim()} onClick={() => revoke(c.certHash)}>
                              {busy ? "Confirm in wallet…" : "Confirm revoke"}
                            </button>
                            <button className="btn ghost small" disabled={busy} onClick={() => setRevoking(null)}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">Names are shown only for certificates issued from this browser; on the blockchain they are encrypted.</p>
        </>
      )}
    </div>
  );
}

function AuditPanel() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    loadHistory()
      .then(setData)
      .catch((e) => setErr(friendlyError(e)));
  }, []);
  if (err) return <div className="alert error">{err}</div>;
  if (!data) return <div className="panel loading"><span className="spinner" /> Reading events from the blockchain…</div>;
  return (
    <div className="panel">
      <h3>Audit trail</h3>
      <p className="muted small">Every issuance and revocation, read directly from smart-contract events. These cannot be edited or deleted.</p>
      {data.events.length === 0 && <p className="muted">No activity yet.</p>}
      <ul className="timeline">
        {data.events.map((e) => (
          <li key={`${e.txHash}-${e.type}`} className={e.type.toLowerCase()}>
            <b>{e.type}</b> <code>{shortHash(e.certHash, 5)}</code> by <AddressLink address={e.by} /> · block {e.blockNumber} · <TxLink hash={e.txHash} />
            {e.reason && <div className="small">Reason: {e.reason}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsPanel({ signer, roles, onRolesChanged }) {
  const [jwt, setJwt] = useState(getPinataJwt());
  const [saved, setSaved] = useState(false);
  const [newAdmin, setNewAdmin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [perf, setPerf] = useState(getPerfLog());
  const reg = getRegistry();

  const issues = perf.filter((p) => p.type === "issue");
  const verifies = perf.filter((p) => p.type.startsWith("verify"));
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, p) => s + p.ms, 0) / arr.length) : null);
  const avgGas = issues.length ? Math.round(issues.reduce((s, p) => s + Number(p.gasUsed || 0), 0) / issues.length) : null;

  async function transfer() {
    if (!isAddress(newAdmin)) return setMsg({ type: "error", text: "Enter a valid wallet address." });
    if (!window.confirm(`Transfer the administrator role to ${newAdmin}? This wallet will lose the ability to issue.`)) return;
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const tx = await getWriteContract(signer).transferAdminRole(newAdmin);
      await tx.wait();
      setMsg({ type: "success", text: "Administrator role transferred." });
      onRolesChanged();
    } catch (e) {
      setMsg({ type: "error", text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <div className="panel">
        <h3>Document storage (IPFS)</h3>
        {pinataFromBuild() ? (
          <p>A Pinata key is built into this deployment. Documents are pinned to IPFS automatically.</p>
        ) : (
          <>
            <p className="small muted">
              Paste a Pinata JWT (free at pinata.cloud) to pin documents to public IPFS. It is saved only in this
              browser. On a borrowed computer, press Forget when you finish.
            </p>
            <Field label="Pinata JWT">
              <input type="password" value={jwt} onChange={(e) => setJwt(e.target.value)} placeholder="eyJhbGciOi…" />
            </Field>
            <div className="row">
              <button
                className="btn small primary"
                onClick={() => {
                  setPinataJwt(jwt);
                  setSaved(true);
                  setTimeout(() => setSaved(false), 1500);
                }}
              >
                {saved ? "Saved ✓" : "Save"}
              </button>
              <button
                className="btn small ghost"
                onClick={() => {
                  setPinataJwt("");
                  setJwt("");
                }}
              >
                Forget
              </button>
            </div>
          </>
        )}

        <h3 className="mt">Smart contract</h3>
        <dl className="details compact">
          <dt>Network</dt>
          <dd>{NETWORK.name}</dd>
          <dt>Contract</dt>
          <dd>
            <AddressLink address={reg.address} />
          </dd>
          <dt>Your wallet</dt>
          <dd>
            <AddressLink address={roles.address} /> {roles.isAdmin ? "(admin)" : "(issuer)"}
          </dd>
        </dl>

        {roles.isAdmin && (
          <>
            <h3 className="mt">Transfer administrator role</h3>
            <p className="small muted">Hands issuing rights to a new Registrar wallet without redeploying (FR10).</p>
            <div className="row">
              <input className="grow" placeholder="0x… new administrator wallet" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value.trim())} />
              <button className="btn danger small" disabled={busy || !newAdmin} onClick={transfer}>
                {busy ? "Confirm in wallet…" : "Transfer"}
              </button>
            </div>
          </>
        )}
        {msg.text && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      </div>

      <div className="panel">
        <h3>Performance log (this browser)</h3>
        <p className="small muted">Timings recorded automatically for the evaluation (Table 3.3 targets: issuance ≤ 15 s, verification ≤ 3 s).</p>
        <div className="stats">
          <div>
            <b>{issues.length}</b>
            <span>issuances</span>
          </div>
          <div>
            <b>{avg(issues) != null ? `${(avg(issues) / 1000).toFixed(1)} s` : "–"}</b>
            <span>mean confirm</span>
          </div>
          <div>
            <b>{avgGas != null ? avgGas.toLocaleString() : "–"}</b>
            <span>mean gas</span>
          </div>
          <div>
            <b>{avg(verifies) != null ? `${avg(verifies)} ms` : "–"}</b>
            <span>mean verify</span>
          </div>
        </div>
        <div className="row">
          <button className="btn small" disabled={!perf.length} onClick={() => downloadText("ucu-performance-log.csv", perfCsv(), "text/csv")}>
            Download CSV
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              clearPerfLog();
              setPerf([]);
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
