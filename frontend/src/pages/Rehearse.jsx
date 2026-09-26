import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../api.js";
import { EASE, Icon, Pill, SectionHead, State, goTo, riskTone, toneColor } from "../components/bits.jsx";

/** Predicted queue shape per option, drawn as bars. */
function queueShape(id, i) {
  if (id === "repair") return { h: i < 5 ? 34 + i * 9 : 70 - (i - 5) * 4.8, c: "var(--warn)" };   // build-up, then recovery
  if (id === "nothing") return { h: 34 + i * 3.4, c: "var(--crit)" };                           // keeps growing
  if (id === "adjust") return { h: 92 - i * 4.6, c: "var(--ok)" };                              // drains now
  if (id === "wait") return { h: 34 + i * 1.8, c: "var(--warn)" };                              // grows until service
  return { h: 34, c: "var(--ok)" };
}
const QUEUE_NOTE = {
  repair: "Short build-up, then recovery",
  nothing: "Queue keeps growing",
  adjust: "Queue drains",
  wait: "Queue grows until maintenance",
};

/** Four futures, rehearsed on the twin. A person approves or rejects. */
export default function Decide({ snap, setPreview }) {
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState(null);
  const [sending, setSending] = useState(false);

  const incident = !["calm", "rising"].includes(snap.sim.phase);
  const ready = incident && snap.ready;
  const decided = incident && !!snap.decision;

  useEffect(() => {
    if (!ready || decided) return;
    api.scenarios().then((r) => { setPlan(r); setErr(null); setPicked((p) => p ?? r.recommended); })
      .catch((e) => setErr(e.message));
  }, [ready, decided, snap.focus]);
  useEffect(() => { if (!incident) { setPlan(null); setPicked(null); } }, [incident]);

  // While comparing, the 3D conveyor previews each option's flow.
  useEffect(() => {
    const sc = plan?.scenarios.find((s) => s.id === picked);
    setPreview?.(sc && !decided ? (sc.throughput > 0 ? 1.5 : sc.throughput < -10 ? 0.3 : 0.8) : null);
    return () => setPreview?.(null);
  }, [picked, plan, decided, setPreview]);

  const head = (
    <SectionHead eyebrow="Incident · Step 4 of 5" title="What should we do?">
      Each option is rehearsed on the twin first. The twin recommends; a person decides.
    </SectionHead>
  );

  if (decided) {
    const d = snap.decision;
    const ok = d.verdict === "approved";
    return (
      <>
        {head}
        <div className="card">
          <div className="spread wrap" style={{ gap: 24 }}>
            <div>
              <Pill tone={ok ? "ok" : "crit"} icon={ok ? "tick" : "cross"}>{ok ? "Approved" : "Rejected"}</Pill>
              <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 14 }}>
                {ok ? d.scenario.name : "No action applied"}
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                {ok ? `Applied at ${snap.focus_station.code}. Predicted defect risk after: ${d.scenario.risk_after}%.`
                  : `The recommendation was rejected. ${snap.focus_station.code} is left as it is.`}
              </p>
            </div>
            <button className="btn secondary" onClick={() => goTo("outcome")}>Follow the outcome <Icon name="arrow" /></button>
          </div>
        </div>
      </>
    );
  }

  if (!ready) {
    return (
      <>
        {head}
        <State icon="check" title={incident ? "Not ready to decide yet" : "No open incident"}>
          {incident ? `Options are rehearsed once the root cause is clear (${snap.threshold}% confidence).`
            : "When an incident needs a decision, the options appear here."}
        </State>
      </>
    );
  }
  if (err) return <>{head}<State icon="info" title="Couldn't load the options">{err}</State></>;
  if (!plan) return <>{head}<p className="muted">Rehearsing the options…</p></>;

  const sc = plan.scenarios.find((s) => s.id === picked) ?? plan.scenarios[0];
  const rec = plan.scenarios.find((s) => s.id === plan.recommended);
  const code = plan.focus?.code;

  const send = async (verdict) => {
    setSending(true);
    try { await api.decide(sc.id, verdict); } catch (e) { setErr(e.message); } finally { setSending(false); }
  };

  return (
    <>
      {head}

      <div className="scenarios" role="radiogroup" aria-label="Options">
        {plan.scenarios.map((s, i) => {
          const on = s.id === sc.id;
          const tone = riskTone(s.risk_after);
          return (
            <motion.button key={s.id} role="radio" aria-checked={on} className={`scenario ${on ? "on" : ""}`}
              onClick={() => setPicked(s.id)} data-spot=""
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, ease: EASE }}>
              <div className="spread" style={{ minHeight: 26 }}>
                <span className="label">Option {i + 1}</span>
                {s.id === plan.recommended && <Pill tone="accent">Recommended</Pill>}
              </div>
              <div className="sc-name">{s.name}</div>
              <div className="sc-risk">
                <span className="from">{s.risk_before}%</span>
                <span className="to" style={{ color: tone === "ok" ? "var(--text)" : toneColor(tone) }}>{s.risk_after}%</span>
              </div>
              <div className="small muted">Defect risk after</div>
              <dl className="kv" style={{ marginTop: 16, fontSize: 13.5 }}>
                <dt>Vehicles at risk</dt><dd>{s.vehicles}</dd>
                <dt>Downtime</dt><dd>{s.downtime}</dd>
                <dt>Throughput</dt><dd className={s.throughput < 0 ? "t-crit" : "t-ok"}>{s.throughput > 0 ? "+" : ""}{s.throughput}%</dd>
              </dl>
              <p className="sc-note">{s.note}</p>
            </motion.button>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Predicted queue behind {code}</div>
            <div className="card-sub">{sc.name} · {QUEUE_NOTE[sc.id] ?? "Queue drains"} · {plan.shift_pattern}</div>
          </div>
        </div>
        <div className="qbars" role="img" aria-label={`Queue projection: ${QUEUE_NOTE[sc.id]}`}>
          {Array.from({ length: 20 }).map((_, i) => {
            const { h, c } = queueShape(sc.id, i);
            return <motion.div key={i} style={{ background: c, opacity: 0.35 + i * 0.03 }}
              animate={{ height: `${Math.max(8, Math.min(100, h))}%` }} transition={{ duration: 0.5, delay: i * 0.015, ease: EASE }} />;
          })}
        </div>
        <div className="spread small muted" style={{ marginTop: 10 }}><span>Now</span><span>End of shift</span></div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="decision-bar">
          <div>
            <div className="eyebrow">The twin recommends</div>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 8 }}>{rec?.name}</div>
            <div style={{ marginTop: 14 }}>
              {plan.why.map((w) => <div key={w} className="ev-item"><Icon name="tick" style={{ color: "var(--ok)" }} /><span>{w}</span></div>)}
            </div>
            <p className="small muted" style={{ marginTop: 10, lineHeight: 1.6 }}>{plan.timing}</p>
          </div>
          <div>
            <div className="label">You're about to decide on</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>
              {sc.name}{sc.id !== plan.recommended && <span className="small t-warn" style={{ fontWeight: 500 }}> · not the recommendation</span>}
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>Defect risk {sc.risk_before}% → {sc.risk_after}% · downtime {sc.downtime}</p>
            <div className="stack gap-8" style={{ marginTop: 20 }}>
              <button className="btn ok wide" style={{ height: 48 }} disabled={sending} onClick={() => send("approved")}>
                <Icon name="tick" /> Approve “{sc.name}”
              </button>
              <button className="btn danger wide" disabled={sending} onClick={() => send("rejected")}>Reject and take no action</button>
            </div>
            <p className="small muted" style={{ marginTop: 14 }}>The twin never writes to plant equipment. Your decision is recorded and played out on the twin.</p>
          </div>
        </div>
      </div>
    </>
  );
}
