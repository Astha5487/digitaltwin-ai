import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../api.js";
import { Bar, Dot, EASE, Icon, Metric, Pill, SectionHead, State, riskTone } from "../components/bits.jsx";

/** Prediction against reality, then a human verdict the twin keeps. */
export default function Outcome({ snap, auth }) {
  const [out, setOut] = useState(null);
  const [learned, setLearned] = useState(null);
  const [answering, setAnswering] = useState(false);
  const [err, setErr] = useState(null);

  const decided = !["calm", "rising"].includes(snap.sim.phase) && !!snap.decision;
  const canReview = auth.role !== "leadership";
  const acc = snap.learning;

  // Follow the outcome live until it settles.
  useEffect(() => {
    if (!decided) { setOut(null); setLearned(null); return; }
    let timer, alive = true;
    const load = () => api.outcome().then((r) => {
      if (!alive) return;
      setOut(r); setErr(null);
      if (!r.settled) timer = setTimeout(load, 1000);
    }).catch((e) => alive && setErr(e.message));
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [decided, snap.focus, snap.sim.phase]);

  const answer = async (correct) => {
    setAnswering(true);
    try { setLearned(await api.feedback(correct)); } catch (e) { setErr(e.message); } finally { setAnswering(false); }
  };

  const head = (
    <SectionHead eyebrow="Incident · Step 5 of 5" title="Did it work?"
      right={<Pill tone="accent">Running accuracy {acc.running_accuracy}%</Pill>}>
      The twin compares what it predicted with what actually happened, and a person confirms the result.
    </SectionHead>
  );

  if (!decided) {
    return (
      <>
        {head}
        <State icon="trend" title="No outcome to review yet">
          {`Outcomes appear after a decision is made. So far, ${acc.reviews === 1 ? "1 outcome has" : `${acc.reviews} outcomes have`} been reviewed this session.`}
        </State>
      </>
    );
  }
  if (err && !out) return <>{head}<State icon="info" title="Couldn't load the outcome">{err}</State></>;
  if (!out) return <>{head}<p className="muted">Loading the outcome…</p></>;

  const rejected = out.verdict === "rejected";
  const code = out.focus?.code;

  if (!out.settled) {
    return (
      <>
        {head}
        <div className="card">
          <div className="row gap-12"><Dot tone="accent" pulse /><span style={{ fontWeight: 600 }}>
            {rejected ? `Watching ${code} with no action applied` : `Applying “${out.scenario_name}” at ${code}`}</span></div>
          <p className="muted" style={{ marginTop: 8 }}>The twin is watching the station settle before comparing it with the forecast.</p>
          <div className="flow" style={{ marginTop: 24 }}>
            <Metric label="Defect risk now" value={out.risk_after} unit="%" sub={`Was ${out.risk_before}%`} tone={riskTone(out.risk_after)} />
            <Metric label="Cycle time now" value={out.cycle_after} decimals={1} unit="s" sub={`Was ${out.cycle_before}s`} />
          </div>
        </div>
      </>
    );
  }

  const diff = out.predicted_drop - out.actual_drop;
  const verdictLine = rejected
    ? `Nothing was applied, so nothing was expected to change. Defect risk stayed at ${out.risk_after}%.`
    : `The twin predicted a ${out.predicted_drop}-point drop in defect risk; the line delivered ${out.actual_drop}. ${
      Math.abs(diff) <= 3 ? "That's about right." : diff > 3 ? "It slightly over-promised." : "The actual drop beat the forecast."}`;
  const reviewed = snap.feedback != null;

  return (
    <>
      {head}

      <div className="flow">
        <Metric label="Defect risk" value={out.risk_after} unit="%" sub={`Was ${out.risk_before}% at ${code}`} tone={riskTone(out.risk_after)} />
        <Metric label="Cycle time" value={out.cycle_after} decimals={1} unit="s" sub={`Was ${out.cycle_before}s`} />
        <Metric label="Predicted drop" value={out.predicted_drop} unit="pts" sub="The twin's forecast" />
        <Metric label="Actual drop" value={out.actual_drop} unit="pts" sub="What happened" tone={out.actual_drop > 0 ? "ok" : "crit"} />
      </div>

      <div className="flow wide" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="metric-label">Prediction accuracy for this incident</div>
          <div className="metric-value lg">{out.accuracy}<span className="metric-unit">%</span></div>
          <div style={{ marginTop: 20 }}><Bar value={out.accuracy} tone="accent" thick /></div>
          <p className="muted" style={{ marginTop: 20, lineHeight: 1.65 }}>{verdictLine}</p>
          <p className="small" style={{ marginTop: 14, color: "var(--text)" }}>{out.residual}</p>
        </div>

        <div className="card">
          {!reviewed ? (
            canReview ? (
              <>
                <div className="card-title" style={{ fontSize: 20 }}>{rejected ? "Was rejecting it the right call?" : "Was the recommendation right?"}</div>
                <p className="muted" style={{ marginTop: 10, lineHeight: 1.65 }}>
                  Your answer is what the twin keeps. It's how false alarms get caught before they cost trust on the floor.
                </p>
                <div className="row gap-8 wrap" style={{ marginTop: 24 }}>
                  <button className="btn ok" style={{ flex: 1 }} disabled={answering} onClick={() => answer(true)}><Icon name="tick" />Yes, it helped</button>
                  <button className="btn danger" style={{ flex: 1 }} disabled={answering} onClick={() => answer(false)}>No, it didn't</button>
                </div>
                {err && <p className="small t-crit" style={{ marginTop: 12 }}>{err}</p>}
              </>
            ) : (
              <State icon="person" title="Awaiting review">The floor team confirms whether the recommendation was right.</State>
            )
          ) : (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}>
              <Pill tone={snap.feedback ? "ok" : "warn"} icon={snap.feedback ? "tick" : "cross"}>
                {snap.feedback ? "Confirmed as helpful" : "Marked as not helpful"}</Pill>
              <div className="metric-label" style={{ marginTop: 20 }}>Running accuracy</div>
              <div className="metric-value">
                {learned && <span className="faint" style={{ fontSize: 20, textDecoration: "line-through", marginRight: 12 }}>{learned.accuracy_before}%</span>}
                {acc.running_accuracy}<span className="metric-unit">%</span>
              </div>
              {learned && (
                <div style={{ marginTop: 16 }}>
                  {learned.learned.map((l) => <div key={l} className="ev-item"><Icon name="tick" style={{ color: "var(--ok)" }} /><span>{l}</span></div>)}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}
