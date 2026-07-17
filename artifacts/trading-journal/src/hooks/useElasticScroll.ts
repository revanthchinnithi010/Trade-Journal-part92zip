import { useEffect, type RefObject } from "react";

/**
 * iOS-style rubber-band / elastic overscroll for any scroll container.
 *
 * Pass React refs — the hook reads `.current` inside its own effect so it
 * correctly picks up the mounted DOM nodes (unlike passing `.current` at
 * call-site, which is always null on first render).
 *
 * GPU-accelerated: only `transform` is mutated — no layout properties.
 * All hot-path work stays in event callbacks (zero React setState).
 */
export function useElasticScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const scrollEl  = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    const MAX_PULL      = 72;    // px — max visible stretch
    const SPRING_MS     = 520;   // release animation duration
    const SPRING_CB     = "cubic-bezier(0.22, 1, 0.36, 1)"; // Apple spring
    const WHEEL_DAMPEN  = 0.35;  // wheel overscroll multiplier
    const WHEEL_SETTLE  = 200;   // ms after last wheel event → spring back

    // ── shared mutable state ──────────────────────────────────────────
    let offset    = 0;
    let dragging  = false;
    let startY    = 0;
    let wheelAccum = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;

    // ── helpers ───────────────────────────────────────────────────────

    /** iOS hyperbolic damping — asymptotically approaches MAX_PULL */
    const damp = (delta: number) =>
      Math.sign(delta) * MAX_PULL * (1 - MAX_PULL / (Math.abs(delta) + MAX_PULL));

    const atTop    = () => scrollEl.scrollTop <= 0;
    const atBottom = () =>
      scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;

    const setOffset = (px: number, animate: boolean) => {
      offset = px;
      contentEl.style.transition = animate
        ? `transform ${SPRING_MS}ms ${SPRING_CB}`
        : "none";
      contentEl.style.willChange = animate && px === 0 ? "auto" : "transform";
      contentEl.style.transform  = `translate3d(0,${px}px,0)`;
    };

    const springBack = () => {
      if (offset === 0) return;
      setOffset(0, true);
      contentEl.addEventListener(
        "transitionend",
        () => {
          contentEl.style.transition = "";
          contentEl.style.willChange = "auto";
          contentEl.style.transform  = "";
        },
        { once: true },
      );
    };

    // ── TOUCH ─────────────────────────────────────────────────────────

    const onTouchStart = (e: TouchEvent) => {
      startY   = e.touches[0].clientY;
      dragging = false;
      contentEl.style.transition = "none";
    };

    const onTouchMove = (e: TouchEvent) => {
      const dy      = e.touches[0].clientY - startY;
      const pullDown = dy > 0 && atTop();
      const pullUp   = dy < 0 && atBottom();

      if (pullDown || pullUp) {
        dragging = true;
        if (Math.abs(dy) > 4) e.preventDefault(); // take over gesture
        setOffset(damp(dy), false);
      } else if (dragging) {
        dragging = false;
        springBack();
      }
    };

    const onTouchEnd = () => {
      if (dragging) { dragging = false; springBack(); }
    };

    // ── WHEEL (trackpad momentum) ─────────────────────────────────────

    const onWheel = (e: WheelEvent) => {
      const pullDown = e.deltaY < 0 && atTop();
      const pullUp   = e.deltaY > 0 && atBottom();

      if (!pullDown && !pullUp) {
        if (offset !== 0) { wheelAccum = 0; springBack(); }
        return;
      }

      wheelAccum -= e.deltaY * WHEEL_DAMPEN;
      // prevent direction flip
      if (pullDown && wheelAccum < 0) wheelAccum = 0;
      if (pullUp   && wheelAccum > 0) wheelAccum = 0;

      setOffset(damp(wheelAccum), false);

      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelAccum = 0; springBack(); }, WHEEL_SETTLE);
    };

    // ── Register ──────────────────────────────────────────────────────

    scrollEl.addEventListener("touchstart",  onTouchStart,  { passive: true });
    scrollEl.addEventListener("touchmove",   onTouchMove,   { passive: false });
    scrollEl.addEventListener("touchend",    onTouchEnd,    { passive: true });
    scrollEl.addEventListener("touchcancel", onTouchEnd,    { passive: true });
    scrollEl.addEventListener("wheel",       onWheel,       { passive: true });

    return () => {
      scrollEl.removeEventListener("touchstart",  onTouchStart);
      scrollEl.removeEventListener("touchmove",   onTouchMove);
      scrollEl.removeEventListener("touchend",    onTouchEnd);
      scrollEl.removeEventListener("touchcancel", onTouchEnd);
      scrollEl.removeEventListener("wheel",       onWheel);
      if (wheelTimer) clearTimeout(wheelTimer);
      contentEl.style.transform  = "";
      contentEl.style.transition = "";
      contentEl.style.willChange = "auto";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // refs are stable — run once after mount
}
