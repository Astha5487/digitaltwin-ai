import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../api.js";
import { Bar, EASE, Icon, Pill, SectionHead } from "../components/bits.jsx";

const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
const fmtWhen = (ts) => new Date(ts * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Where the twin's picture comes from, and the plant's document library. */
export default function Data({ snap, auth, access, allowed }) {
  const [sources, setSources] = useState(null);
  const [note, setNote] = useState("");
  const [docs, setDocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [docErr, setDocErr] = useState(null);
  const canManage = allowed("data_manage");

  useEffect(() => { api.sources().then((r) => { setSources(r.sources); setNote(r.note); }).catch(() => {}); }, []);
  const refresh = () => api.documents()
    .then((r) => { setDocs(r.documents); setCategories(r.categories); setDocErr(null); })
    .catch((e) => setDocErr(e.message));
  useEffect(() => { refresh(); }, []);

  // The sensing mix is counted from the live plant, never hardcoded.
  const all = snap.lines.flatMap((l) => l.stations);
  const mix = [
    ["Measured", all.filter((s) => s.sensing === "full").length, "var(--text)"],
    ["Inferred", all.filter((s) => s.sensing === "shadow").length, "var(--accent)"],
    ["Manual checks", all.filter((s) => s.sensing === "manual").length, "rgba(255,255,255,.22)"],
  ];

  return (
    <>
      <SectionHead eyebrow="Data" title="What the twin can see">
        {note || "The twin only reads plant data. It never writes to equipment."}
      </SectionHead>

      <div className="flow wide">
        <div className="card bare" style={{ flexGrow: 1.3 }}>
          <div className="card-head pad" style={{ marginBottom: 4 }}>
            <div><div className="card-title">Live sources</div><div className="card-sub">Share of stations each source covers</div></div>
            <Pill tone="ok"><span className="dot ok pulse" />Streaming</Pill>
          </div>
          <div className="list">
            {(sources ?? []).map((s) => (
              <div key={s.id} className="list-row pad">
                <div className="flex-1">
                  <div className="row-title">{s.name}</div>
                  <div className="row-sub">{s.detail}{s.status === "periodic" ? " · updated periodically" : ""}</div>
                </div>
                <div style={{ width: 120 }}><Bar value={s.coverage} tone={s.coverage === 100 ? "" : "accent"} /></div>
                <span className="num" style={{ width: 44, textAlign: "right", fontWeight: 600 }}>{s.coverage}%</span>
              </div>
            ))}
            {!sources && <p className="muted" style={{ padding: "8px 28px 24px" }}>Loading sources…</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Sensing mix</div>
          <div className="card-sub">{all.length} stations · {snap.totals.coverage}% sensor coverage overall</div>
          <div className="segbar" style={{ height: 10, marginTop: 24 }} aria-hidden>
            {mix.map(([l, n, c]) => <i key={l} style={{ width: `${(n / all.length) * 100}%`, background: c }} />)}
          </div>
          <dl className="kv" style={{ marginTop: 22 }}>
            {mix.map(([l, n, c]) => (
              <React.Fragment key={l}>
                <dt className="row gap-8"><span className="key"><span className="sw" style={{ background: c }} /></span>{l}</dt>
                <dd>{n} · {Math.round((n / all.length) * 100)}%</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      </div>

      <div className="card bare" style={{ marginTop: 20 }}>
        <div className="card-head pad" style={{ marginBottom: 12 }}>
          <div>
            <div className="card-title">Plant documents</div>
            <div className="card-sub">{docs.length} {docs.length === 1 ? "file" : "files"} · manuals, production, downtime, quality and maintenance records</div>
          </div>
          {!canManage && (
            <Pill icon="lock">Editing restricted to {access.features.data_manage.min_role} and above</Pill>
          )}
        </div>
        {docErr && <p className="small t-crit" style={{ padding: "0 28px 20px" }}>{docErr}</p>}
        <div>
          {categories.map((cat) => (
            <Category key={cat.id} cat={cat} docs={docs.filter((d) => d.category === cat.id)} categories={categories}
              auth={auth} canManage={canManage} refresh={refresh} />
          ))}
        </div>
      </div>
    </>
  );
}

function Category({ cat, docs, categories, auth, canManage, refresh }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);         // { id, name, category }
  const [confirmId, setConfirmId] = useState(null);
  const [err, setErr] = useState(null);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try { await api.uploadDocument(cat.id, file, auth.displayName); await refresh(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const save = async () => {
    try { await api.editDocument(edit.id, { name: edit.name, category: edit.category }); setEdit(null); refresh(); }
    catch (e) { setErr(e.message); }
  };
  const remove = async (id) => {
    try { await api.deleteDocument(id); setConfirmId(null); refresh(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="cat">
      <button className="cat-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="chevron" className="chev" />
        <span className="flex-1" style={{ fontSize: 15, fontWeight: 600 }}>{cat.name}</span>
        <span className="small muted">{docs.length} {docs.length === 1 ? "file" : "files"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }} style={{ overflow: "hidden" }}>
            <div className="cat-body">
              <label className="dropzone">
                <input ref={inputRef} type="file" accept={cat.accept} onChange={(e) => upload(e.target.files?.[0])} />
                <Icon name="upload" />
                <span>{busy ? "Uploading…" : `Upload a file (${cat.accept.replaceAll(",", ", ")})`}</span>
              </label>
              {err && <p className="small t-crit" role="alert" style={{ marginBottom: 8 }}>{err}</p>}
              {docs.length === 0 && <p className="small muted" style={{ padding: "4px 0 8px" }}>No files yet.</p>}
              {docs.map((d) => (
                <div key={d.id} className="doc-row">
                  {edit?.id === d.id ? (
                    <>
                      <input className="input" style={{ height: 38 }} value={edit.name} aria-label="File name"
                        onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
                      <select className="input" style={{ height: 38, width: 190 }} value={edit.category} aria-label="Category"
                        onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button className="btn primary sm" onClick={save}>Save</button>
                      <button className="btn ghost sm" onClick={() => setEdit(null)}>Cancel</button>
                    </>
                  ) : confirmId === d.id ? (
                    <>
                      <span className="flex-1 small">Delete <b>{d.name}</b>? This can't be undone.</span>
                      <button className="btn danger sm" onClick={() => remove(d.id)}>Delete</button>
                      <button className="btn ghost sm" onClick={() => setConfirmId(null)}>Keep</button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="doc-name">{d.name}</div>
                        <div className="doc-meta">{fmtSize(d.size)} · {fmtWhen(d.uploaded_at)} · {d.uploaded_by}</div>
                      </div>
                      <a className="icon-btn" href={api.documentFileUrl(d.id)} target="_blank" rel="noreferrer" aria-label={`Open ${d.name}`} title="Open">
                        <Icon name="download" />
                      </a>
                      {canManage && (
                        <>
                          <button className="icon-btn" onClick={() => setEdit({ id: d.id, name: d.name, category: d.category })} aria-label={`Rename or move ${d.name}`} title="Rename or move"><Icon name="edit" /></button>
                          <button className="icon-btn danger" onClick={() => setConfirmId(d.id)} aria-label={`Delete ${d.name}`} title="Delete"><Icon name="trash" /></button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
