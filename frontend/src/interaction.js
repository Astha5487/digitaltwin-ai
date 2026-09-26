/**
 * Pointer interaction layer.
 *
 * One delegated listener, throttled to animation frames, that only writes the
 * cursor position into CSS custom properties (--mx / --my) on [data-spot]
 * cards. The stylesheet turns that into a very faint light that follows the
 * cursor. Mouse and pen only; touch and reduced motion get the static card.
 */
export function installPointerLayer() {
  if (typeof window === "undefined" || window.__dtPointer) return;
  window.__dtPointer = true;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let last = null;

  const apply = () => {
    frame = 0;
    const e = last;
    if (!e || reduce.matches) return;
    const el = e.target instanceof Element ? e.target.closest("[data-spot]") : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    last = e;
    if (!frame) frame = requestAnimationFrame(apply);
  }, { passive: true });
}
