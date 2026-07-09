// Reusable D3.js equity curve chart.
//
// Renders cumulative Net PNL over time (equity curve) using D3 only —
// no Recharts / CanvasJS. Pure SVG + D3 scales/shapes, driven by React
// state/refs. Fully self-contained: pass it Net PNL analytics data
// (date + pnl per trade/day) and it derives the cumulative equity curve,
// draws it responsively, and re-renders on resize via ResizeObserver.
//
// Usage:
//   <EquityCurveChart data={[{ date: "2026-01-01", pnl: 120 }, ...]} />
//
// No zoom / pan / brush — intentionally a static, glanceable chart in the
// TradeZella style: clean grid, gradient-filled line, hover tooltip.
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

export interface EquityCurvePoint {
  /** ISO date string, e.g. "2026-01-31" */
  date: string;
  /** Net PNL delta for this point (not cumulative) */
  pnl: number;
}

export interface EquityCurveChartProps {
  /** Net PNL analytics data — one entry per trade/day. Cumulative equity is derived internally. */
  data: EquityCurvePoint[];
  /** Starting equity balance the curve accumulates on top of. Default: 0. */
  startingBalance?: number;
  /**
   * Fallback height in px, used only until the container reports its own
   * height via ResizeObserver (e.g. on first paint, or if the container has
   * no intrinsic height of its own). Default: 280.
   */
  height?: number;
  /** Optional className applied to the outer wrapper. */
  className?: string;
}

interface CumulativePoint {
  date: Date;
  raw: string;
  pnl: number;
  equity: number;
}

const MARGIN = { top: 16, right: 16, bottom: 28, left: 56 };

/**
 * Reusable D3-only equity curve chart.
 * Green above the starting balance, red below it, with a smooth animated
 * draw-in, grid lines, responsive sizing, dark-mode aware colors, and a
 * hover tooltip. No zoom, pan, or brush interactions.
 */
export function EquityCurveChart({
  data,
  startingBalance = 0,
  height = 280,
  className,
}: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height });

  const [tooltip, setTooltip] = useState<{
    x: number; y: number; point: CumulativePoint;
  } | null>(null);

  const { width, height: measuredHeight } = size;

  // ── Derive cumulative equity curve from raw Net PNL points ──────────────
  const points: CumulativePoint[] = useMemo(() => {
    let equity = startingBalance;
    return [...data]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map(d => {
        equity += d.pnl;
        return { date: new Date(d.date), raw: d.date, pnl: d.pnl, equity };
      });
  }, [data, startingBalance]);

  // ── Responsive width + height via ResizeObserver ─────────────────────────
  // Tracks the container's actual box so the chart fills whatever space the
  // parent gives it. If the container reports zero height (no intrinsic
  // height of its own), the `height` prop is kept as a fallback.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({
        width: rect.width,
        height: rect.height > 0 ? rect.height : height,
      });
    });
    observer.observe(el);
    setSize({
      width: el.clientWidth,
      height: el.clientHeight > 0 ? el.clientHeight : height,
    });

    return () => observer.disconnect();
  }, [height]);

  // ── Draw / redraw chart whenever data or size changes ───────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width <= 0 || measuredHeight <= 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
    const innerH = Math.max(measuredHeight - MARGIN.top - MARGIN.bottom, 10);

    svg.attr("width", width).attr("height", measuredHeight);

    const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    if (points.length === 0) {
      g.append("text")
        .attr("x", innerW / 2)
        .attr("y", innerH / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "hsl(var(--muted-foreground))")
        .attr("font-size", 12)
        .text("No trade data yet");
      return;
    }

    // ── Colors — dark-mode compatible via CSS variables resolved at draw time ──
    const rootStyles      = getComputedStyle(document.documentElement);
    const gridColor       = "rgba(128,128,128,0.14)";
    const axisColor       = rootStyles.getPropertyValue("--muted-foreground") ? "hsl(var(--muted-foreground))" : "#8a8f98";
    const greenColor      = "#22c55e";
    const redColor        = "#ef4444";
    const baselineColor   = "rgba(128,128,128,0.35)";

    // ── Scales ──────────────────────────────────────────────────────────────
    const x = d3.scaleTime()
      .domain(d3.extent(points, p => p.date) as [Date, Date])
      .range([0, innerW]);

    const [minEq, maxEq] = d3.extent(points, p => p.equity) as [number, number];
    const yPad = Math.max((maxEq - minEq) * 0.12, 1);
    const y = d3.scaleLinear()
      .domain([Math.min(minEq - yPad, startingBalance), Math.max(maxEq + yPad, startingBalance)])
      .range([innerH, 0])
      .nice();

    // ── Grid lines ────────────────────────────────────────────────────────
    g.append("g")
      .attr("class", "grid-y")
      .selectAll("line")
      .data(y.ticks(5))
      .join("line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", d => y(d)).attr("y2", d => y(d))
      .attr("stroke", gridColor)
      .attr("stroke-width", 1);

    g.append("g")
      .attr("class", "grid-x")
      .selectAll("line")
      .data(x.ticks(Math.min(6, points.length)))
      .join("line")
      .attr("y1", 0).attr("y2", innerH)
      .attr("x1", d => x(d)).attr("x2", d => x(d))
      .attr("stroke", gridColor)
      .attr("stroke-width", 1);

    // ── Baseline (starting balance) ──────────────────────────────────────
    g.append("line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", y(startingBalance)).attr("y2", y(startingBalance))
      .attr("stroke", baselineColor)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3");

    // ── Axes ──────────────────────────────────────────────────────────────
    const xAxis = d3.axisBottom<Date>(x)
      .ticks(Math.min(6, points.length))
      .tickFormat(d3.timeFormat("%b %d") as any)
      .tickSize(0);

    const yAxis = d3.axisLeft<number>(y)
      .ticks(5)
      .tickFormat(d => `$${d3.format(",.0f")(d as number)}`)
      .tickSize(0);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(xAxis)
      .call(sel => sel.select(".domain").remove())
      .selectAll("text")
      .attr("fill", axisColor)
      .attr("font-size", 10);

    g.append("g")
      .call(yAxis)
      .call(sel => sel.select(".domain").remove())
      .selectAll("text")
      .attr("fill", axisColor)
      .attr("font-size", 10);

    // ── Split coloring: green above baseline, red below ──────────────────
    const clipAboveId = `equity-clip-above-${Math.random().toString(36).slice(2)}`;
    const clipBelowId = `equity-clip-below-${Math.random().toString(36).slice(2)}`;

    svg.append("defs").append("clipPath")
      .attr("id", clipAboveId)
      .append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", innerW).attr("height", y(startingBalance));

    svg.select("defs").append("clipPath")
      .attr("id", clipBelowId)
      .append("rect")
      .attr("x", 0).attr("y", y(startingBalance))
      .attr("width", innerW).attr("height", Math.max(innerH - y(startingBalance), 0));

    // ── Gradient fills ────────────────────────────────────────────────────
    const defs = svg.select("defs");
    const gradGreen = defs.append("linearGradient")
      .attr("id", `equity-fill-green-${clipAboveId}`)
      .attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
    gradGreen.append("stop").attr("offset", "0%").attr("stop-color", greenColor).attr("stop-opacity", 0.28);
    gradGreen.append("stop").attr("offset", "100%").attr("stop-color", greenColor).attr("stop-opacity", 0.02);

    const gradRed = defs.append("linearGradient")
      .attr("id", `equity-fill-red-${clipBelowId}`)
      .attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
    gradRed.append("stop").attr("offset", "0%").attr("stop-color", redColor).attr("stop-opacity", 0.02);
    gradRed.append("stop").attr("offset", "100%").attr("stop-color", redColor).attr("stop-opacity", 0.28);

    const lineGen = d3.line<CumulativePoint>()
      .x(d => x(d.date))
      .y(d => y(d.equity))
      .curve(d3.curveMonotoneX);

    const areaGen = d3.area<CumulativePoint>()
      .x(d => x(d.date))
      .y0(y(startingBalance))
      .y1(d => y(d.equity))
      .curve(d3.curveMonotoneX);

    // Areas (clipped to above/below baseline)
    g.append("path")
      .datum(points)
      .attr("clip-path", `url(#${clipAboveId})`)
      .attr("fill", `url(#equity-fill-green-${clipAboveId})`)
      .attr("d", areaGen as any);

    g.append("path")
      .datum(points)
      .attr("clip-path", `url(#${clipBelowId})`)
      .attr("fill", `url(#equity-fill-red-${clipBelowId})`)
      .attr("d", areaGen as any);

    // Lines (clipped to above/below baseline, colored accordingly)
    const linePathAbove = g.append("path")
      .datum(points)
      .attr("clip-path", `url(#${clipAboveId})`)
      .attr("fill", "none")
      .attr("stroke", greenColor)
      .attr("stroke-width", 2)
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round")
      .attr("d", lineGen as any);

    const linePathBelow = g.append("path")
      .datum(points)
      .attr("clip-path", `url(#${clipBelowId})`)
      .attr("fill", "none")
      .attr("stroke", redColor)
      .attr("stroke-width", 2)
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round")
      .attr("d", lineGen as any);

    // ── Smooth draw-in animation for both line segments ──────────────────
    for (const path of [linePathAbove, linePathBelow]) {
      const node = path.node();
      if (!node) continue;
      const totalLength = node.getTotalLength();
      path
        .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
        .attr("stroke-dashoffset", totalLength)
        .transition()
        .duration(900)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
    }

    // ── Hover tooltip + crosshair ─────────────────────────────────────────
    const focusLine = g.append("line")
      .attr("y1", 0).attr("y2", innerH)
      .attr("stroke", axisColor)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .style("opacity", 0);

    const focusDot = g.append("circle")
      .attr("r", 4)
      .attr("stroke", "hsl(var(--background))")
      .attr("stroke-width", 2)
      .style("opacity", 0);

    const bisectDate = d3.bisector<CumulativePoint, Date>(d => d.date).left;

    const overlay = g.append("rect")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .style("cursor", "crosshair");

    overlay
      .on("mousemove", (event: MouseEvent) => {
        const [mx] = d3.pointer(event);
        const x0 = x.invert(mx);
        let i = bisectDate(points, x0, 1);
        const a = points[i - 1];
        const b = points[i];
        const p = !b ? a : !a ? b : (x0.getTime() - a.date.getTime() > b.date.getTime() - x0.getTime() ? b : a);
        if (!p) return;

        const px = x(p.date);
        const py = y(p.equity);
        const isPositive = p.equity >= startingBalance;

        focusLine.attr("x1", px).attr("x2", px).style("opacity", 1);
        focusDot
          .attr("cx", px).attr("cy", py)
          .attr("fill", isPositive ? greenColor : redColor)
          .style("opacity", 1);

        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({
          x: MARGIN.left + px,
          y: MARGIN.top + py,
          point: p,
        });
        void rect;
      })
      .on("mouseleave", () => {
        focusLine.style("opacity", 0);
        focusDot.style("opacity", 0);
        setTooltip(null);
      });
  }, [points, width, measuredHeight, startingBalance]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className ?? ""}`} style={{ minHeight: height }}>
      <svg ref={svgRef} className="block" />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-[11px] shadow-lg"
          style={{
            left: Math.min(Math.max(tooltip.x, 60), width - 60),
            top: Math.max(tooltip.y - 64, 0),
            transform: "translateX(-50%)",
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--popover-foreground))",
          }}
        >
          <div className="font-semibold text-[10px] text-muted-foreground mb-0.5">
            {tooltip.point.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div
            className="font-bold tabular-nums"
            style={{ color: tooltip.point.equity >= startingBalance ? "#22c55e" : "#ef4444" }}
          >
            ${tooltip.point.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-muted-foreground tabular-nums">
            {tooltip.point.pnl >= 0 ? "+" : ""}
            ${tooltip.point.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on this day
          </div>
        </div>
      )}
    </div>
  );
}

export default EquityCurveChart;
