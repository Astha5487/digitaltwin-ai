import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  EASE, Icon, SENSING_WORD, STATUS_WORD, SectionHead, StatusPill, cycleTone, toneColor,
} from "../components/bits.jsx";

const SUGGEST = ["Door welding", "Roof", "Paint", "Glass", "Brakes", "Inspection"];
const SEVERITY = { critical: 0, warning: 1, healthy: 2 };

/** Every searchable word for a station, weighted by how specific it is. */
function fields(s, line) {
  return [
    [s.code.toLowerCase(), 10],
    [s.name.toLowerCase(), 6],
    [s.process.toLowerCase(), 4],
    [s.parts.join(" ").toLowerCase(), 4],
    [line.toLowerCase(), 2],
    [`${STATUS_WORD[s.status]} ${SENSING_WORD[s.sensing]}`.toLowerCase(), 1],
  ];
}

function score(station, line, tokens) {
  const f = fields(station, line);
  let total = 0, matched = 0;
  for (const t of tokens) {
    let best = 0;
    for (const [text, w] of f) {
      if (text === t) best = Math.max(best, w * 2);
      else if (text.split(/[\s/-]+/).some((word) => word.startsWith(t))) best = Math.max(best, w * 1.5);
      else if (text.includes(t)) best = Math.max(best, w);
    }
    if (best) matched += 1;
    total += best;
  }
  return { total, all: matched === tokens.length };
}

function Hi({ text, tokens }) {
  if (!tokens.length) return text;
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

/** Find any station by code, name, process, part or line. */
export default function Search({ snap, canView3D, onShow }) {
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);

  const stations = useMemo(() => snap.lines.flatMap((l) => l.stations.map((s) => ({ ...s, lineName: l.name }))), [snap.lines]);

  const { results, exact } = useMemo(() => {
    if (!tokens.length) {
      return { results: stations.filter((s) => s.status !== "healthy").sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]), exact: true };
    }
    const scored = stations.map((s) => ({ s, ...score(s, s.lineName, tokens) })).filter((r) => r.total > 0);
    const strict = scored.filter((r) => r.all);
    const pool = strict.length ? strict : scored;
    pool.sort((a, b) => b.total - a.total || SEVERITY[a.s.status] - SEVERITY[b.s.status]);
    return { results: pool.map((r) => r.s), exact: !!strict.length };
  }, [stations, q]);

  const shown = more ? results : results.slice(0, 8);

  return (
    <>
      <SectionHead eyebrow="Find a station" title="Search stations">
        Search by station name or code, process, body part, component or line.
      </SectionHead>

      <div className="search-box">
        <Icon name="search" className="lead" />
        <label htmlFor="station-search" className="sr-only">Search stations</label>
        <input id="station-search" className="input" value={q} autoComplete="off" spellCheck={false}
          onChange={(e) => { setQ(e.target.value); setMore(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setQ(""); if (e.key === "Enter" && results[0] && canView3D) onShow(results[0]); }}
          placeholder="Try “door welding”, “roof”, “brake lines” or “S17”" />
        {q && <button className="icon-btn clear" onClick={() => setQ("")} aria-label="Clear search"><Icon name="close" /></button>}
      </div>
      <div className="chips" aria-label="Suggested searches">
        {SUGGEST.map((s) => (
          <button key={s} className={`chip-btn ${q.toLowerCase() === s.toLowerCase() ? "on" : ""}`}
            onClick={() => { setQ(q.toLowerCase() === s.toLowerCase() ? "" : s); setMore(false); }}>{s}</button>
        ))}
      </div>

      <div className="card bare" style={{ marginTop: 32 }}>
        <div className="card-head pad" style={{ marginBottom: 6 }}>
          <div>
            <div className="card-title" aria-live="polite">
              {!tokens.length ? (results.length ? "Needs attention now" : "Every station is healthy")
                : results.length ? `${results.length} ${results.length === 1 ? "station" : "stations"}` : "No stations found"}
            </div>
            <div className="card-sub">
              {!tokens.length ? `Showing stations that aren't healthy, out of ${snap.totals.stations}.`
                : !results.length ? "Try a part (door, roof), a process (welding, painting) or a station code."
                  : exact ? `Matching “${q.trim()}”` : `No exact match for “${q.trim()}”. Showing the closest stations.`}
            </div>
          </div>
        </div>

        <div className="list">
          {shown.map((s, i) => {
            const tone = cycleTone(s.cycle, snap.metrics.target);
            return (
              <motion.div key={s.code} className="list-row pad"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.2), ease: EASE }}>
                <span className="code" style={{ width: 52, textAlign: "center" }}><Hi text={s.code} tokens={tokens} /></span>
                <div className="flex-1">
                  <div className="row-title"><Hi text={s.name} tokens={tokens} /></div>
                  <div className="row-sub">
                    <Hi text={s.lineName} tokens={tokens} /> · <Hi text={s.process} tokens={tokens} /> · <Hi text={s.parts.join(", ")} tokens={tokens} />
                  </div>
                </div>
                <div className="result-meta">
                  <span className="small muted hide-sm">{SENSING_WORD[s.sensing]}</span>
                  <span className="num" style={{ color: tone === "ok" ? undefined : toneColor(tone) }}>{s.cycle}s</span>
                  <StatusPill status={s.status} />
                  {canView3D && (
                    <button className="btn secondary sm" onClick={() => onShow(s)} aria-label={`Show ${s.code} in 3D`}>
                      <Icon name="cube" /><span className="hide-sm">View in 3D</span>
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
        {results.length > 8 && (
          <div style={{ padding: "12px 28px 20px" }}>
            <button className="btn ghost sm" onClick={() => setMore((v) => !v)}>
              {more ? "Show fewer" : `Show all ${results.length}`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
