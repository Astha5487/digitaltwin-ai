import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { api, clock, connect, setToken, setUnauthorizedHandler } from "./api.js";
import { layoutFor } from "./roles.js";
import { Dot, Icon, Locked, SectionHead, goTo } from "./components/bits.jsx";

import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Search from "./pages/Search.jsx";
import Lines from "./pages/Lines.jsx";
import Plant from "./pages/Overview.jsx";
import Investigate from "./pages/Inference.jsx";
import Cause from "./pages/Reason.jsx";
import Decide from "./pages/Rehearse.jsx";
import Outcome from "./pages/Learn.jsx";
import Performance from "./pages/Performance.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import Data from "./pages/Data.jsx";
import Assistant from "./pages/Assistant.jsx";
import Access from "./pages/Access.jsx";

const SHIFT_NAME = { A: "Morning shift", B: "Afternoon shift", C: "Night shift" };

const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default function App() {
  const [auth, setAuth] = useState(() => {
    const a = read("dt-auth", null);
    if (a?.token) setToken(a.token);
    return a?.token ? a : null;       // sessions from before role access existed must sign in again
  });
  const [snap, setSnap] = useState(null);
  const [link, setLink] = useState("…");
  const [access, setAccess] = useState(null);
  const [collapsed, setCollapsed] = useState(() => read("dt-collapsed", false));
  const [drawer, setDrawer] = useState(false);
  const [active, setActive] = useState("overview");
  const [preview, setPreview] = useState(null);       // 3D flow preview while comparing options
  const [focusReq, setFocusReq] = useState(null);     // "show this station in 3D"

  const logout = useCallback(() => {
    setAuth(null); setAccess(null); setToken(null); write("dt-auth", null);
  }, []);
  useEffect(() => setUnauthorizedHandler(logout), [logout]);
  useEffect(() => connect(setSnap, setLink), []);
  useEffect(() => write("dt-collapsed", collapsed), [collapsed]);

  // What this role may use comes from the backend, and is re-checked so a
  // grant or a revoke by someone with more authority shows up on its own.
  const refreshAccess = useCallback(() => { api.access().then(setAccess).catch(() => {}); }, []);
  useEffect(() => {
    if (!auth) return;
    refreshAccess();
    const id = setInterval(refreshAccess, 5000);
    return () => clearInterval(id);
  }, [auth, refreshAccess]);

  const layout = useMemo(() => (auth && access ? layoutFor(auth.role, access) : []), [auth, access]);
  const flat = useMemo(() => layout.flatMap((g) => g.items), [layout]);

  // Highlight whichever section is on screen.
  useEffect(() => {
    if (!flat.length) return;
    const els = flat.map((s) => document.getElementById(s.id)).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    els.forEach((el) => io.observe(el));
    // The last sections can't scroll up to the trigger line, so the page end counts too.
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) setActive(flat[flat.length - 1].id);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, [flat, !!snap]);

  // "/" jumps to station search from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      openSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openSearch = () => {
    goTo("search");
    setTimeout(() => document.getElementById("station-search")?.focus({ preventScroll: true }), 450);
  };
  const nav = (id) => { setDrawer(false); goTo(id); };
  const showInPlant = (station) => { setFocusReq({ ...station, at: Date.now() }); goTo("plant"); };

  const login = (r) => {
    setToken(r.token);
    setAuth(r);
    write("dt-auth", r);
    window.scrollTo(0, 0);
  };

  if (!auth) return <MotionConfig reducedMotion="user"><Login onLogin={login} /></MotionConfig>;

  if (!snap || !access) {
    const down = link === "down";
    return (
      <main className="boot">
        <div className="boot-card">
          <div className="row gap-12"><span className="logo"><i /></span><span className="wordmark">DIGITALTWIN<em>.AI</em></span></div>
          <div className="row gap-12" role="status" style={{ marginTop: 16 }}>
            <Dot tone={down ? "crit" : "accent"} pulse />
            <span style={{ fontWeight: 600 }}>{down ? "Can't reach the twin" : "Connecting to the line…"}</span>
          </div>
          <p className="muted small">
            {down ? "The backend isn't responding on port 8000. This page reconnects by itself." : `Signed in as ${auth.displayName}.`}
          </p>
          {down && <button className="btn ghost sm" onClick={logout}>Sign out</button>}
        </div>
      </main>
    );
  }

  const ctx = { snap, auth, access, allowed: (f) => !!access.features?.[f]?.allowed };
  const current = flat.find((s) => s.id === active) ?? flat[0];
  const alerts = snap.totals.alerts;

  const render = (s) => {
    if (s.locked) {
      return (
        <>
          <SectionHead eyebrow={<><Icon name="lock" size={14} />Restricted</>} title={s.label} />
          <Locked minRole={s.minRole} what={s.label} grantable={s.grantable} />
        </>
      );
    }
    switch (s.id) {
      case "overview": return <Home {...ctx} layout={flat} />;
      case "search": return <Search {...ctx} canView3D={flat.some((x) => x.id === "plant")} onShow={showInPlant} />;
      case "lines": return <Lines {...ctx} />;
      case "plant": return <Plant {...ctx} preview={preview} focusReq={focusReq} canInvestigate={flat.some((x) => x.id === "investigate")} />;
      case "investigate": return <Investigate {...ctx} />;
      case "cause": return <Cause {...ctx} />;
      case "decide": return <Decide {...ctx} setPreview={setPreview} />;
      case "outcome": return <Outcome {...ctx} />;
      case "performance": return <Performance {...ctx} />;
      case "portfolio": return <Portfolio {...ctx} />;
      case "data": return <Data {...ctx} />;
      case "assistant": return <Assistant {...ctx} />;
      case "access": return <Access {...ctx} onChange={setAccess} />;
      default: return null;
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <a href="#main" className="skip-link">Skip to content</a>
      <div className={`app ${collapsed ? "collapsed" : ""} ${drawer ? "drawer" : ""}`}>
        <div className="scrim" onClick={() => setDrawer(false)} aria-hidden />

        {/* ------------------------------------------------------------ sidebar */}
        <nav className="sidebar" aria-label="Sections">
          <div className="sb-brand">
            <span className="logo"><i /></span>
            <span className="wordmark">DIGITALTWIN<em>.AI</em></span>
          </div>

          <div className="sb-nav">
            {layout.map((g) => (
              <React.Fragment key={g.group}>
                <div className="sb-group">
                  <span>{g.group === "Restricted" && g.items.every((i) => !i.locked) ? "Granted to you" : g.group}</span>
                </div>
                {g.items.map((s) => {
                  const badge = s.id === "overview" && alerts > 0 ? alerts : null;
                  const critical = snap.lines.some((l) => l.status === "critical");
                  return (
                    <button key={s.id}
                      className={`sb-item ${active === s.id ? "on" : ""} ${s.locked ? "locked" : ""} ${badge ? "has-alert" : ""}`}
                      onClick={() => nav(s.id)} aria-current={active === s.id ? "location" : undefined}
                      title={collapsed ? `${s.label}${s.locked ? " (restricted)" : ""}` : undefined}>
                      <Icon name={s.icon} />
                      <span className="sb-label">{s.label}</span>
                      {s.locked && <Icon name="lock" className="sb-lock" />}
                      {badge && <span className={`sb-badge ${critical ? "" : "warn"}`} aria-label={`${badge} active alerts`}>{badge}</span>}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          <div className="sb-foot">
            <div className="who">
              <div className="avatar" aria-hidden>{auth.displayName?.[0] ?? "?"}</div>
              <div style={{ minWidth: 0 }}>
                <div className="who-name">{auth.displayName}</div>
                <div className="who-role">{auth.roleName}</div>
              </div>
            </div>
            <button className="sb-item" onClick={logout} title={collapsed ? "Sign out" : undefined}>
              <Icon name="logout" /><span className="sb-label">Sign out</span>
            </button>
            <button className="sb-item sb-collapse" onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : undefined}>
              <Icon name={collapsed ? "expand" : "collapse"} /><span className="sb-label">Collapse</span>
            </button>
          </div>
        </nav>

        {/* ------------------------------------------------------------ main */}
        <div className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Open navigation">
              <Icon name="menu" />
            </button>
            <div className="top-title">{current?.label}<span> · Plant A, Pune</span></div>
            <div className="top-right">
              <span className="live-pill" title={SHIFT_NAME[snap.clock.shift]}>
                <Dot tone={link === "down" ? "crit" : "ok"} pulse={link !== "down"} />
                <span className="hide-sm">{link === "down" ? "Reconnecting" : "Live"} ·</span>
                <span className="hide-sm">Shift {snap.clock.shift}</span>
                <b>{clock(snap.clock.seconds)}</b>
              </span>
              <button className="search-trigger" onClick={openSearch} aria-label="Search stations">
                <Icon name="search" /><span className="hide-sm">Search stations</span><span className="kbd">/</span>
              </button>
            </div>
          </header>

          <AnimatePresence>
            {link === "down" && (
              <motion.div className="conn-banner" role="alert"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <Dot tone="crit" pulse /> Connection lost. Showing the last known state while we reconnect.
              </motion.div>
            )}
          </AnimatePresence>

          <main id="main">
            {flat.map((s) => (
              <section key={s.id} id={s.id} className={`section ${s.locked ? "compact" : ""}`} aria-label={s.label}>
                <div className="content">{render(s)}</div>
              </section>
            ))}
          </main>

          <footer className="footer">
            <div className="content">Powered by <b>NVIDIA NeMo</b></div>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
}
