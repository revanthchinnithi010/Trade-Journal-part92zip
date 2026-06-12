import { useState, useCallback } from "react";
import type { ChartType, IndicatorState } from "@/store/chartStore";
import type { ChartSettings } from "@/components/charts/chartSettingsTypes";

export interface NamedLayout {
  id: string;
  name: string;
  symbol: string;
  interval: string;
  chartType: ChartType;
  indicators: IndicatorState;
  chartSettings: ChartSettings;
  layoutCount: number;
  savedAt: number;
}

const LS_KEY = "tj_named_layouts_v1";

function readLayouts(): NamedLayout[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as NamedLayout[]) : [];
  } catch { return []; }
}

function writeLayouts(layouts: NamedLayout[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(layouts)); } catch { /* ignore */ }
}

export function useNamedLayouts() {
  const [layouts, setLayouts] = useState<NamedLayout[]>(readLayouts);

  const persist = useCallback((next: NamedLayout[]) => {
    setLayouts(next);
    writeLayouts(next);
  }, []);

  const saveLayout = useCallback((data: Omit<NamedLayout, "id" | "savedAt">) => {
    const base = readLayouts();
    const next: NamedLayout[] = [
      ...base,
      { ...data, id: crypto.randomUUID(), savedAt: Date.now() },
    ];
    persist(next);
  }, [persist]);

  const renameLayout = useCallback((id: string, name: string) => {
    persist(readLayouts().map(l => l.id === id ? { ...l, name: name.trim() || l.name } : l));
  }, [persist]);

  const deleteLayout = useCallback((id: string) => {
    persist(readLayouts().filter(l => l.id !== id));
  }, [persist]);

  return { layouts, saveLayout, renameLayout, deleteLayout };
}
