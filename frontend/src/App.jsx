import { NavLink, Route, Routes } from "react-router-dom";
import { NETWORK, getRegistry } from "./lib/config";
import Home from "./pages/Home";
import Verify from "./pages/Verify";
import Certificate from "./pages/Certificate";
import Admin from "./pages/Admin";

export default function App() {
  const configured = !!getRegistry();
  return (
    <div className="app">
      <header className="topbar no-print">
        <NavLink to="/" className="brand">
          <img src="favicon.svg" alt="" width="34" height="34" />
          <span>
            <strong>UCU CertVerify</strong>
            <small>Blockchain certificate verification</small>
          </span>
        </NavLink>
        <nav>
          <NavLink to="/verify">Verify</NavLink>
          <NavLink to="/certificate">My certificate</NavLink>
          <NavLink to="/admin">Registrar</NavLink>
        </nav>
        <span className={`netbadge ${configured ? "" : "warn"}`} title={NETWORK.name}>
          <i /> {NETWORK.short}
        </span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/:certHash" element={<Verify />} />
          <Route path="/certificate" element={<Certificate />} />
          <Route path="/certificate/:certHash" element={<Certificate />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <footer className="no-print">
        Uganda Christian University · Department of Computing &amp; Technology · Final-year research prototype ·
        Ethereum + IPFS + ReactJS
      </footer>
    </div>
  );
}
