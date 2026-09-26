// Everything that talks to the backend lives here.
const base = "https://digitaltwin-ai-backend.onrender.com/api";

// The signed-in session token. Protected endpoints check it server-side, so
// what a role can see is enforced by the backend, not just hidden in the UI.
let token = null;
let onUnauthorized = null;
export const setToken = (t) => { token = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

const headers = (json = true) => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function parse(res) {
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail ?? msg; } catch {}
    if (res.status === 401 && token) onUnauthorized?.();
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.json();
}

const call = (path, opts = {}) => fetch(base + path, { headers: headers(), ...opts }).then(parse);
const get = (p) => call(p);
const post = (p, b) => call(p, { method: "POST", body: JSON.stringify(b ?? {}) });
const patch = (p, b) => call(p, { method: "PATCH", body: JSON.stringify(b ?? {}) });
const del = (p) => call(p, { method: "DELETE" });

export const api = {
  snapshot: () => get("/snapshot"),
  sources: () => get("/sources"),
  evidence: () => get("/evidence"),
  collect: (id) => post(`/evidence/${id}`),
  causes: () => get("/causes"),
  scenarios: () => get("/scenarios"),
  decide: (scenario_id, verdict) => post("/decision", { scenario_id, verdict }),
  outcome: () => get("/outcome"),
  feedback: (correct) => post("/feedback", { correct }),

  // ------------------------------------------------------------ access
  login: (username, password) => post("/login", { username, password }),
  roles: () => get("/roles"),
  access: () => get("/access"),
  setAccess: (role, feature, on) => post("/access", { role, feature, on }),

  // ------------------------------------------------ role-gated summaries
  performance: () => get("/performance"),
  plants: () => get("/plants"),

  // ------------------------------------------------------------ documents
  documents: () => get("/documents"),
  uploadDocument: (category, file, uploadedBy) => {
    const form = new FormData();
    form.append("category", category);
    form.append("uploaded_by", uploadedBy ?? "Unknown");
    form.append("file", file);
    return fetch(base + "/documents", { method: "POST", body: form, headers: headers(false) }).then(parse);
  },
  editDocument: (id, body) => patch(`/documents/${id}`, body),
  deleteDocument: (id) => del(`/documents/${id}`),
  documentFileUrl: (id) => `${base}/documents/${id}/file`,

  // ---------------------------------------------------------------- agent
  agentChat: (message, history) => post("/agent/chat", { message, history }),
};

/** Live snapshot stream. Reconnects on its own so a backend restart is survivable. */
export function connect(onData, onStatus) {
  let ws = null, dead = false, timer = null;
  const open = () => {
    if (dead) return;
    const wsHost = "digitaltwin-ai-backend.onrender.com";
    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${wsProto}//${wsHost}/ws`);
    ws.onopen = () => onStatus?.("live");
    ws.onmessage = (e) => onData(JSON.parse(e.data));
    ws.onclose = () => { onStatus?.("down"); if (!dead) timer = setTimeout(open, 1500); };
    ws.onerror = () => ws.close();
  };
  open();
  return () => { dead = true; clearTimeout(timer); ws?.close(); };
}

export const clock = (s) => {
  const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
