import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../api.js";
import { EASE, Metric, Pill, SectionHead, State } from "../components/bits.jsx";

const MIX = [
  ["full", "Measured", "var(--text)"],
  ["shadow", "Inferred", "var(--accent)"],
  ["manual", "Manual", "rgba(255,255,255,.22)"],
];

/** The fleet and the business case. Leadership. */
export default function Portfolio({ snap }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  // Plant A is the live twin, so refresh when its numbers change.
  useEffect(() => { api.plants().then(setD).catch((e) => setErr(e.message)); }, [snap.totals.coverage, snap.totals.stations]);

  const head = (
    <SectionHead eyebrow="Leadership" title="Portfolio and business case">
      One twin across every plant, and what it is worth.
    </SectionHead>
  );
  if (err) return <>{head}<State icon="lock" title="Not available">{err}</State></>;
  if (!d) return <>{head}<p className="muted">Loading the portfolio…</p></>;

  const plants = d.plants;
  const live = plants.find((p) => p.live);
  const lowest = [...plants].sort((a, b) => a.coverage - b.coverage)[0];
  const totalLines = plants.reduce((a, p) => a + p.lines, 0);
  const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

  return (
    <>
      {head}

      <div className="flow">
        <Metric label="Annual benefit" value={`₹${d.business.annual_benefit_cr}`} unit="Cr"
          sub={`Modelled across ${plants.length} plants and ${totalLines} lines`} />
        <Metric label="Payback" value={d.business.payback_months} unit="months" sub="Including retrofit sensing" />
        <Metric label="Downtime" value={signed(d.downtime_change_pct)} unit="%" sub="Plant A, vs 12-month baseline" tone="ok" />
        <Metric label="Prediction accuracy" value={snap.learning.running_accuracy} unit="%"
          sub={`Running, confirmed by people · ${snap.learning.reviews} reviewed this session`} />
      </div>

      <div className="flow wide" style={{ marginTop: 20 }}>
        {plants.map((p, i) => (
          <motion.div key={p.id} className="card plant-card" data-spot=""
            initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: i * 0.06, ease: EASE }}>
            <div className="spread" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="row gap-8"><span style={{ fontSize: 20, fontWeight: 600 }}>{p.name}</span>{p.live && <Pill tone="ok">Live</Pill>}</div>
                <div className="small muted" style={{ marginTop: 4 }}>{p.city} · {p.age} old</div>
              </div>
              <Ring value={p.coverage} />
            </div>
            <dl className="kv">
              <dt>Lines</dt><dd>{p.lines}</dd>
              <dt>Stations</dt><dd>{p.stations}</dd>
              <dt>Sensor coverage</dt><dd>{p.coverage}%</dd>
            </dl>
            <div>
              <div className="segbar" aria-label={MIX.map(([k, l]) => `${p.counts[k]} ${l.toLowerCase()}`).join(", ")}>
                {MIX.map(([k, , c]) => <i key={k} style={{ width: `${(p.counts[k] / p.stations) * 100}%`, background: c }} />)}
              </div>
              <div className="row gap-12 wrap" style={{ marginTop: 10, rowGap: 6 }}>
                {MIX.map(([k, l, c]) => <span key={k} className="key"><span className="sw" style={{ background: c }} />{p.counts[k]} {l.toLowerCase()}</span>)}
              </div>
            </div>
            <p className="small muted">{p.note}</p>
          </motion.div>
        ))}
      </div>

      {lowest.id !== live.id && (
        <p style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 760, marginTop: 40, color: "var(--text)" }}>
          {lowest.name} runs at {lowest.coverage}% sensor coverage against {live.coverage}% at {live.name}.
          <span className="muted"> The twin reaches the same conclusions there; it simply leans harder on inference to get to them.</span>
        </p>
      )}
    </>
  );
}

function Ring({ value }) {
  const R = 32, C = 2 * Math.PI * R;
  return (
    <div className="ring-wrap" role="img" aria-label={`${value}% sensor coverage`}>
      <svg viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
        <motion.circle cx="38" cy="38" r={R} fill="none" stroke={value >= 75 ? "var(--text)" : value >= 60 ? "var(--accent)" : "var(--warn)"}
          strokeWidth="5" strokeLinecap="round" strokeDasharray={C}
          initial={{ strokeDashoffset: C }} whileInView={{ strokeDashoffset: C - (value / 100) * C }} viewport={{ once: true }}
          transition={{ duration: 1, ease: EASE }} />
      </svg>
      <span>{value}%</span>
    </div>
  );
}
