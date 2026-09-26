import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { clock } from "../api.js";
import {
  BOTTLENECK, EASE, Events, Icon, Metric, Pill, SENSING_WORD, Spark, cycleTone, goTo, lineName, nextAction, riskTone,
} from "../components/bits.jsx";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** The first thing everyone sees: what's happening, and what needs doing. */
export default function Home({ snap, auth, layout }) {
  const [all, setAll] = useState(false);
  const m = snap.metrics;
  const fs = snap.focus_station;
  const act = nextAction(snap);
  const canGo = act.cta && layout.some((s) => s.id === act.cta[1] && !s.locked);
  const cycles = snap.trend.map((t) => t.cycle);
  const risks = snap.trend.map((t) => t.risk);
  const open = !["calm", "rising"].includes(snap.sim.phase);

  return (
    <>
      <div className="hero">
        <div style={{ minWidth: 0, flex: "1 1 520px" }}>
          <div className="eyebrow">{greeting()}, {/^\w\.$/.test(auth.displayName.split(" ")[0]) ? auth.displayName : auth.displayName.split(" ")[0]}</div>
          <AnimatePresence mode="wait">
            <motion.div key={act.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE }}>
              <h1>{act.title}</h1>
              <p>{act.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        {canGo && (
          <button className="btn primary" onClick={() => goTo(act.cta[1])} style={{ height: 48, padding: "0 24px" }}>
            {act.cta[0]} <Icon name="arrow" />
          </button>
        )}
      </div>

      <div className="flow">
        <Metric label="Cycle time" value={m.cycle_time} decimals={1} unit="s" tone={cycleTone(m.cycle_time, m.target)}
          sub={`Target ${m.target}s at ${fs.code}`}>
          <Spark data={cycles} target={m.target} tone={cycleTone(m.cycle_time, m.target)} />
        </Metric>
        <Metric label="Defect risk" value={m.defect_risk} unit="%" tone={riskTone(m.defect_risk)}
          sub={`At ${fs.code} · ${fs.name}`}>
          <Spark data={risks} tone={riskTone(m.defect_risk)} />
        </Metric>
        <Metric label="Throughput" value={m.throughput} unit="units/hr"
          sub={`${m.queue} waiting · bottleneck risk ${m.bottleneck_risk}%`}
          tone={riskTone(m.bottleneck_risk, BOTTLENECK) === "crit" ? "warn" : undefined} />
        <Metric label="Active alerts" value={snap.totals.alerts}
          tone={snap.lines.some((l) => l.status === "critical") ? "crit" : snap.totals.alerts ? "warn" : "ok"}
          sub={`Across ${snap.totals.stations} stations · ${snap.totals.coverage}% sensor coverage`} />
      </div>

      <div className="flow wide" style={{ marginTop: 20 }}>
        <div className="card" style={{ flexGrow: 1.4 }}>
          <div className="card-head" style={{ marginBottom: 8 }}>
            <div>
              <div className="card-title">Recent activity</div>
              <div className="card-sub">What the twin has noticed this shift</div>
            </div>
            {snap.events.length > 6 && (
              <button className="btn ghost sm" onClick={() => setAll((v) => !v)}>{all ? "Show less" : "Show all"}</button>
            )}
          </div>
          <Events events={snap.events} clock={clock} limit={all ? undefined : 6} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{open ? "Station under investigation" : "Station being watched"}</div>
              <div className="card-sub">{lineName(snap, fs.line)}</div>
            </div>
            <span className="code">{fs.code}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{fs.name}</div>
          <dl className="kv" style={{ marginTop: 20 }}>
            <dt>Sensing</dt><dd>{SENSING_WORD[fs.sensing]} · {fs.coverage}%</dd>
            <dt>Confidence</dt>
            <dd className={open && snap.confidence < snap.threshold ? "t-warn" : undefined}>{snap.confidence}%</dd>
            <dt>Decision</dt>
            <dd>{snap.decision ? (snap.decision.verdict === "approved" ? `Approved: ${snap.decision.scenario.name}` : "Rejected") : "None yet"}</dd>
          </dl>
          {open && <div style={{ marginTop: 20 }}><Pill tone={snap.ready ? "ok" : "warn"}>
            {snap.ready ? "Enough evidence to act" : `Needs ${snap.threshold}% confidence to recommend`}</Pill></div>}
        </div>
      </div>
    </>
  );
}
