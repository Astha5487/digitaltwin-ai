import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export const EASE = [0.2, 0.8, 0.2, 1];

/* ------------------------------------------------------------------ tones
 * One place for every threshold, so a value reads the same colour wherever
 * it appears. Defect-risk bands match the backend's station status bands.
 */
export const RISK = { crit: 55, warn: 22 };
export const BOTTLENECK = { crit: 60, warn: 35 };
/** Above this bottleneck risk the conveyor visibly slows, in 2D and 3D alike. */
export const CONGESTED = 45;
export const riskTone = (v, b = RISK) => (v > b.crit ? "crit" : v > b.warn ? "warn" : "ok");
export const cycleTone = (cycle, target) => (cycle > target * 1.12 ? "crit" : cycle > target * 1.03 ? "warn" : "ok");
export const statusTone = (s) => (s === "critical" ? "crit" : s === "warning" ? "warn" : "ok");
export const STATUS_WORD = { healthy: "Healthy", warning: "Watch", critical: "At risk" };
export const SENSING_WORD = { full: "Measured", shadow: "Inferred", manual: "Manual checks" };
export const toneColor = (t) => (t === "crit" ? "var(--crit)" : t === "warn" ? "var(--warn)" : t === "ok" ? "var(--ok)"
  : t === "accent" ? "var(--accent)" : "var(--text)");
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
export const lineName = (snap, id) => snap.lines.find((l) => l.id === id)?.name ?? id;

/** Scroll smoothly to a section by id. */
export const goTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/* ------------------------------------------------------------------ Num
 * Numbers glide to their new value instead of snapping.
 */
export function Num({ value, decimals, duration = 520 }) {
  const reduce = useReducedMotion();
  const target = typeof value === "number" ? value : parseFloat(value);
  const numeric = Number.isFinite(target) && String(value).trim() === String(target);
  const dp = decimals ?? (numeric ? (String(value).split(".")[1]?.length ?? 0) : 0);
  const [shown, setShown] = useState(numeric ? target : 0);
  const from = useRef(numeric ? target : 0);

  useEffect(() => {
    if (!numeric) return;
    if (reduce) { setShown(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = a + (target - a) * (1 - Math.pow(1 - t, 3));
      setShown(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, numeric, reduce, duration]);

  if (!numeric) return <>{value}</>;
  return <>{shown.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}</>;
}

/* ------------------------------------------------------------------ icons */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.2-4.2",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  cube: "M12 2.8 20 7v10l-8 4.2L4 17V7zm0 0v18.4M4 7l8 4.2L20 7",
  scan: "M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3m5-4a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  branch: "M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm12-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 0c0 4.5-6 4-12 7.5",
  check: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-4-9 2.7 2.7L16 9.5",
  trend: "M3 17l6-6 4 4 8-8m0 0h-6m6 0v6",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H3",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-9-9h18M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3z",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6zm-3 9 2 2 4-4",
  lock: "M6 11h12v10H6zm2 0V8a4 4 0 1 1 8 0v3",
  unlock: "M6 11h12v10H6zm2 0V8a4 4 0 0 1 7.7-1.5",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  arrowUp: "M12 19V5m-6 6 6-6 6 6",
  chevron: "M9 6l6 6-6 6",
  collapse: "M15 6l-6 6 6 6M20 4v16",
  expand: "M9 6l6 6-6 6M4 4v16",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  logout: "M15 17l5-5-5-5m5 5H9m3 9H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7",
  tick: "M5 12.5 10 17 19 7",
  cross: "M7 7l10 10M17 7 7 17",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  wrench: "M14.5 5.5a4 4 0 0 0 5 5L12 18a2.1 2.1 0 0 1-3-3zM6 21l3-3",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
  upload: "M12 16V4m-5 5 5-5 5 5M4 20h16",
  download: "M12 4v12m-5-5 5 5 5-5M4 20h16",
  edit: "M14.5 4.5l5 5L9 20H4v-5z",
  trash: "M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5v-5m0-3v-.01",
  send: "M4 12 20 4l-6 16-3-7z",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
};

export function Icon({ name, size, style, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden style={style} className={className}>
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

/* ------------------------------------------------------------------ atoms */
export const Dot = ({ tone = "", pulse = false }) => <span className={`dot ${tone} ${pulse ? "pulse" : ""}`} aria-hidden />;

export const Pill = ({ tone = "", icon, children, ...rest }) => (
  <span className={`pill ${tone}`} {...rest}>{icon && <Icon name={icon} />}{children}</span>
);

export const StatusPill = ({ status }) => (
  <Pill tone={status === "healthy" ? "" : statusTone(status)}>
    <Dot tone={statusTone(status)} />{STATUS_WORD[status] ?? status}
  </Pill>
);

export const Bar = ({ value, tone, mark, markLabel, thick }) => (
  <div className={`bar ${thick ? "thick" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={Math.round(value)}>
    <motion.i style={{ background: tone ? toneColor(tone) : "var(--text)" }}
      initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      transition={{ duration: 0.6, ease: EASE }} />
    {mark != null && <span className="mark" style={{ left: `${mark}%` }} data-l={markLabel} />}
  </div>
);

/** Section heading: small accent eyebrow, a clear title, one line of context. */
export function SectionHead({ eyebrow, title, children, right }) {
  return (
    <header className="sec-head">
      <div style={{ minWidth: 0, flex: "1 1 420px" }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 className="sec-title">{title}</h2>
        {children && <p className="sec-desc">{children}</p>}
      </div>
      {right && <div className="row gap-12 wrap">{right}</div>}
    </header>
  );
}

/** A quiet placeholder for "nothing here yet" and "waiting" moments. */
export function State({ icon = "info", title, children, action, center }) {
  return (
    <div className={`state ${center ? "center" : ""}`} role="status">
      <div className="state-icon"><Icon name={icon} /></div>
      {title && <div className="state-title">{title}</div>}
      {children && <div className="state-body">{children}</div>}
      {action}
    </div>
  );
}

/** Shown in place of a section the signed-in role is not allowed to use. */
export function Locked({ minRole, what, grantable = true }) {
  const grantors = minRole === "Leadership" ? "Leadership" : `a ${minRole} or Leadership`;
  if (!grantable) {
    return (
      <div className="locked-card" role="note">
        <div className="state-icon"><Icon name="lock" /></div>
        <div style={{ minWidth: 0 }}>
          <div className="state-title">Restricted to {minRole}{minRole === "Leadership" ? "" : " and above"}</div>
          <p className="state-body" style={{ marginTop: 6 }}>{what} stays with {minRole === "Leadership" ? "Leadership" : `${minRole}s and Leadership`}. It can't be granted to other roles.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="locked-card" role="note">
      <div className="state-icon"><Icon name="lock" /></div>
      <div style={{ minWidth: 0 }}>
        <div className="state-title">Restricted to {minRole}{minRole === "Leadership" ? "" : " and above"}</div>
        <p className="state-body" style={{ marginTop: 6 }}>
          {what ? `${what} is` : "This is"} managed at a higher level. Access can only be granted by {grantors}.
        </p>
      </div>
    </div>
  );
}

/** A single headline number. */
export function Metric({ label, value, unit, sub, tone, decimals, size = "", children, spot = true }) {
  return (
    <div className="card metric-card" data-spot={spot ? "" : undefined}>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${size}`} style={tone && tone !== "ok" ? { color: toneColor(tone) } : undefined}>
        <Num value={value} decimals={decimals} />{unit && <span className="metric-unit">{unit}</span>}
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
      {children}
    </div>
  );
}

/** Minimal trend line with an optional target. */
export function Spark({ data, target, tone, height = 36 }) {
  if (!data || data.length < 2) return <div className="spark" style={{ height: height + 20 }} />;
  const W = 200, H = height;
  const lo = Math.min(...data, target ?? Infinity), hi = Math.max(...data, target ?? -Infinity);
  const span = hi - lo || 1;
  const px = (i) => (i / (data.length - 1)) * W;
  const py = (v) => H - 3 - ((v - lo) / span) * (H - 6);
  const d = data.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join("");
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, overflow: "visible" }} aria-hidden>
        {target != null && <line className="target" x1="0" x2={W} y1={py(target)} y2={py(target)} />}
        <path className="series" d={d} />
        <circle cx={W} cy={py(data[data.length - 1])} r="3" fill={toneColor(tone ?? "accent")} />
      </svg>
    </div>
  );
}

/** Recent events from the live twin. */
export function Events({ events, clock, limit }) {
  const list = limit ? events.slice(0, limit) : events;
  if (!list.length) return <p className="muted small">No activity yet. Events appear here as the twin notices them.</p>;
  const tone = { alert: "crit", warn: "warn", good: "ok" };
  return (
    <ul className="events" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {list.map((e, i) => (
        <li key={`${e.t}-${i}-${e.text}`} className={`event ${e.kind}`}>
          <time>{clock(e.t)}</time><Dot tone={tone[e.kind] ?? ""} /><p>{e.text}</p>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ incident progress
 * Derived from the live snapshot, so it always tells the truth about where
 * the investigation is. The same steps are used everywhere.
 */
export function incidentSteps(snap) {
  const phase = snap.sim.phase;
  const open = !["calm", "rising"].includes(phase);
  const ready = open && snap.ready;
  const decided = open && !!snap.decision;
  const reviewed = decided && snap.feedback != null;
  const code = snap.focus_station?.code ?? snap.focus;
  const taken = snap.evidence_taken?.length ?? 0;
  return [
    { id: "detect", name: "Detect",
      state: phase === "calm" ? "active" : phase === "rising" ? "waiting" : "done",
      out: phase === "calm" ? "All stations normal" : phase === "rising" ? `Drift at ${code}` : `Flagged ${code}` },
    { id: "investigate", name: "Investigate",
      state: !open ? "idle" : ready ? "done" : "waiting",
      out: !open ? "Standing by" : `${plural(taken, "check")} · ${snap.confidence}%` },
    { id: "cause", name: "Root cause",
      state: ready ? "done" : "idle", out: ready ? "Causes ranked" : `Needs ${snap.threshold}% confidence` },
    { id: "decide", name: "Decide",
      state: !ready ? "idle" : decided ? "done" : "waiting",
      out: !ready ? "Standing by" : decided ? (snap.decision.verdict === "approved" ? "Approved" : "Rejected") : "Awaiting a person" },
    { id: "learn", name: "Learn",
      state: !decided ? "idle" : reviewed ? "done" : phase === "acting" ? "active" : "waiting",
      out: !decided ? "Standing by" : reviewed ? "Recorded" : phase === "acting" ? "Observing result" : "Awaiting review" },
  ];
}

export function Steps({ snap }) {
  const steps = incidentSteps(snap);
  return (
    <ol className="steps" aria-label="Incident progress" style={{ listStyle: "none", padding: 0 }}>
      {steps.map((s, i) => (
        <li key={s.id} className="step" data-state={s.state} aria-current={s.state === "waiting" || s.state === "active" ? "step" : undefined}>
          <div className="s-n">{s.state === "done" ? <Icon name="tick" size={13} /> : <span>0{i + 1}</span>}
            {s.state === "waiting" ? "Needs attention" : s.state === "active" ? "In progress" : s.state === "done" ? "Done" : ""}</div>
          <div className="s-name">{s.name}</div>
          <div className="s-out" title={s.out}>{s.out}</div>
        </li>
      ))}
    </ol>
  );
}

/** What the incident needs next, used by Overview and the incident sections. */
export function nextAction(snap) {
  const phase = snap.sim.phase;
  const fs = snap.focus_station;
  const code = fs?.code;
  if (phase === "calm") {
    const watch = snap.lines.flatMap((l) => l.stations).filter((s) => s.status !== "healthy").map((s) => s.code);
    return watch.length
      ? { tone: "warn", title: "No open incidents",
          body: `${watch.length === 1 ? `${watch[0]} is` : `${watch.slice(0, -1).join(", ")} and ${watch[watch.length - 1]} are`} running a little slow and being watched. The twin opens an investigation on its own if anything drifts further.`,
          cta: ["See the stations", "search"] }
      : { tone: "ok", title: "All stations running normally",
          body: `The twin is watching all ${snap.totals.stations} stations and will open an investigation on its own if anything drifts.` };
  }
  if (phase === "rising") return { tone: "warn", title: `Drift building at ${code} · ${fs?.name}`,
    body: "Cycle time is creeping up. The twin is tracking it and will flag it if it keeps rising.", cta: ["Watch it in 3D", "plant"] };
  if (phase === "alert" && !snap.ready) return { tone: "crit", title: `${code} needs investigating`,
    body: `The deviation is clear, but ${code} has only ${fs?.coverage}% sensor coverage. Collect evidence before the twin names a cause.`,
    cta: ["Investigate", "investigate"] };
  if (phase === "alert" && !snap.decision) return { tone: "crit", title: `${code} is waiting for a decision`,
    body: "The likely cause is identified and the options are rehearsed. A person makes the call.", cta: ["Decide", "decide"] };
  if (phase === "acting") return { tone: "accent", title: `Applying the decision at ${code}`,
    body: "The twin is watching the station settle before calling it done.", cta: ["Follow the outcome", "outcome"] };
  return { tone: "ok", title: `${code} has settled`,
    body: snap.feedback == null ? "Review how the prediction compared with what actually happened." : "The result has been reviewed and recorded.",
    cta: ["Review the outcome", "outcome"] };
}
