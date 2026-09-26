import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../api.js";
import { Bar, EASE, Icon, Pill, SENSING_WORD, SectionHead, State, Steps, goTo } from "../components/bits.jsx";

const ICON = { camera: "camera", wrench: "wrench", chart: "chart", person: "person" };

/** Gather evidence until the twin is confident enough to name a cause. */
export default function Investigate({ snap }) {
  const [ev, setEv] = useState(null);
  const [err, setErr] = useState(null);
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(null);

  const open = !["calm", "rising"].includes(snap.sim.phase);
  const fs = snap.focus_station;
  const low = snap.confidence < snap.threshold;

  const load = () => api.evidence().then((r) => { setEv(r); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { if (open) load(); else { setEv(null); setLast(null); } }, [open, snap.focus, snap.confidence]);

  const take = async (id) => {
    setBusy(id);
    try {
      const r = await api.collect(id);
      setLast(r.finding);
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  return (
    <>
      <SectionHead eyebrow="Incident · Step 2 of 5"
        title={open ? `Investigate ${fs.code} · ${fs.name}` : "No open incident"}
        right={open && <Pill tone={low ? "warn" : "ok"}>{low ? "More evidence needed" : "Ready for root cause"}</Pill>}>
        {open
          ? "The twin won't guess. It asks for evidence until it is confident enough to name a cause."
          : "When a station drifts far enough, the twin opens an incident here and asks for evidence."}
      </SectionHead>

      <Steps snap={snap} />

      {!open ? (
        <State icon="scan" title={snap.sim.phase === "rising" ? `Watching a drift at ${fs.code}` : "Nothing to investigate"}>
          {snap.sim.phase === "rising"
            ? `Cycle time at ${fs.code} is creeping up (${snap.metrics.cycle_time}s against a ${snap.metrics.target}s target). If it keeps rising, an investigation opens here.`
            : `All ${snap.totals.stations} stations are within their normal range.`}
        </State>
      ) : (
        <div className="flow wide">
          <div className="card" style={{ flexGrow: 0.8 }}>
            <div className="metric-label">Confidence</div>
            <div className="metric-value lg" style={{ color: low ? "var(--warn)" : "var(--text)" }}>
              {snap.confidence}<span className="metric-unit">%</span>
            </div>
            <div style={{ margin: "24px 0 44px" }}>
              <Bar value={snap.confidence} tone={low ? "warn" : "ok"} mark={snap.threshold} markLabel={`${snap.threshold}% needed`} thick />
            </div>
            <p className="muted" style={{ lineHeight: 1.65 }}>
              {low
                ? `The deviation is clear, but ${fs.code} is ${SENSING_WORD[fs.sensing].toLowerCase()} with ${fs.coverage}% sensor coverage. Each check below adds evidence.`
                : "Confidence is above the bar. The causes are ranked in the next step. You can keep checking for more certainty."}
            </p>
            {!low && (
              <button className="btn primary" style={{ marginTop: 24 }} onClick={() => goTo("cause")}>
                See the root cause <Icon name="arrow" />
              </button>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Collect evidence</div>
                <div className="card-sub">Pick what to check. Each result updates confidence.</div>
              </div>
            </div>
            {err && <p className="small t-crit" role="alert" style={{ marginBottom: 12 }}>{err}</p>}
            {!ev && !err && <p className="small muted">Loading the checks…</p>}
            <div className="stack gap-8">
              {(ev?.options ?? []).map((o) => (
                <button key={o.id} className={`option ${o.taken ? "done" : ""}`} onClick={() => take(o.id)}
                  disabled={o.taken || !!busy} aria-label={`${o.label}${o.taken ? ", done" : `, adds ${o.gain}%`}`}>
                  <span className="o-icon"><Icon name={o.taken ? "tick" : ICON[o.icon] ?? "info"} /></span>
                  <span className="o-label">{o.label}</span>
                  <span className="o-gain">{busy === o.id ? "Checking…" : o.taken ? "Done" : `+${o.gain}%`}</span>
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              {last && (
                <motion.div key={last.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE }} style={{ overflow: "hidden" }}>
                  <div className="finding" style={{ marginTop: 16 }}>
                    <div className="spread">
                      <span className="label">Latest result</span>
                      <Pill tone="accent">{last.confidence_before}% → {last.confidence_after}%</Pill>
                    </div>
                    <p style={{ marginTop: 12, lineHeight: 1.6 }}>{last.result}</p>
                    <p className="small" style={{ marginTop: 8, fontWeight: 600 }}>{last.verdict}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </>
  );
}
