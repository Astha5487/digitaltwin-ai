import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createFactory } from "../three/factory.js";
import {
  CONGESTED, Dot, EASE, Icon, SENSING_WORD, SectionHead, StatusPill, cycleTone, goTo, riskTone, statusTone, toneColor,
} from "../components/bits.jsx";

/**
 * The live 3D plant you can drill into:
 *   plant   -> every line, all clickable
 *   line    -> every station in that line, in a strip and on the floor
 *   station -> a detail card beside the model
 */
export default function Plant({ snap, preview, focusReq, canInvestigate }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const stripRef = useRef(null);
  const tipRef = useRef(null);
  const [factory, setFactory] = useState(null);
  const [lineId, setLineId] = useState(null);
  const [picked, setPicked] = useState(null);
  const [hover, setHover] = useState(null);

  const lines = snap.lines;
  const line = lines.find((l) => l.id === lineId) ?? null;
  const station = lines.flatMap((l) => l.stations).find((s) => s.code === picked) ?? null;

  // Build the scene the first time the section comes into view; tear it down on unmount.
  useEffect(() => {
    const stage = stageRef.current;
    let f = null;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !f) {
        try { f = createFactory(canvasRef.current); setFactory(f); } catch (err) { console.error("3D view failed to start:", err); }
      }
    }, { rootMargin: "200px" });
    io.observe(stage);
    return () => { io.disconnect(); f?.dispose(); setFactory(null); };
  }, []);

  // Push live state into the scene.
  useEffect(() => {
    if (!factory) return;
    factory.applyState({ lines, focus: picked ?? snap.focus, flow: preview ?? (snap.metrics.bottleneck_risk > CONGESTED ? 0.35 : 1) });
  }, [factory, snap, preview, picked]);

  const openLine = (id) => {
    setLineId(id);
    setPicked(null);
    factory?.setShadow(false);
    factory?.highlight(null);
    factory?.setMode(id ? "line" : "plant", id);
  };

  const openStation = (code, lid) => {
    const s = lines.flatMap((l) => l.stations).find((x) => x.code === code);
    if (!s) return;
    setLineId(lid ?? s.line);
    setPicked(code);
    factory?.highlight(code);
    factory?.setShadow(s.sensing === "shadow", code);
    factory?.setMode("focus", lid ?? s.line);
  };

  const closeStation = () => {
    setPicked(null);
    factory?.setShadow(false);
    factory?.highlight(null);
    factory?.setMode("line", lineId);
  };

  // Clicks in the 3D scene.
  useEffect(() => {
    if (!factory) return;
    factory.onZone((id) => openLine(id));
    factory.onStation((hit) => openStation(hit.code, hit.zone));
  }, [factory, lines]);

  // "View in 3D" from search.
  useEffect(() => {
    if (focusReq) openStation(focusReq.code, focusReq.line);
  }, [focusReq?.at, factory]);

  // Hover readout follows the cursor.
  useEffect(() => {
    if (!factory) return;
    factory.onHover(setHover);
    const onMove = (e) => { if (tipRef.current) tipRef.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`; };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { factory.onHover(null); window.removeEventListener("pointermove", onMove); };
  }, [factory]);
  const hovered = hover && hover.code !== picked
    ? lines.find((l) => l.id === hover.zone)?.stations.find((x) => x.code === hover.code) : null;

  useEffect(() => {
    if (!picked || !stripRef.current) return;
    const el = stripRef.current.querySelector(`[data-code="${picked}"]`);
    if (el) stripRef.current.scrollTo({ left: el.offsetLeft - stripRef.current.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [picked, lineId]);

  const isFocus = station && station.code === snap.focus;
  const target = snap.metrics.target;

  return (
    <>
      <SectionHead eyebrow="Plant view" title="The floor in 3D">
        Click a line to zoom in, then pick any station. Lamps show live status; rings mark stations the twin can only infer.
      </SectionHead>

      <div className={`stage ${station ? "has-detail" : ""}`} ref={stageRef}>
        <canvas ref={canvasRef} aria-label="3D model of the plant" />

        <div className="stage-top">
          <div className="seg" role="tablist" aria-label="Lines">
            <button role="tab" aria-selected={!lineId} className={!lineId ? "on" : ""} onClick={() => openLine(null)}>All lines</button>
            {lines.map((l) => (
              <button key={l.id} role="tab" aria-selected={l.id === lineId} className={l.id === lineId ? "on" : ""} onClick={() => openLine(l.id)}>
                {l.alerts > 0 && <Dot tone={statusTone(l.status)} />}{l.name}
              </button>
            ))}
          </div>
        </div>

        {!factory && (
          <div className="stage-hint" role="status" style={{ bottom: "50%" }}>Loading the plant model…</div>
        )}
        {factory && !lineId && <div className="stage-hint">Click any line to zoom in</div>}

        <AnimatePresence>
          {station && (
            <motion.aside key={station.code} className="stage-detail glass" aria-label={`Station ${station.code}`}
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.25, ease: EASE }}>
              <div className="spread" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row gap-8"><span className="code">{station.code}</span><span className="small muted">{lines.find((l) => l.id === station.line)?.name}</span></div>
                  <div style={{ fontSize: 20, fontWeight: 600, marginTop: 10, letterSpacing: "-0.02em" }}>{station.name}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>{station.process}</div>
                </div>
                <button className="icon-btn" onClick={closeStation} aria-label="Close station detail"><Icon name="close" /></button>
              </div>

              <div className="row gap-24" style={{ marginTop: 18, alignItems: "flex-end" }}>
                <div>
                  <div className="label">Cycle time</div>
                  <div className="metric-value sm" style={{ color: cycleTone(station.cycle, target) === "ok" ? undefined : toneColor(cycleTone(station.cycle, target)) }}>
                    {station.cycle}<span className="metric-unit">s</span>
                  </div>
                </div>
                {isFocus && snap.sim.phase !== "calm" && (
                  <div>
                    <div className="label">Defect risk</div>
                    <div className="metric-value sm" style={{ color: riskTone(snap.metrics.defect_risk) === "ok" ? undefined : toneColor(riskTone(snap.metrics.defect_risk)) }}>
                      {snap.metrics.defect_risk}<span className="metric-unit">%</span>
                    </div>
                  </div>
                )}
              </div>

              <dl className="kv" style={{ marginTop: 18 }}>
                <dt>Status</dt><dd><StatusPill status={station.status} /></dd>
                <dt>Target</dt><dd>{target}s</dd>
                <dt>Sensing</dt><dd>{SENSING_WORD[station.sensing]} · {station.coverage}%</dd>
                <dt>Parts</dt><dd>{station.parts.join(", ")}</dd>
              </dl>

              {station.sensing !== "full" && (
                <p className="small muted" style={{ marginTop: 16, lineHeight: 1.55 }}>
                  {station.sensing === "shadow"
                    ? `Only ${station.coverage}% instrumented. Health is estimated from cameras, neighbouring stations and past behaviour.`
                    : "No live feed. The twin relies on operator entries and the stations either side."}
                </p>
              )}

              {isFocus && snap.sim.phase === "alert" && canInvestigate && (
                <button className="btn primary wide" style={{ marginTop: 18 }} onClick={() => goTo(snap.ready ? "decide" : "investigate")}>
                  {snap.ready ? "Decide" : "Investigate"} <Icon name="arrow" />
                </button>
              )}
            </motion.aside>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {line && (
            <motion.div key="strip" className="stage-strip glass"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.3, ease: EASE }}>
              <div className="spread" style={{ marginBottom: 10, padding: "0 2px" }}>
                <span className="small" style={{ fontWeight: 600 }}>{line.name} · {line.count} stations</span>
                <span className="small muted">{line.alerts ? `${line.alerts} need attention` : "All healthy"}</span>
              </div>
              <div className="strip" ref={stripRef}>
                {line.stations.map((s) => (
                  <button key={s.code} data-code={s.code} className={`strip-cell ${picked === s.code ? "on" : ""}`}
                    onClick={() => openStation(s.code, line.id)} aria-pressed={picked === s.code}
                    aria-label={`${s.code}, ${s.name}, ${s.cycle} seconds, ${s.status}`}>
                    <div className="sc-top"><span>{s.code}</span><Dot tone={s.status === "healthy" ? "" : statusTone(s.status)} /></div>
                    <div className="sc-name">{s.name}</div>
                    <div className="sc-cyc" style={{ color: cycleTone(s.cycle, target) === "ok" ? undefined : toneColor(cycleTone(s.cycle, target)) }}>{s.cycle}s</div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div ref={tipRef} className="twin-tip" aria-hidden style={{ opacity: hovered ? 1 : 0 }}>
        {hovered && (
          <>
            <div className="row gap-8"><span className="mono">{hovered.code}</span><span className="muted">{lines.find((l) => l.id === hover.zone)?.name}</span></div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{hovered.name}</div>
            <div className="t-row"><span>Cycle</span><span>{hovered.cycle}s</span></div>
            <div className="t-row"><span>Sensing</span><span>{SENSING_WORD[hovered.sensing]}</span></div>
          </>
        )}
      </div>
    </>
  );
}
