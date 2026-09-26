import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../api.js";
import { EASE, Icon, Pill, SectionHead } from "../components/bits.jsx";

const SUGGESTIONS = [
  "Which station needs attention and why?",
  "What evidence should I collect next?",
  "Summarise the likely causes.",
  "Compare the options and recommend one.",
];

// What the assistant looked at, in plain words.
const USED = {
  get_snapshot: "Live status",
  get_evidence_options: "Evidence options",
  collect_evidence: "Collected evidence",
  get_causes: "Root causes",
  get_scenarios: "Options",
  make_decision: "Recorded a decision",
  get_outcome: "Outcome",
  list_documents: "Plant documents",
};

const stamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Assistant({ snap }) {
  const [messages, setMessages] = useState([{
    role: "assistant", ts: stamp(),
    content: "Hi. I can read the twin's live state and, if you ask, collect evidence or record a decision. What would you like to know?",
  }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setError(null);
    setInput("");
    const next = [...messages, { role: "user", content, ts: stamp() }];
    setMessages(next);
    setBusy(true);
    try {
      const history = next.map((m) => ({ role: m.role, content: m.content }));
      const res = await api.agentChat(content, history);
      setMessages((cur) => [...cur, { role: "assistant", content: res.reply, trace: res.trace, ts: stamp() }]);
    } catch (e) {
      setError(e.status === 503
        ? "The assistant isn't set up yet. Add an API key to the backend's .env file and restart it."
        : e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      inputRef.current?.focus({ preventScroll: true });
    }
  }

  const fs = snap.focus_station;

  return (
    <>
      <SectionHead eyebrow="Assistant" title="Ask the twin">
        Ask about the line in plain language. It works from the same live data as everything on this page.
      </SectionHead>

      <div className="card bare chat">
        <div className="transcript" aria-live="polite" ref={logRef}>
          {messages.map((m, i) => (
            <motion.div key={i} className={`msg ${m.role}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}>
              <div className="bubble">{m.content}</div>
              {!!m.trace?.length && (
                <div className="used" aria-label="Data used">
                  {[...new Set(m.trace.map((t) => USED[t.tool] ?? "Twin data"))].map((u) => <Pill key={u}>{u}</Pill>)}
                </div>
              )}
              <div className="meta">{m.role === "user" ? "You" : "Assistant"} · {m.ts}</div>
            </motion.div>
          ))}
          <AnimatePresence>
            {busy && (
              <motion.div className="msg assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
                <div className="bubble typing" aria-label="Thinking"><i /><i /><i /></div>
              </motion.div>
            )}
          </AnimatePresence>
          {messages.length === 1 && !busy && (
            <div className="chips" style={{ marginTop: 4 }}>
              {SUGGESTIONS.map((s) => <button key={s} className="chip-btn" onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
        </div>

        {error && <div className="conn-banner" role="alert" style={{ borderBottom: 0, borderTop: "1px solid rgba(255,107,107,.25)" }}>{error}</div>}

        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="assistant-q" className="sr-only">Message the assistant</label>
          <input id="assistant-q" ref={inputRef} className="input" value={input} autoComplete="off"
            onChange={(e) => setInput(e.target.value)} disabled={busy}
            placeholder={fs ? `Ask about ${fs.code}, a line, or what to do next…` : "Ask the twin…"} />
          <button className="btn primary" type="submit" disabled={busy || !input.trim()} aria-label="Send"><Icon name="send" /><span>Send</span></button>
        </form>
      </div>
    </>
  );
}
