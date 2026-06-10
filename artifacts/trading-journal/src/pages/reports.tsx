import {
  useGetStatsSummary,
  useGetSymbolBreakdown,
  useGetEquityCurve,
  useGetWeeklyPnl,
} from "@workspace/api-client-react";
import { useCurrencyFormatter, useCurrencyAxisFormatter } from "@/store/currencyStore";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, Legend, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target, Percent, Zap, Award,
  BarChart2, Activity, Layers, Flame, ArrowUpRight, ArrowDownRight,
  Shield, Clock,
} from "lucide-react";
import { useMemo } from "react";
import { PROVIDER_MAP } from "@/data/sampleData";

const GREEN  = "hsl(145 58% 52%)";
const RED    = "hsl(0 68% 58%)";
const PURPLE = "hsl(161 72% 42%)";
const BLUE   = "hsl(210 80% 62%)";
const ORANGE = "hsl(32 85% 58%)";
const MUTED  = "hsl(128 8% 38%)";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid rgba(57, 91, 67, 0.3)",
  borderRadius: "12px",
  boxShadow: "0 12px 40px rgba(7, 17, 13, 0.65)",
  fontSize: "12px",
  padding: "8px 12px",
};

// ── Provider badge ────────────────────────────────────────────────────────────
function ProviderBadge({ symbol }: { symbol: string }) {
  const provider = PROVIDER_MAP[symbol];
  if (!provider) return null;
  return provider === "Delta Exchange" ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/15 text-primary border border-primary/20">
      Δ Delta
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">
      ⊕ Finnhub
    </span>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, icon: Icon, color = "text-white", iconBg = "bg-primary/15", iconColor = "text-primary", bar,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  color?: string; iconBg?: string; iconColor?: string; bar?: number;
}) {
  return (
    <div className="glass-card p-5 h-full relative overflow-hidden group transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
        <div className={`p-1.5 rounded-lg ${iconBg} border border-white/[0.06]`}>
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
      </div>
      <div className={`text-2xl font-black tracking-tight mb-1 ${color}`}>{value}</div>
      {bar !== undefined && (
        <div className="my-2 h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-700"
            style={{ width: `${Math.min(bar, 100)}%` }}
          />
        </div>
      )}
      {sub && <p className="text-[11px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

// ── RR Histogram ──────────────────────────────────────────────────────────────
function RRHistogram({ symbolStats }: { symbolStats: Array<{ symbol: string; winRate: number; trades: number; pnl: number }> }) {
  const bins = [
    { label: "0–1R",  count: 0, color: RED },
    { label: "1–2R",  count: 0, color: ORANGE },
    { label: "2–3R",  count: 0, color: PURPLE },
    { label: "3–4R",  count: 0, color: GREEN },
    { label: "4R+",   count: 0, color: BLUE },
  ];
  symbolStats.forEach(s => {
    const rr = s.winRate / 25;
    if (rr < 1) bins[0].count += s.trades;
    else if (rr < 2) bins[1].count += s.trades;
    else if (rr < 3) bins[2].count += s.trades;
    else if (rr < 4) bins[3].count += s.trades;
    else bins[4].count += s.trades;
  });
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={bins} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="count" radius={[4, 4, 2, 2]} maxBarSize={32}>
          {bins.map((b, i) => <Cell key={i} fill={b.color} fillOpacity={0.85} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Radar Chart ───────────────────────────────────────────────────────────────
function PerformanceRadar({ stats }: { stats: ReturnType<typeof useGetStatsSummary>["data"] }) {
  if (!stats) return null;
  const data = [
    { metric: "Win Rate",      score: Math.min(stats.winRate, 100) },
    { metric: "Profit Factor", score: Math.min(stats.profitFactor * 20, 100) },
    { metric: "Avg RR",        score: Math.min(stats.averageRR * 25, 100) },
    { metric: "Consistency",   score: Math.min((stats.winCount / Math.max(stats.totalTrades, 1)) * 110, 100) },
    { metric: "Risk Mgmt",     score: stats.averageLoss > 0 ? Math.min(100 - (stats.averageLoss / Math.max(stats.averageWin, 1)) * 50, 100) : 70 },
    { metric: "Volume",        score: Math.min(stats.totalTrades * 2.5, 100) },
  ];
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data}>
        <PolarGrid stroke="rgba(255,255,255,0.06)" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: "hsl(220 10% 50%)", fontSize: 10 }} />
        <Radar name="Score" dataKey="score" stroke={PURPLE} fill={PURPLE} fillOpacity={0.18} strokeWidth={2} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} formatter={(v: number) => [`${v.toFixed(0)}%`, "Score"]} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Equity Tooltip ────────────────────────────────────────────────────────────
function EqTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  const fc = useCurrencyFormatter();
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle} className="border border-white/[0.08]">
      <p className="text-muted-foreground text-[10px] mb-1">{label ? new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</p>
      <p className="font-bold text-sm text-white">{fc(payload[0].value)}</p>
    </div>
  );
}

// ── Weekly PNL Tooltip ────────────────────────────────────────────────────────
function WkTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  const fc = useCurrencyFormatter();
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div style={tooltipStyle} className="border border-white/[0.08]">
      <p className="text-muted-foreground text-[10px] mb-1">Wk of {label}</p>
      <p className={`font-bold text-sm ${v >= 0 ? "text-emerald-400" : "text-red-400"}`}>{v >= 0 ? "+" : ""}{fc(v)}</p>
    </div>
  );
}

// ── Session Data (simulated) ──────────────────────────────────────────────────
const SESSIONS = [
  { session: "Asia",   trades: 6,  winRate: 66.7, pnl: 1240 },
  { session: "London", trades: 14, winRate: 85.7, pnl: 6850 },
  { session: "NY AM",  trades: 12, winRate: 83.3, pnl: 5420 },
  { session: "NY PM",  trades: 6,  winRate: 66.7, pnl: 1655 },
];

export default function Reports() {
  const { data: stats }       = useGetStatsSummary();
  const { data: symbolStats } = useGetSymbolBreakdown();
  const { data: equity }      = useGetEquityCurve();
  const { data: weeklyPnl }   = useGetWeeklyPnl();

  const weeklyLabels = useMemo(() =>
    (weeklyPnl ?? []).map(w => ({
      ...w,
      label: new Date(w.week).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    })),
  [weeklyPnl]);

  const winLossData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Wins",     value: stats.winCount,       color: GREEN },
      { name: "Losses",   value: stats.lossCount,      color: RED },
      { name: "Breakeven",value: stats.breakevenCount, color: MUTED },
    ].filter(d => d.value > 0);
  }, [stats]);

  // Broker performance from symbol stats
  const brokerPerf = useMemo(() => {
    if (!symbolStats) return [];
    const map: Record<string, { pnl: number; trades: number; wins: number }> = {
      "Delta Exchange": { pnl: 0, trades: 0, wins: 0 },
      "FusionMarkets":  { pnl: 0, trades: 0, wins: 0 },
      "Finnhub Feed":   { pnl: 0, trades: 0, wins: 0 },
    };
    symbolStats.forEach(s => {
      const provider = PROVIDER_MAP[s.symbol];
      const key = provider === "Delta Exchange" ? "Delta Exchange" : "FusionMarkets";
      if (map[key]) {
        map[key].pnl    += s.pnl;
        map[key].trades += s.trades;
        map[key].wins   += Math.round(s.trades * s.winRate / 100);
      }
    });
    return Object.entries(map)
      .filter(([, v]) => v.trades > 0)
      .map(([name, v]) => ({
        name,
        pnl: Math.round(v.pnl * 100) / 100,
        trades: v.trades,
        winRate: v.trades > 0 ? Math.round((v.wins / v.trades) * 100) : 0,
      }));
  }, [symbolStats]);

  const fc            = useCurrencyFormatter();
  const axisFormatter = useCurrencyAxisFormatter();

  if (!stats || !symbolStats) {
    return (
      <div className="space-y-5 pb-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <div key={i} className="h-28 rounded-2xl shimmer-loading" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-64 rounded-2xl shimmer-loading" />)}
        </div>
      </div>
    );
  }
  const expectancy = stats.winRate / 100 * stats.averageWin - (1 - stats.winRate / 100) * stats.averageLoss;
  const kellyCrit  = stats.averageLoss > 0
    ? ((stats.winRate / 100) - (1 - stats.winRate / 100) / (stats.averageWin / stats.averageLoss)) * 100
    : 0;

  const topSymbol = [...(symbolStats ?? [])].sort((a, b) => b.pnl - a.pnl)[0];
  const worstSymbol = [...(symbolStats ?? [])].sort((a, b) => a.pnl - b.pnl)[0];

  return (
    <div className="space-y-5 pb-12">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Performance Reports</h1>
          <p className="text-sm text-muted-foreground/60 mt-0.5">Deep-dive analytics across all brokers and asset classes</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-white/[0.04] rounded-lg px-3 py-1.5 border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live data · {stats.totalTrades} trades
          </span>
        </div>
      </div>

      {/* ── Top-level stat cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Net PNL" value={fc(stats.netPnl)}
          sub="All-time realized" icon={stats.netPnl >= 0 ? TrendingUp : TrendingDown}
          color={stats.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}
          iconBg={stats.netPnl >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}
          iconColor={stats.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <MetricCard
          label="Win Rate" value={`${stats.winRate.toFixed(1)}%`}
          sub={`${stats.winCount}W · ${stats.lossCount}L · ${stats.breakevenCount}BE`}
          icon={Percent} bar={stats.winRate}
          color={stats.winRate >= 60 ? "text-emerald-400" : stats.winRate >= 50 ? "text-white" : "text-red-400"}
        />
        <MetricCard
          label="Profit Factor" value={stats.profitFactor.toFixed(2)}
          sub="Gross wins / gross losses" icon={Shield}
          color={stats.profitFactor >= 2 ? "text-emerald-400" : stats.profitFactor >= 1 ? "text-white" : "text-red-400"}
          iconBg="bg-emerald-500/10" iconColor="text-emerald-400"
        />
        <MetricCard
          label="Avg RR" value={`${stats.averageRR.toFixed(2)}R`}
          sub="Reward / risk ratio" icon={Target}
          color={stats.averageRR >= 2 ? "text-emerald-400" : "text-white"}
        />
        <MetricCard
          label="Avg Win" value={fc(stats.averageWin)}
          sub="Per winning trade" icon={ArrowUpRight}
          color="text-emerald-400" iconBg="bg-emerald-500/10" iconColor="text-emerald-400"
        />
        <MetricCard
          label="Avg Loss" value={fc(stats.averageLoss)}
          sub="Per losing trade" icon={ArrowDownRight}
          color="text-red-400" iconBg="bg-red-500/10" iconColor="text-red-400"
        />
        <MetricCard
          label="Expectancy" value={fc(expectancy)}
          sub="Per trade expected" icon={Zap}
          color={expectancy >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <MetricCard
          label="Kelly %" value={`${kellyCrit.toFixed(1)}%`}
          sub="Optimal position size" icon={Award}
          color="text-primary" iconBg="bg-primary/10" iconColor="text-primary"
        />
      </div>

      {/* ── Equity Curve + Win/Loss donut ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="glass-card">
            <div className="p-5 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-[13px] font-semibold text-white">Equity Curve</span>
              </div>
              {equity && equity.length > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  equity[equity.length - 1].equity >= equity[0].equity
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-red-500/15 text-red-400"
                }`}>
                  {fc(equity[equity.length - 1].equity)}
                </span>
              )}
            </div>
            <div className="h-[220px] px-1 pb-3">
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={equity ?? []} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={PURPLE} stopOpacity={0.28} />
                      <stop offset="60%"  stopColor={PURPLE} stopOpacity={0.04} />
                      <stop offset="100%" stopColor={PURPLE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="transparent" tick={{ fill: "hsl(128 8% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={v => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                  <YAxis stroke="transparent" tick={{ fill: "hsl(128 8% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={axisFormatter} />
                  <Tooltip content={<EqTooltip />} />
                  <Area type="monotone" dataKey="equity" stroke={PURPLE} strokeWidth={2.5} fill="url(#eqGrad)" dot={false}
                    activeDot={{ r: 5, fill: PURPLE, stroke: "hsl(var(--background))", strokeWidth: 2.5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div>
          <div className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Flame className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Win / Loss Split</span>
            </div>
            <div className="h-[170px]">
              <ResponsiveContainer width="100%" height={165}>
                <PieChart>
                  <Pie data={winLossData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {winLossData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} formatter={(v: number, n: string) => [`${v} trades`, n]} />
                  <Legend iconType="circle" iconSize={7} formatter={v => <span style={{ fontSize: 10, color: "hsl(220 10% 55%)" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-around text-center mx-5 mb-5 border-t border-white/[0.06] pt-3">
              <div>
                <p className="text-base font-bold text-emerald-400">{stats.winCount}</p>
                <p className="text-[10px] text-muted-foreground">Wins</p>
              </div>
              <div className="w-px bg-white/[0.06]" />
              <div>
                <p className="text-base font-bold text-red-400">{stats.lossCount}</p>
                <p className="text-[10px] text-muted-foreground">Losses</p>
              </div>
              <div className="w-px bg-white/[0.06]" />
              <div>
                <p className="text-base font-bold text-white">{stats.largestWin > 0 ? fc(stats.largestWin) : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Best</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Weekly PNL + Symbol Bars ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Weekly PNL</span>
            </div>
            <div className="h-[220px] px-1 pb-3">
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={weeklyLabels} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={axisFormatter} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                  <Tooltip content={<WkTooltip />} cursor={{ fill: "rgba(255,255,255,0.025)" }} />
                  <Bar dataKey="pnl" radius={[5, 5, 2, 2]} maxBarSize={28}>
                    {weeklyLabels.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? GREEN : RED} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div>
          <div className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Symbol PNL</span>
            </div>
            <div className="h-[220px] px-1 pb-3">
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={symbolStats} layout="vertical" margin={{ top: 4, right: 16, left: 32, bottom: 4 }}>
                  <XAxis type="number" stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={axisFormatter} />
                  <YAxis type="category" dataKey="symbol" stroke="transparent" tick={{ fill: "hsl(220 10% 55%)", fontSize: 10 }} tickLine={false} axisLine={false} width={52} />
                  <ReferenceLine x={0} stroke="rgba(255,255,255,0.08)" />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    formatter={(v: number) => [fc(v), "PNL"]} />
                  <Bar dataKey="pnl" radius={[0, 4, 4, 0]} maxBarSize={14}>
                    {symbolStats.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? GREEN : RED} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── Performance Radar + RR Dist + Broker Breakdown ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <div className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Performance Score</span>
            </div>
            <div className="h-[220px]">
              <PerformanceRadar stats={stats} />
            </div>
          </div>
        </div>

        <div>
          <div className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Target className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">RR Distribution</span>
            </div>
            <div className="h-[220px] px-1 pb-3">
              <RRHistogram symbolStats={symbolStats} />
            </div>
          </div>
        </div>

        <div>
          <div className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Broker PNL</span>
            </div>
            <div className="h-[220px] px-1 pb-3">
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={brokerPerf} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 9 }} tickLine={false} axisLine={false}
                    tickFormatter={v => v === "Delta Exchange" ? "Delta" : v === "FusionMarkets" ? "Fusion" : v} />
                  <YAxis stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={axisFormatter} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.025)" }}
                    formatter={(v: number, n: string) => [n === "pnl" ? fc(v) : v, n === "pnl" ? "PNL" : n]} />
                  <Bar dataKey="pnl" radius={[5, 5, 2, 2]} maxBarSize={36}>
                    {brokerPerf.map((e, i) => (
                      <Cell key={i} fill={i === 0 ? PURPLE : i === 1 ? BLUE : ORANGE} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── Trading Session Analysis ─────────────────────────────────────────── */}
      <div>
        <div className="glass-card">
          <div className="p-5 pb-3 flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[13px] font-semibold text-white">Trading Session Analysis</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-white/[0.04]">
            {SESSIONS.map(s => (
              <div key={s.session} className="px-5 pb-5">
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">{s.session}</p>
                <p className={`text-lg font-bold mb-0.5 ${s.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fc(s.pnl)}</p>
                <p className="text-[11px] text-white/60">{s.winRate.toFixed(0)}% win · {s.trades} trades</p>
                <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary/50 to-primary transition-all duration-700"
                    style={{ width: `${s.winRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Symbol Details Table ─────────────────────────────────────────────── */}
      <div>
        <div className="glass-card">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Symbol Details</span>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              {topSymbol && (
                <span className="flex items-center gap-1.5 text-foreground/50">
                  <TrendingUp className="w-3 h-3" /> Best: {topSymbol.symbol}
                </span>
              )}
              {worstSymbol && worstSymbol.pnl < 0 && (
                <span className="flex items-center gap-1.5 text-red-400/80">
                  <TrendingDown className="w-3 h-3" /> Worst: {worstSymbol.symbol}
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-white/[0.05] bg-white/[0.015]">
                  {["Symbol", "Provider", "Trades", "Win Rate", "Net PNL", "Avg PNL/Trade"].map(h => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest ${["Trades","Win Rate","Net PNL","Avg PNL/Trade"].includes(h) ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbolStats.map(s => {
                  const avgPnl = s.trades > 0 ? s.pnl / s.trades : 0;
                  return (
                    <tr key={s.symbol} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
                      <td className="px-4 py-3 font-bold text-white text-xs">{s.symbol}</td>
                      <td className="px-4 py-3"><ProviderBadge symbol={s.symbol} /></td>
                      <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground">{s.trades}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1 rounded-full bg-white/[0.06] overflow-hidden hidden sm:block">
                            <div className="h-full rounded-full bg-emerald-400/60" style={{ width: `${s.winRate}%` }} />
                          </div>
                          <span className={`font-mono text-[11px] font-semibold ${s.winRate >= 60 ? "text-emerald-400" : s.winRate >= 50 ? "text-white" : "text-red-400"}`}>
                            {s.winRate.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs font-bold ${s.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fc(s.pnl)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-[11px] ${avgPnl >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                        {fc(avgPnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Best/Worst + Advanced Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Largest Win",  value: fc(stats.largestWin),  color: "text-emerald-400", icon: ArrowUpRight,   iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
          { label: "Largest Loss", value: fc(stats.largestLoss), color: "text-red-400",     icon: ArrowDownRight, iconBg: "bg-red-500/10",     iconColor: "text-red-400" },
          { label: "Current Streak", value: `${Math.abs(stats.currentStreak)}${stats.currentStreak >= 0 ? "W" : "L"}`,
            color: stats.currentStreak >= 0 ? "text-emerald-400" : "text-red-400", icon: Zap, iconBg: "bg-primary/10", iconColor: "text-primary",
            sub: stats.currentStreak >= 0 ? "Winning streak" : "Losing streak" },
          { label: "Total Volume", value: `${stats.totalTrades}`, color: "text-white", icon: Layers, sub: `${stats.winCount + stats.lossCount} decisive` },
        ].map(c => (
          <MetricCard key={c.label} label={c.label} value={c.value} sub={c.sub}
            icon={c.icon} color={c.color} iconBg={c.iconBg} iconColor={c.iconColor} />
        ))}
      </div>

    </div>
  );
}
