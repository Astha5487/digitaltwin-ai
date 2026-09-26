import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CONGESTED, Dot, EASE, SENSING_WORD, STATUS_WORD, SectionHead, cycleTone, plural, statusTone, toneColor,
} from "../components/bits.jsx";

/** Every station on every line, drawn as its live cycle time. */
export default function Lines({ snap }) {
  const target = snap.metrics.target;
  return (
    <>
      <SectionHead eyebrow="Live status" title="Lines at a glance"
        right={<div className="row gap-16 wrap">
          <span className="key"><span className="sw" style={{ background: "rgba(255,255,255,.28)" }} />Healthy</span>
          <span className="key"><span className="sw" style={{ background: "var(--warn)" }} />Watch</span>
          <span className="key"><span className="sw" style={{ background: "var(--crit)" }} />At risk</span>
        </div>}>
        Each bar is one station. Its height is the live cycle time; the dashed line is the {target}s target.
      </SectionHead>

      <div className="card" style={{ padding: "32px 28px 24px" }}>
        <SystemMap snap={snap} />
      </div>

      <div className="line-cards" style={{ marginTop: 20 }}>
        {snap.lines.map((l) => {
          const avg = l.stations.reduce((a, s) => a + s.cycle, 0) / l.stations.length;
          const worst = l.stations.reduce((a, s) => (s.cycle > a.cycle ? s : a), l.stations[0]);
          return (
            <div key={l.id} className="line-card" data-spot="">
              <div className="spread">
                <span style={{ fontSize: 15, fontWeight: 600 }}>{l.name}</span>
                <Dot tone={l.status === "healthy" ? "" : statusTone(l.status)} pulse={l.alerts > 0} />
              </div>
              <div className="metric-value sm" style={{ color: toneColor(cycleTone(avg, target) === "ok" ? "" : cycleTone(avg, target)) }}>
                {avg.toFixed(1)}<span className="metric-unit">s avg</span>
              </div>
              <div className="metric-sub">
                {l.alerts ? <span className={l.status === "critical" ? "t-crit" : "t-warn"}>{plural(l.alerts, "alert")}</span> : "No alerts"}
                {" · "}slowest {worst.code} at {worst.cycle}s
              </div>
              <div className="mini" aria-hidden>
                {l.stations.map((s) => <i key={s.code} data-status={s.status} />)}
              </div>
              <div className="small muted" style={{ marginTop: 12 }}>{plural(l.count, "station")} · {l.coverage}% sensor coverage</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SystemMap({ snap }) {
  const [tip, setTip] = useState(null);
  const lines = snap.lines;
  const target = snap.metrics.target;
  const congested = snap.metrics.bottleneck_risk > CONGESTED;

  const W = 1000, GAP = 22, BASE = 200, H = 236;
  const total = lines.reduce((a, l) => a + l.stations.length, 0);
  const step = (W - GAP * (lines.length - 1)) / total;
  const bw = Math.max(3, Math.min(10, step * 0.56));
  const cy = (c) => Math.max(14, Math.min(150, ((c - 30) / 60) * 150));
  const ty = BASE - cy(target);

  const layout = useMemo(() => {
    let x = 0;
    return lines.map((l) => {
      const x0 = x;
      const st = l.stations.map((s, i) => ({ ...s, x: x0 + i * step + step / 2 }));
      x += l.stations.length * step + GAP;
      return { ...l, x0, x1: x0 + l.stations.length * step, st };
    });
  }, [lines, step]);

  const focus = layout.flatMap((l) => l.st).find((s) => s.code === snap.focus);
  const showFocus = focus && focus.status !== "healthy";

  return (
    <div className="sysmap">
      <svg viewBox={`-4 0 ${W + 8} ${H}`} role="img"
        aria-label={`${total} stations across ${lines.length} lines, ${snap.totals.alerts} need attention.`}>
        {layout.map((l) => (
          <g key={l.id}>
            <text x={l.x0} y={14} fill="var(--text)" style={{ font: "600 13px var(--sans)" }}>{l.name}</text>
            {l.x1 - l.x0 > 220 && (
              <text x={l.x1} y={14} textAnchor="end" fill={l.alerts ? toneColor(statusTone(l.status)) : "var(--text-2)"}
                style={{ font: "500 12px var(--sans)" }}>
                {l.alerts ? plural(l.alerts, "alert") : `${l.count} stations`}
              </text>
            )}
            <line x1={l.x0} x2={l.x1} y1={26} y2={26} stroke="var(--line-2)" />
          </g>
        ))}

        <line x1={0} x2={W} y1={ty} y2={ty} stroke="var(--line-3)" strokeDasharray="3 5" />
        <text x={W} y={ty - 6} textAnchor="end" fill="var(--text-2)" style={{ font: "500 11px var(--sans)" }}>Target {target}s</text>

        {layout.map((l) => l.st.map((s) => {
          const h = cy(s.cycle);
          const col = s.status === "healthy" ? "rgba(255,255,255,.28)" : toneColor(statusTone(s.status));
          return (
            <g key={s.code} onPointerEnter={() => setTip(s)} onPointerLeave={() => setTip(null)}>
              <rect x={s.x - step / 2} y={30} width={step} height={BASE - 20} fill="transparent" />
              <motion.rect x={s.x - bw / 2} width={bw} rx={Math.min(3, bw / 2)} fill={col}
                initial={false} animate={{ y: BASE - h, height: h }} transition={{ duration: 0.6, ease: EASE }}
                opacity={tip && tip.code !== s.code ? 0.5 : 1} />
              {s.sensing !== "full" && (
                <circle cx={s.x} cy={BASE + 14} r="2" fill="none" stroke="var(--accent)" strokeWidth="1" />
              )}
            </g>
          );
        }))}

        <line x1={0} x2={W} y1={BASE + 4} y2={BASE + 4} stroke="var(--line-2)" />
        <line x1={0} x2={W} y1={BASE + 4} y2={BASE + 4} stroke="var(--accent)" strokeWidth="1.5" opacity="0.7"
          className={`flow-line ${congested ? "slow" : ""}`} />

        {showFocus && (
          <g pointerEvents="none">
            <line x1={focus.x} x2={focus.x} y1={BASE - cy(focus.cycle) - 6} y2={46} stroke="var(--text-2)" strokeDasharray="2 3" />
            <text x={focus.x + (focus.x > W - 160 ? -8 : 8)} y={50} textAnchor={focus.x > W - 160 ? "end" : "start"}
              fill="var(--text)" style={{ font: "600 12px var(--sans)" }}>
              {focus.code} · {focus.cycle}s
            </text>
          </g>
        )}
      </svg>

      <div className="row gap-16 wrap small muted" style={{ marginTop: 14 }}>
        <span className="row gap-8"><span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid var(--accent)" }} />Circle under a bar: not fully sensed (inferred or manual checks)</span>
      </div>

      <AnimatePresence>
        {tip && (
          <motion.div className="tip" role="tooltip"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            style={{ left: `clamp(0px, calc(${((tip.x + 4) / (W + 8)) * 100}% - 100px), calc(100% - 210px))`, top: 36 }}>
            <div className="row gap-8"><span className="mono" style={{ fontWeight: 500 }}>{tip.code}</span><span className="muted">{lines.find((l) => l.id === tip.line)?.name}</span></div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{tip.name}</div>
            <dl>
              <dt>Cycle</dt><dd style={{ color: cycleTone(tip.cycle, target) === "ok" ? undefined : toneColor(cycleTone(tip.cycle, target)) }}>{tip.cycle}s</dd>
              <dt>Status</dt><dd>{STATUS_WORD[tip.status]}</dd>
              <dt>Sensing</dt><dd>{SENSING_WORD[tip.sensing]} · {tip.coverage}%</dd>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
