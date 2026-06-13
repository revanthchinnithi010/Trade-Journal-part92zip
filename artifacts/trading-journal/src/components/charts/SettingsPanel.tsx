import {
  memo, useRef, useEffect, useState, useCallback,
} from "react";
import { X, ChevronDown } from "lucide-react";
import icoSettingsUrl from "@assets/setting1_1780282162661.svg";
import { ColorPickerGlass } from "@/components/ColorPickerGlass";

import type { ChartSettings } from "@/components/charts/chartSettingsTypes";
import { DEFAULT_CHART_SETTINGS } from "@/components/charts/chartSettingsTypes";

function safeColor(v: unknown, fallback = "#000000"): string {
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

// ── One-at-a-time color picker registry ───────────────────────────────────────
const _colorBoxClosers = new Map<symbol, () => void>();

function _registerColorBoxCloser(id: symbol, fn: () => void) {
  _colorBoxClosers.set(id, fn);
  return () => { _colorBoxClosers.delete(id); };
}

function _closeAllColorBoxes(exceptId?: symbol) {
  _colorBoxClosers.forEach((fn, id) => { if (id !== exceptId) fn(); });
}

// ── Color box trigger ─────────────────────────────────────────────────────────
interface ColorBoxProps {
  value:    string;
  onChange: (v: string) => void;
  label?:   string;
  fallback?: string;
}

const ColorBox = memo(function ColorBox({ value, onChange, label, fallback = "#000000" }: ColorBoxProps) {
  const safe  = safeColor(value, fallback);
  const [open, setOpen]     = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const idRef  = useRef<symbol>(Symbol());

  useEffect(() => {
    return _registerColorBoxCloser(idRef.current, () => setOpen(false));
  }, []);

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect() ?? null;
    setAnchor(rect);
    _closeAllColorBoxes(idRef.current);
    setOpen(prev => !prev);
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        title={label ?? safe}
        style={{
          width: 32, height: 20, borderRadius: 5, cursor: "pointer",
          background: safe,
          border: open ? "2px solid #B7FF5A" : "1.5px solid rgba(255,255,255,0.18)",
          boxShadow: open ? "0 0 0 2px rgba(183,255,90,0.35)" : undefined,
          transition: "box-shadow 0.12s, border 0.12s",
          flexShrink: 0,
          padding: 0,
          outline: "none",
        }}
      />
      {open && anchor && (
        <ColorPickerGlass
          value={safe}
          onChange={onChange}
          onClose={() => setOpen(false)}
          anchorRect={anchor}
        />
      )}
    </>
  );
});

// ── Setting row helpers ───────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        margin: "0 0 8px", fontSize: 9, fontWeight: 900,
        color: "rgba(183,255,90,0.3)", textTransform: "uppercase", letterSpacing: "0.14em",
      }}>
        {title}
      </p>
      <div style={{
        background: "rgba(57,91,67,0.05)", borderRadius: 10,
        border: "1px solid rgba(57,91,67,0.18)", overflow: "visible",
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: last ? "none" : "1px solid rgba(57,91,67,0.1)",
        background: hovered ? "rgba(57,91,67,0.06)" : "transparent",
        transition: "background 0.12s",
      }}>
      <span style={{ fontSize: 12, color: "rgba(167,184,169,0.75)", fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{children}</div>
    </div>
  );
}

function ColorPair({ label, bull, bear, onBull, onBear, last }: {
  label: string; bull: string; bear: string;
  onBull: (v: string) => void; onBear: (v: string) => void; last?: boolean;
}) {
  return (
    <Row label={label} last={last}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 9, color: "rgba(183,255,90,0.45)", fontWeight: 700 }}>▲</span>
        <ColorBox value={bull} onChange={onBull} label={`${label} Bullish`} />
      </div>
      <div style={{ width: 1, height: 14, background: "rgba(57,91,67,0.3)", margin: "0 2px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 9, color: "rgba(239,68,68,0.55)", fontWeight: 700 }}>▼</span>
        <ColorBox value={bear} onChange={onBear} label={`${label} Bearish`} />
      </div>
    </Row>
  );
}

function StyledSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          appearance: "none", WebkitAppearance: "none",
          background: "rgba(57,91,67,0.12)", border: "1px solid rgba(57,91,67,0.35)",
          borderRadius: 7, color: "#F3FFF3", fontSize: 11, fontWeight: 600,
          padding: "5px 28px 5px 10px", cursor: "pointer", outline: "none",
          transition: "border-color 0.12s",
        }}
        onFocus={e => { (e.currentTarget as HTMLSelectElement).style.borderColor = "rgba(183,255,90,0.4)"; }}
        onBlur={e => { (e.currentTarget as HTMLSelectElement).style.borderColor = "rgba(57,91,67,0.35)"; }}
      >
        {options.map(o => <option key={o.value} value={o.value} style={{ background: "#0D2A1A" }}>{o.label}</option>)}
      </select>
      <ChevronDown style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "rgba(167,184,169,0.5)", pointerEvents: "none" }} />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: "pointer", border: "none",
        background: checked ? "rgba(183,255,90,0.25)" : "rgba(57,91,67,0.2)",
        position: "relative", transition: "background 0.2s",
        outline: checked ? "1px solid rgba(183,255,90,0.4)" : "1px solid rgba(57,91,67,0.3)",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: checked ? 18 : 3,
        width: 14, height: 14, borderRadius: "50%",
        background: checked ? "#B7FF5A" : "rgba(167,184,169,0.4)",
        transition: "left 0.18s, background 0.18s",
        boxShadow: checked ? "0 0 6px rgba(183,255,90,0.5)" : "none",
      }} />
    </button>
  );
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────
type SidebarSection = "Symbol" | "Canvas" | "Scale";

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "9px 14px",
        background: active ? "rgba(183,255,90,0.08)" : "transparent",
        border: "none",
        borderLeft: `2px solid ${active ? "#B7FF5A" : "transparent"}`,
        cursor: "pointer", textAlign: "left",
        transition: "all 0.12s",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.1)"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "#B7FF5A" : "rgba(167,184,169,0.65)" }}>
        {label}
      </span>
    </button>
  );
}

// ── Save-as-default button with confirmation flash ────────────────────────────
function SaveAsDefaultButton({ settings, onSaveAsDefault }: { settings: ChartSettings; onSaveAsDefault: (s: ChartSettings) => void }) {
  const [saved, setSaved] = useState(false);
  const handleClick = () => {
    onSaveAsDefault(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  return (
    <button onClick={handleClick}
      style={{
        padding: "7px 16px", borderRadius: 9,
        background: saved ? "rgba(183,255,90,0.15)" : "transparent",
        border: `1px solid ${saved ? "rgba(183,255,90,0.5)" : "rgba(57,91,67,0.3)"}`,
        color: saved ? "#B7FF5A" : "rgba(167,184,169,0.75)",
        fontSize: 11, fontWeight: 600, cursor: "pointer",
        transition: "all 0.18s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!saved) { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(57,91,67,0.6)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.95)"; } }}
      onMouseLeave={e => { if (!saved) { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(57,91,67,0.3)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.75)"; } }}
    >
      {saved ? "✓ Saved as Default" : "Save as Default"}
    </button>
  );
}

// ── ThicknessRow — shared between desktop and embedded ────────────────────────
function ThicknessButtons({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3].map(w => (
        <button key={w} onClick={() => onChange(w)}
          style={{
            width: 30, height: 28, borderRadius: 7, cursor: "pointer", border: "none",
            background: value === w ? "rgba(183,255,90,0.12)" : "rgba(57,91,67,0.1)",
            outline: value === w ? "1.5px solid rgba(183,255,90,0.45)" : "1px solid rgba(57,91,67,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.12s",
          }}>
          <div style={{ width: "60%", height: w, background: value === w ? "#B7FF5A" : "rgba(167,184,169,0.5)", borderRadius: 1 }} />
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  settings: ChartSettings;
  onChange: (s: ChartSettings) => void;
  onSaveAsDefault?: (s: ChartSettings) => void;
  onClose:  () => void;
  embedded?: boolean;
}

const SettingsPanel = memo(function SettingsPanel({ settings, onChange, onSaveAsDefault, onClose, embedded }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SidebarSection>("Symbol");

  // Desktop-only: close on outside click. BottomSheet handles this in embedded mode.
  useEffect(() => {
    if (embedded) return;
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) {
        const pickers = document.querySelectorAll("[data-drawing-popup]");
        for (const p of pickers) { if (p.contains(target)) return; }
        onClose();
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", h), 80);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", h); };
  }, [onClose, embedded]);

  const p = useCallback((patch: Partial<ChartSettings>) => onChange({ ...settings, ...patch }), [settings, onChange]);

  // ── Section content — shared between desktop and embedded layouts ─────────
  const symbolContent = (
    <div>
      <Section title="Candles">
        <ColorPair
          label="Body"
          bull={settings.upColor} bear={settings.downColor}
          onBull={v => p({ upColor: v })} onBear={v => p({ downColor: v })}
        />
        <ColorPair
          label="Borders"
          bull={settings.upBorderColor} bear={settings.downBorderColor}
          onBull={v => p({ upBorderColor: v })} onBear={v => p({ downBorderColor: v })}
        />
        <ColorPair
          label="Wick"
          bull={settings.upWickColor} bear={settings.downWickColor}
          onBull={v => p({ upWickColor: v })} onBear={v => p({ downWickColor: v })}
          last
        />
      </Section>

      <Section title="Price Label">
        <ColorPair
          label="Background"
          bull={settings.priceLabelBullColor ?? "#B7FF5A"}
          bear={settings.priceLabelBearColor ?? "#ef4444"}
          onBull={v => p({ priceLabelBullColor: v })}
          onBear={v => p({ priceLabelBearColor: v })}
        />
        <Row label="Text Color">
          <ColorBox
            value={settings.priceLabelTextColor ?? "#ffffff"}
            onChange={v => p({ priceLabelTextColor: v })}
            label="Price Label Text"
            fallback="#ffffff"
          />
        </Row>
        <Row label="Line Color" last>
          <ColorBox
            value={settings.priceLabelLineColor ?? "rgba(255,255,255,0.4)"}
            onChange={v => p({ priceLabelLineColor: v })}
            label="Price Line"
            fallback="rgba(255,255,255,0.4)"
          />
        </Row>
      </Section>

      <Section title="Timezone">
        <Row label="Display Timezone" last>
          <StyledSelect value={settings.timezone} onChange={v => p({ timezone: v as ChartSettings["timezone"] })}
            options={[
              { value: "UTC",      label: "UTC" },
              { value: "IST",      label: "IST (India)" },
              { value: "Exchange", label: "Exchange" },
              { value: "Local",    label: "Local Time" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Price Precision">
        <Row label="Decimal Places" last>
          <StyledSelect value={settings.precision} onChange={v => p({ precision: v as ChartSettings["precision"] })}
            options={[
              { value: "2", label: "2 decimals" },
              { value: "4", label: "4 decimals" },
              { value: "5", label: "5 decimals" },
              { value: "8", label: "8 decimals" },
            ]}
          />
        </Row>
      </Section>
    </div>
  );

  const canvasContent = (
    <div>
      <Section title="Background">
        <Row label="Type">
          <StyledSelect value={settings.bgType} onChange={v => p({ bgType: v as ChartSettings["bgType"] })}
            options={[
              { value: "solid",    label: "Solid" },
              { value: "gradient", label: "Gradient" },
            ]}
          />
        </Row>
        <Row label="Color" last>
          <ColorBox value={settings.bgColor} onChange={v => p({ bgColor: v })} label="Background Color" />
        </Row>
      </Section>

      <Section title="Grid Lines">
        <Row label="Display">
          <StyledSelect value={settings.gridStyle} onChange={v => p({ gridStyle: v as ChartSettings["gridStyle"], gridVisible: v !== "none" })}
            options={[
              { value: "both",       label: "Vertical + Horizontal" },
              { value: "vertical",   label: "Vertical Only" },
              { value: "horizontal", label: "Horizontal Only" },
              { value: "none",       label: "None" },
            ]}
          />
        </Row>
        <Row label="Color" last>
          <ColorBox value={settings.gridColor ?? settings.linesColor} onChange={v => p({ gridColor: v })} label="Grid Color" />
        </Row>
      </Section>

      <Section title="Axis Borders">
        <Row label="Visible">
          <Toggle checked={settings.bordersVisible ?? true} onChange={v => p({ bordersVisible: v })} />
        </Row>
        <Row label="Color" last>
          <ColorBox value={settings.borderColor ?? settings.linesColor} onChange={v => p({ borderColor: v })} label="Axis Border Color" />
        </Row>
      </Section>

      <Section title="Chart Panel Border">
        <Row label="Visible">
          <Toggle checked={settings.panelBorderVisible ?? true} onChange={v => p({ panelBorderVisible: v })} />
        </Row>
        <Row label="Color">
          <ColorBox value={settings.panelBorderColor ?? "rgba(255,255,255,0.22)"} onChange={v => p({ panelBorderColor: v })} label="Panel Border Color" />
        </Row>
        <Row label="Thickness" last>
          <ThicknessButtons
            value={settings.panelBorderThickness ?? 1}
            onChange={v => p({ panelBorderThickness: v })}
          />
        </Row>
      </Section>

      <Section title="Crosshair">
        <Row label="Color">
          <ColorBox value={settings.crosshairColor} onChange={v => p({ crosshairColor: v })} label="Crosshair Color" />
        </Row>
        <Row label="Mode">
          <StyledSelect value={settings.crosshair} onChange={v => p({ crosshair: v as ChartSettings["crosshair"] })}
            options={[
              { value: "normal", label: "Normal" },
              { value: "magnet", label: "Magnet" },
            ]}
          />
        </Row>
        <Row label="Line Style">
          <StyledSelect value={settings.crosshairStyle} onChange={v => p({ crosshairStyle: v as ChartSettings["crosshairStyle"] })}
            options={[
              { value: "solid",  label: "Solid" },
              { value: "dashed", label: "Dashed" },
              { value: "dotted", label: "Dotted" },
            ]}
          />
        </Row>
        <Row label="Thickness" last>
          <ThicknessButtons
            value={settings.crosshairWidth ?? 1}
            onChange={v => p({ crosshairWidth: v })}
          />
        </Row>
      </Section>

      <Section title="Text">
        <Row label="Color">
          <ColorBox value={settings.textColor} onChange={v => p({ textColor: v })} label="Text Color" />
        </Row>
        <Row label="Font Size" last>
          <StyledSelect value={String(settings.fontSize)} onChange={v => p({ fontSize: Number(v) })}
            options={[
              { value: "9",  label: "9px" },
              { value: "10", label: "10px" },
              { value: "11", label: "11px (default)" },
              { value: "12", label: "12px" },
              { value: "13", label: "13px" },
              { value: "14", label: "14px" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Scale Labels">
        <Row label="Label Color" last>
          <ColorBox value={settings.linesColor} onChange={v => p({ linesColor: v })} label="Scale Label Color" />
        </Row>
      </Section>
    </div>
  );

  const scaleContent = (
    <div>
      <Section title="Price Scale Mode">
        <Row label="Scale Type">
          <StyledSelect value={settings.scaleMode} onChange={v => p({ scaleMode: v as ChartSettings["scaleMode"] })}
            options={[
              { value: "normal",  label: "Normal" },
              { value: "log",     label: "Logarithmic" },
              { value: "percent", label: "Percentage" },
              { value: "indexed", label: "Indexed to 100" },
            ]}
          />
        </Row>
        <Row label="Auto Scale" last>
          <Toggle
            checked={settings.priceScaleAutoScale}
            onChange={v => p({ priceScaleAutoScale: v })}
          />
        </Row>
      </Section>

      <Section title="Interaction">
        <Row label="Drag Price Scale" last>
          <div style={{ fontSize: 11, color: "rgba(167,184,169,0.5)", fontStyle: "italic" }}>
            Drag the right axis up/down
          </div>
        </Row>
      </Section>

      <Section title="Reset">
        <Row label="Double-click Axis" last>
          <div style={{ fontSize: 11, color: "rgba(167,184,169,0.5)", fontStyle: "italic" }}>
            Double-click price axis to reset
          </div>
        </Row>
      </Section>
    </div>
  );

  // ── Embedded mobile layout — used inside BottomSheet ─────────────────────
  if (embedded) {
    const TAB_LABELS: Record<SidebarSection, string> = {
      Symbol: "Candles",
      Canvas: "Appearance",
      Scale:  "Scale",
    };

    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* Horizontal tab pills — sticky so they stay visible while scrolling */}
        <div style={{
          display: "flex", gap: 7, padding: "8px 14px 12px",
          position: "sticky", top: 0, zIndex: 2,
          background: "rgba(14,21,16,0.97)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          {(["Symbol", "Canvas", "Scale"] as SidebarSection[]).map(s => {
            const active = section === s;
            return (
              <button key={s} onClick={() => setSection(s)}
                style={{
                  padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: active ? "rgba(183,255,90,0.1)" : "rgba(57,91,67,0.08)",
                  border: `1px solid ${active ? "rgba(183,255,90,0.4)" : "rgba(57,91,67,0.2)"}`,
                  color: active ? "#B7FF5A" : "rgba(167,184,169,0.65)",
                  cursor: "pointer", transition: "all 0.15s",
                  outline: "none",
                }}
                onTouchStart={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.15)"; }}
                onTouchEnd={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.08)"; }}
              >
                {TAB_LABELS[s]}
              </button>
            );
          })}
        </div>

        {/* Section content */}
        <div style={{ padding: "12px 14px 4px" }}>
          {section === "Symbol" && symbolContent}
          {section === "Canvas" && canvasContent}
          {section === "Scale" && scaleContent}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 14px 8px",
          borderTop: "1px solid rgba(57,91,67,0.18)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
          flexShrink: 0,
        }}>
          <button onClick={() => onChange(DEFAULT_CHART_SETTINGS)}
            style={{
              padding: "8px 16px", borderRadius: 9,
              background: "transparent", border: "1px solid rgba(57,91,67,0.3)",
              color: "rgba(167,184,169,0.6)", fontSize: 12, fontWeight: 600, cursor: "pointer",
              transition: "all 0.12s",
            }}
            onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(57,91,67,0.6)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.9)"; }}
            onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(57,91,67,0.3)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.6)"; }}
          >
            Reset Defaults
          </button>
          {onSaveAsDefault && (
            <SaveAsDefaultButton settings={settings} onSaveAsDefault={onSaveAsDefault} />
          )}
        </div>
      </div>
    );
  }

  // ── Desktop modal layout ──────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div ref={ref} style={{
        width: 640, maxHeight: "84vh",
        background: "rgba(7,13,10,0.99)", backdropFilter: "blur(32px)",
        border: "1px solid rgba(57,91,67,0.45)", borderRadius: 18,
        boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(183,255,90,0.05)",
        display: "flex", flexDirection: "column",
        overflow: "visible",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(57,91,67,0.2)",
          flexShrink: 0,
          borderRadius: "18px 18px 0 0",
          background: "rgba(57,91,67,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: "rgba(183,255,90,0.08)", border: "1px solid rgba(183,255,90,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img src={icoSettingsUrl} alt="" draggable={false} style={{ width: 14, height: 14, display: "block", filter: "brightness(0) invert(1)", userSelect: "none", pointerEvents: "none" }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#F3FFF3" }}>Chart Settings</p>
              <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.4)" }}>Customize appearance & scale</p>
            </div>
          </div>
          <button onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(57,91,67,0.1)", border: "1px solid rgba(57,91,67,0.2)", cursor: "pointer",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.15)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.3)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(57,91,67,0.2)"; }}
          >
            <X style={{ width: 13, height: 13, color: "rgba(167,184,169,0.6)" }} />
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", borderRadius: "0 0 18px 18px" }}>
          {/* Sidebar */}
          <div style={{
            width: 152, borderRight: "1px solid rgba(57,91,67,0.18)",
            flexShrink: 0, paddingTop: 10, paddingBottom: 10,
            background: "rgba(57,91,67,0.03)",
            borderRadius: "0 0 0 18px",
          }}>
            <p style={{ margin: "4px 14px 10px", fontSize: 9, fontWeight: 900, color: "rgba(167,184,169,0.2)", textTransform: "uppercase", letterSpacing: "0.14em" }}>Sections</p>
            {(["Symbol", "Canvas", "Scale"] as SidebarSection[]).map(s => (
              <NavItem key={s} label={s} active={section === s} onClick={() => setSection(s)} />
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", scrollbarWidth: "none" }}>
            {section === "Symbol" && symbolContent}
            {section === "Canvas" && canvasContent}
            {section === "Scale" && scaleContent}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid rgba(57,91,67,0.18)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
          flexShrink: 0,
          borderRadius: "0 0 18px 18px",
          background: "rgba(57,91,67,0.03)",
        }}>
          <button onClick={() => onChange(DEFAULT_CHART_SETTINGS)}
            style={{
              padding: "7px 16px", borderRadius: 9,
              background: "transparent", border: "1px solid rgba(57,91,67,0.3)",
              color: "rgba(167,184,169,0.6)", fontSize: 11, fontWeight: 600, cursor: "pointer",
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(57,91,67,0.6)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.9)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(57,91,67,0.3)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.6)"; }}
          >
            Reset Defaults
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {onSaveAsDefault && (
              <SaveAsDefaultButton settings={settings} onSaveAsDefault={onSaveAsDefault} />
            )}
            <button onClick={onClose}
              style={{
                padding: "7px 20px", borderRadius: 9,
                background: "rgba(183,255,90,0.1)", border: "1px solid rgba(183,255,90,0.3)",
                color: "#B7FF5A", fontSize: 11, fontWeight: 800, cursor: "pointer",
                transition: "all 0.12s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.18)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(183,255,90,0.2)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.1)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default SettingsPanel;
