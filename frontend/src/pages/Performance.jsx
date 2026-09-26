import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Bar, Metric, SectionHead, State, StatusPill, cycleTone, plural, toneColor } from "../components/bits.jsx";

const signed = (n, unit = "%") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}${unit}`;

/** How the plant is doing this week. Factory Manager and above. */
export default function Performance({ snap }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.performance().then(setP).catch((e) => setErr(e.message)); }, []);

  const watch = snap.lines.flatMap((l) => l.stations.map((s) => ({ ...s, lineName: l.name })))
    .filter((s) => s.status !== "healthy")
    .sort((a, b) => (a.status === b.status ? b.cycle - a.cycle : a.status === "critical" ? -1 : 1));
  const target = snap.metrics.target;

  return (
    <>
      <SectionHead eyebrow="Plant A · This week" title="Plant performance">
        Output, downtime and quality for the week, with the lines and stations that need attention.
      </SectionHead>

      {err ? <State icon="lock" title="Not available">{err}</State> : (
        <div className="flow">
          <Metric label="Weekly output" value={p?.weekly_output ?? "—"} unit="units"
            sub={p ? `${signed(p.weekly_output_change_pct)} week on week` : " "} />
          <Metric label="Downtime" value={p?.downtime_min ?? "—"} unit="min"
            sub={p ? `${signed(p.downtime_change_pct)} vs 12-month baseline` : " "} />
          <Metric label="Defects per 100 vehicles" value={p?.defects_per_100 ?? "—"}
            sub={p ? `Down from ${p.defects_per_100_before} before the twin` : " "} />
          <Metric label="Sensor coverage" value={snap.totals.coverage} unit="%"
            sub={`${plural(snap.totals.alerts, "live alert")} across ${snap.totals.stations} stations`} />
        </div>
      )}

      <div className="flow wide" style={{ marginTop: 20 }}>
        <div className="card bare" style={{ flexGrow: 1.3 }}>
          <div className="card-head pad" style={{ marginBottom: 4 }}>
            <div><div className="card-title">Lines</div><div className="card-sub">Live status and sensor coverage</div></div>
          </div>
          <div className="list">
            {snap.lines.map((l) => (
              <div key={l.id} className="list-row pad">
                <div className="flex-1">
                  <div className="row-title">{l.name}</div>
                  <div className="row-sub">{plural(l.count, "station")} · {l.alerts ? plural(l.alerts, "alert") : "no alerts"}</div>
                </div>
                <div style={{ width: 140 }} className="hide-sm-block">
                  <div className="spread small"><span className="muted">Coverage</span><span>{l.coverage}%</span></div>
                  <div style={{ marginTop: 6 }}><Bar value={l.coverage} /></div>
                </div>
                <div style={{ width: 92, display: "flex", justifyContent: "flex-end" }}><StatusPill status={l.status} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card bare">
          <div className="card-head pad" style={{ marginBottom: 4 }}>
            <div><div className="card-title">Stations to watch</div><div className="card-sub">Anything not running as expected right now</div></div>
          </div>
          {watch.length === 0 ? <p className="muted" style={{ padding: "8px 28px 28px" }}>Nothing flagged right now.</p> : (
            <div className="list">
              {watch.slice(0, 6).map((s) => (
                <div key={s.code} className="list-row pad">
                  <span className="code">{s.code}</span>
                  <div className="flex-1">
                    <div className="row-title">{s.name}</div>
                    <div className="row-sub">{s.lineName}</div>
                  </div>
                  <span className="num" style={{ fontWeight: 600, color: cycleTone(s.cycle, target) === "ok" ? undefined : toneColor(cycleTone(s.cycle, target)) }}>{s.cycle}s</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
