import { create } from "zustand";
import {
  ALL_ALERTS,
  type AnyAlert,
  type AlertStatus,
} from "@/data/alertsData";

// ── Persistence ───────────────────────────────────────────────────────────────
const LS_KEY = "tj_global_alerts_v1";

function load(): AnyAlert[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AnyAlert[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return ALL_ALERTS.map(a => ({ ...a }));
}

function save(alerts: AnyAlert[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(alerts)); } catch { /* ignore */ }
}

// ── Store interface ───────────────────────────────────────────────────────────
interface AlertStore {
  alerts: AnyAlert[];
  addAlert:    (alert: AnyAlert) => void;
  updateAlert: (id: string, patch: Partial<AnyAlert> & { status?: AlertStatus }) => void;
  deleteAlert: (id: string) => void;
  setAlerts:   (alerts: AnyAlert[]) => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: load(),

  addAlert: (alert) => set((state) => {
    const next = [alert, ...state.alerts.filter(a => a.id !== alert.id)];
    save(next);
    return { alerts: next };
  }),

  updateAlert: (id, patch) => set((state) => {
    const next = state.alerts.map(a =>
      a.id === id ? ({ ...a, ...patch } as AnyAlert) : a
    );
    save(next);
    return { alerts: next };
  }),

  deleteAlert: (id) => set((state) => {
    const next = state.alerts.filter(a => a.id !== id);
    save(next);
    return { alerts: next };
  }),

  setAlerts: (alerts) => {
    save(alerts);
    set({ alerts });
  },
}));
