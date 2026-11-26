import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parseReference } from "../lib/certificate";

export default function Home() {
  const [ref, setRef] = useState("");
  const navigate = useNavigate();

  function go(e) {
    e.preventDefault();
    const { certHash, key } = parseReference(ref);
    navigate(certHash ? `/verify/${certHash}${key ? `?k=${key}` : ""}` : `/verify?q=${encodeURIComponent(ref)}`);
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Uganda Christian University</p>
        <h1>Check that a UCU certificate is genuine, in seconds.</h1>
        <p className="lead">
          Certificates are recorded on the Ethereum blockchain. Anyone can verify one with its reference or QR
          code: no account, no wallet, no fee and no letter to the Registrar.
        </p>
        <form className="searchbar" onSubmit={go}>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Paste a certificate reference (0x…) or share link"
            aria-label="Certificate reference"
          />
          <button className="btn primary" disabled={!ref.trim()}>
            Verify
          </button>
        </form>
      </section>

      <section className="cards3">
        <Link to="/admin" className="rolecard">
          <span className="roleicon">🏛️</span>
          <h3>Registrar</h3>
          <p>Issue and revoke certificates. Signed with the Registrar&rsquo;s MetaMask wallet; only authorised wallets can write.</p>
          <span className="more">Open Registrar portal →</span>
        </Link>
        <Link to="/certificate" className="rolecard">
          <span className="roleicon">🎓</span>
          <h3>Graduate</h3>
          <p>Open your digital certificate, print it, download it, and share its link or QR code with employers.</p>
          <span className="more">Open my certificate →</span>
        </Link>
        <Link to="/verify" className="rolecard">
          <span className="roleicon">🔍</span>
          <h3>Employer / Verifier</h3>
          <p>Verify by reference, link, QR code or certificate file. Results: valid, revoked or not found.</p>
          <span className="more">Verify a certificate →</span>
        </Link>
      </section>

      <section className="panel">
        <h2>How it works</h2>
        <ol className="how">
          <li>
            <b>Issue.</b> The Registrar enters the graduate&rsquo;s details. The certificate is encrypted in the
            browser and stored on IPFS.
          </li>
          <li>
            <b>Record.</b> Its hash and IPFS address are written to the smart contract on Ethereum. The record cannot
            be silently changed.
          </li>
          <li>
            <b>Share.</b> The graduate gets a link and QR code. The decryption key travels only in the link.
          </li>
          <li>
            <b>Verify.</b> A verifier opens the link. The app checks the blockchain record and that the document
            still matches its hash.
          </li>
        </ol>
      </section>
    </>
  );
}
