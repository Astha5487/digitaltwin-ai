import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../api.js";
import { Bar, EASE, Icon, Pill, SectionHead, State, goTo } from "../components/bits.jsx";

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Ranked causes, each with the evidence for and against it. */
export default function Cause({ snap }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);

  const incident = !["calm", "rising"].includes(snap.sim.phase);
  const ready = incident && snap.ready;

  useEffect(() => {
    if (!ready) { setData(null); return; }
    api.causes().then((r) => { setData(r); setErr(null); }).catch((e) => setErr(e.message));
  }, [ready, snap.focus, snap.confidence]);

  const head = (
    <SectionHead eyebrow="Incident · Step 3 of 5" title="Why is it happening?">
      Every likely cause, ranked by how well the evidence supports it. Operator activity is treated as process evidence, not blame.
    </SectionHead>
  );

  if (!ready) {
    return (
      <>
        {head}
        <State icon="branch" title={incident ? "Waiting for enough evidence" : "No open incident"}>
          {incident
            ? `Causes are ranked once confidence reaches ${snap.threshold}%. It's at ${snap.confidence}% now.`
            : "Root causes appear here once an incident is open and investigated."}
        </State>
      </>
    );
  }
  if (err) return <>{head}<State icon="info" title="Couldn't load the causes">{err}</State></>;
  if (!data) return <>{head}<p className="muted">Ranking the causes…</p></>;

  const ranked = [...data.causes].sort((a, b) => b.value - a.value);
  const top = ranked.find((c) => c.verdict === "supported") ?? ranked[0];
  const cur = ranked.find((c) => c.id === open) ?? top;
  const others = ranked.filter((c) => c.id !== top.id).map((c) => c.name.toLowerCase());
  const code = data.focus?.code;

  return (
    <>
      {head}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ gap: 24 }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <div className="row gap-8"><Pill tone="ok">Most likely</Pill><span className="small muted">{data.confidence}% confidence</span></div>
            <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.025em", marginTop: 14 }}>
              {top.name} at {code} <span className="t-accent">· {top.value}%</span>
            </div>
            <p className="muted" style={{ marginTop: 8, lineHeight: 1.65 }}>
              {cap(others.length > 1 ? `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]} are` : `${others[0]} is`)} ruled out on the evidence.
            </p>
          </div>
          <button className="btn primary" onClick={() => goTo("decide")}>Compare the options <Icon name="arrow" /></button>
        </div>
      </div>

      <div className="flow wide">
        <div className="card" style={{ padding: 12 }}>
          {ranked.map((c, i) => (
            <button key={c.id} className={`cause-row ${cur.id === c.id ? "on" : ""}`} onClick={() => setOpen(c.id)} aria-pressed={cur.id === c.id}>
              <span className="c-rank">{i + 1}</span>
              <span className="c-name">{c.name}</span>
              <span className="flex-1 c-bar"><Bar value={c.value} tone={c.verdict === "supported" ? "accent" : ""} /></span>
              <span className="c-val" style={{ color: c.verdict === "supported" ? "var(--text)" : "var(--text-2)" }}>{c.value}%</span>
            </button>
          ))}
        </div>

        <div className="card">
          <AnimatePresence mode="wait">
            <motion.div key={cur.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE }}>
              <div className="spread">
                <div className="card-title">{cur.name}</div>
                <Pill tone={cur.verdict === "supported" ? "ok" : ""}>{cur.verdict === "supported" ? "Supported" : "Ruled out"}</Pill>
              </div>
              {cur.for.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="label" style={{ marginBottom: 4 }}>Points toward it</div>
                  {cur.for.map((f) => <div key={f} className="ev-item"><Icon name="tick" style={{ color: "var(--ok)" }} /><span>{f}</span></div>)}
                </div>
              )}
              {cur.against.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="label" style={{ marginBottom: 4 }}>Points against it</div>
                  {cur.against.map((f) => <div key={f} className="ev-item"><Icon name="cross" style={{ color: "var(--text-3)" }} /><span className="muted">{f}</span></div>)}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
