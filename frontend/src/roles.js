/**
 * What each role sees, and in what order.
 *
 * The backend decides what a role is *allowed* to use (see /api/access).
 * This file only decides what is *relevant* to show each role, and how the
 * scroll is arranged. A section with a `feature` is shown locked until the
 * backend says that feature is allowed.
 */

export const SECTIONS = {
  overview:    { label: "Overview",           icon: "home" },
  search:      { label: "Search stations",    icon: "search" },
  lines:       { label: "Lines",              icon: "activity" },
  plant:       { label: "3D plant",           icon: "cube" },
  investigate: { label: "Investigate",        icon: "scan" },
  cause:       { label: "Root cause",         icon: "branch" },
  decide:      { label: "Decide",             icon: "check" },
  outcome:     { label: "Outcome",            icon: "trend" },
  performance: { label: "Plant performance",  icon: "chart",    feature: "performance" },
  portfolio:   { label: "Portfolio",          icon: "globe",    feature: "portfolio" },
  data:        { label: "Data",               icon: "database" },
  assistant:   { label: "Assistant",          icon: "sparkle" },
  access:      { label: "Access control",     icon: "shield",   feature: "access" },
};

/** Per role: groups of sections, top to bottom. Locked sections sit last. */
const LAYOUT = {
  floor_manager: [
    ["Live", ["overview", "search", "lines", "plant"]],
    ["Incident", ["investigate", "cause", "decide", "outcome"]],
    ["Workspace", ["data", "assistant"]],
    ["Restricted", ["performance", "portfolio", "access"]],
  ],
  factory_manager: [
    ["Live", ["overview", "search", "lines", "plant"]],
    ["Incident", ["investigate", "cause", "decide", "outcome"]],
    ["Plant", ["performance", "data"]],
    ["Workspace", ["assistant", "access"]],
    ["Restricted", ["portfolio"]],
  ],
  leadership: [
    ["Live", ["overview", "search", "plant"]],
    ["Business", ["portfolio", "performance", "outcome"]],
    ["Workspace", ["data", "assistant", "access"]],
  ],
};

export function layoutFor(role, access) {
  const groups = LAYOUT[role] ?? LAYOUT.floor_manager;
  return groups.map(([group, ids]) => ({
    group,
    items: ids.map((id) => {
      const s = SECTIONS[id];
      const f = s.feature ? access?.features?.[s.feature] : null;
      return { id, ...s, locked: !!f && !f.allowed, minRole: f?.min_role, grantable: f?.grantable ?? true };
    }),
  }));
}

export const allowed = (access, feature) => !!access?.features?.[feature]?.allowed;
