import { useSyncExternalStore } from "react";
import { subscribe, getFlag, type PerfFlags } from "@/lib/perfFlags";

export function usePerfFlag<K extends keyof PerfFlags>(key: K): boolean {
  return useSyncExternalStore(subscribe, () => getFlag(key));
}
