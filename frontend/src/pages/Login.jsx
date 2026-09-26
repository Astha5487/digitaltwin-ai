import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../api.js";
import { EASE, Icon } from "../components/bits.jsx";

/** Sign-in. Three fixed roles with prototype credentials. */
export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState([]);
  const [plant, setPlant] = useState(null);

  // Demo accounts and plant size both come from the backend, never hardcoded.
  useEffect(() => {
    api.roles().then((r) => setDemo(r.roles)).catch(() => {});
    api.snapshot().then((s) => setPlant({ stations: s.totals.stations, lines: s.lines.length })).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api.login(username, password));
    } catch (err) {
      setError(err.status === 401 ? "That username and password don't match." : "Can't reach the twin. Check that the backend is running.");
    } finally {
      setBusy(false);
    }
  };

  const fill = (d) => { setUsername(d.username); setPassword(d.password); setError(null); };

  return (
    <main className="login">
      <motion.div className="login-inner" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}>
        <div className="row gap-12"><span className="logo"><i /></span><span className="wordmark">DIGITALTWIN<em>.AI</em></span></div>

        <h1>Sign in to the plant</h1>
        <p className="lead">
          A live decision twin for the assembly line{plant ? ` — ${plant.stations} stations across ${plant.lines} lines` : ""}.
          It reads, reasons and recommends. People make the call.
        </p>

        <form onSubmit={submit}>
          <div>
            <label className="field-label" htmlFor="u">Username</label>
            <input id="u" className="input" value={username} onChange={(e) => setUsername(e.target.value)}
              autoComplete="username" autoCapitalize="none" spellCheck={false} required />
          </div>
          <div>
            <label className="field-label" htmlFor="p">Password</label>
            <input id="p" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" required />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary wide" type="submit" disabled={busy} style={{ height: 48, marginTop: 4 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {demo.length > 0 && (
          <div className="demo">
            <div className="label" style={{ marginBottom: 8 }}>Demo accounts</div>
            {demo.map((d) => (
              <button key={d.username} type="button" className="demo-row" onClick={() => fill(d)}>
                <span>
                  <span style={{ fontWeight: 600, display: "block" }}>{d.roleName}</span>
                  <span className="mono small muted">{d.username}</span>
                </span>
                <Icon name="arrow" size={16} style={{ color: "var(--text-2)" }} />
              </button>
            ))}
          </div>
        )}

        <p className="login-foot">Powered by <b style={{ color: "var(--text)" }}>NVIDIA NeMo</b></p>
      </motion.div>
    </main>
  );
}
