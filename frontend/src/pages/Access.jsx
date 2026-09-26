import React, { useState } from "react";
import { api } from "../api.js";
import { Icon, Pill, SectionHead } from "../components/bits.jsx";

/**
 * Grant or remove access for roles below yours. The backend decides which
 * switches are yours to flip; anything else is shown but can't be changed.
 */
export default function Access({ auth, access, onChange }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const flip = async (role, feature, on) => {
    setBusy(`${role}:${feature}`); setErr(null);
    try { onChange(await api.setAccess(role, feature, on)); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  const rows = access.manage ?? [];

  return (
    <>
      <SectionHead eyebrow="Administration" title="Access control">
        As {auth.roleName}, you can open restricted areas to the roles below you. Only features you hold yourself can be granted.
      </SectionHead>

      {err && <p className="small t-crit" role="alert" style={{ marginBottom: 16 }}>{err}</p>}

      <div className="stack gap-24">
        {rows.map((r) => (
          <div key={r.role} className="card bare">
            <div className="card-head pad" style={{ marginBottom: 4 }}>
              <div>
                <div className="card-title">{r.name}</div>
                <div className="card-sub">What a {r.name} can use</div>
              </div>
            </div>
            <div className="list">
              {r.features.map((f) => {
                const id = `${r.role}:${f.id}`;
                const status = f.by_role ? "Included with the role" : f.on ? "Granted" : "Restricted";
                return (
                  <div key={f.id} className="list-row pad">
                    <div className="flex-1">
                      <div className="row-title">{f.name}</div>
                      <div className="row-sub">
                        {f.by_role ? "Part of this role by default."
                          : f.editable ? (f.on ? "Granted by a higher authority. You can remove it." : "You can grant this.")
                            : f.id === "access" ? "Can't be granted. Access control stays with Factory Managers and Leadership."
                              : "Only Leadership can grant this."}
                      </div>
                    </div>
                    <Pill tone={f.on ? (f.by_role ? "" : "accent") : ""} icon={f.on ? undefined : "lock"}>{status}</Pill>
                    {f.editable ? (
                      <button className="switch" role="switch" aria-checked={f.on} disabled={busy === id}
                        aria-label={`${f.on ? "Remove" : "Grant"} ${f.name.toLowerCase()} for ${r.name}`}
                        onClick={() => flip(r.role, f.id, !f.on)} />
                    ) : (
                      <span style={{ width: 42, display: "grid", placeItems: "center", color: "var(--text-3)" }} aria-hidden>
                        <Icon name={f.by_role ? "tick" : "lock"} size={16} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
