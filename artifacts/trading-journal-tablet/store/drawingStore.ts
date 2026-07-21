/**
 * drawingStore.ts — Zustand drawing store.
 *
 * React Native port of src/store/drawingStore.ts
 * ──────────────────────────────────────────────
 * RN compatibility changes vs the web original
 * ──────────────────────────────────────────────
 * 1. localStorage → AsyncStorage with module-level sync cache.
 *    Web: saveDrawingStyle / loadDrawingStyle / getDeletedDrawingIds /
 *         persistDeletedId use localStorage synchronously.
 *    RN:  A module-level in-memory cache (_styleCache, _deletedIds) is kept as
 *         the synchronous source of truth.  All writes update the cache
 *         immediately and then fire-and-forget to AsyncStorage.  Call
 *         `initDrawingStorage()` at app startup to pre-populate the cache from
 *         AsyncStorage so that subsequent synchronous reads are warm.
 *
 * All state shape, actions, selectors, undo/redo logic, and public API
 * signatures are preserved exactly.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Drawing, ToolType, DrawingStyle } from "@/types/drawing";
import { DEFAULT_STYLE } from "@/types/drawing";

const MAX_HISTORY    = 50;
const DELETED_LS_KEY = "tv_deleted_drawing_ids";
const STYLE_LS_PREFIX = "drawingStyle_";

// ── Module-level sync caches (mirrors localStorage state) ─────────────────

const _styleCache  = new Map<string, DrawingStyle>();
let   _deletedIds  = new Set<number>();

/**
 * Pre-populate caches from AsyncStorage.
 * Call once at app startup (e.g. in the root layout) so that synchronous
 * reads throughout the session are warm.
 */
export async function initDrawingStorage(): Promise<void> {
  try {
    // Load deleted drawing IDs
    const raw = await AsyncStorage.getItem(DELETED_LS_KEY);
    if (raw) {
      _deletedIds = new Set<number>(JSON.parse(raw) as number[]);
    }
  } catch {
    /* ignore — cache stays empty; reads return sensible defaults */
  }
  // Note: style keys are loaded on-demand (unknown upfront).
  // Pre-warming them would require scanning all AsyncStorage keys, which is
  // expensive.  The cache is populated on the first write instead.
}

// ── Persistence helpers ────────────────────────────────────────────────────

export function saveDrawingStyle(toolType: ToolType, style: DrawingStyle): void {
  _styleCache.set(toolType, style);
  // Fire-and-forget — keeps the synchronous action path fast.
  AsyncStorage.setItem(STYLE_LS_PREFIX + toolType, JSON.stringify(style)).catch(() => {
    /* ignore write errors */
  });
}

export function loadDrawingStyle(toolType: ToolType): DrawingStyle | null {
  // Fast path: return from cache (populated on previous save or init).
  const cached = _styleCache.get(toolType);
  if (cached) return cached;

  // On cold start the cache may be empty — schedule an async warm-up so
  // future synchronous reads hit the cache.
  AsyncStorage.getItem(STYLE_LS_PREFIX + toolType)
    .then((raw) => {
      if (raw) {
        try {
          _styleCache.set(toolType, JSON.parse(raw) as DrawingStyle);
        } catch { /* ignore */ }
      }
    })
    .catch(() => { /* ignore */ });

  return null;
}

export function getDeletedDrawingIds(): Set<number> {
  return new Set(_deletedIds); // return a copy to prevent external mutation
}

function persistDeletedId(id: number) {
  _deletedIds.add(id);
  const slice = [..._deletedIds].slice(-1000);
  AsyncStorage.setItem(DELETED_LS_KEY, JSON.stringify(slice)).catch(() => {
    /* ignore write errors */
  });
}

// ── Store ──────────────────────────────────────────────────────────────────

interface DrawingStore {
  activeTool:    ToolType;
  setActiveTool: (tool: ToolType) => void;

  stayInDraw:    boolean;
  setStayInDraw: (v: boolean) => void;

  drawings:       Drawing[];
  resetDrawings:  (drawings: Drawing[]) => void;
  setDrawings:    (drawings: Drawing[]) => void;
  addDrawing:     (drawing: Drawing) => void;
  updateDrawing:  (id: number, patch: Partial<Drawing>) => void;
  removeDrawing:  (id: number) => void;

  _history: Drawing[][];
  _future:  Drawing[][];
  undo:     () => void;
  redo:     () => void;
  canUndo:  boolean;
  canRedo:  boolean;

  activeStyle:         DrawingStyle;
  /**
   * Called by the user intentionally changing a style property.
   * Updates activeStyle AND persists the new defaults to AsyncStorage
   * so future drawings of the same type inherit them.
   */
  setActiveStyle:      (style: Partial<DrawingStyle>) => void;
  /**
   * Called internally when a drawing is selected, to sync the style
   * panel to show the selected drawing's current style.
   * Does NOT save to AsyncStorage — avoids clobbering persisted defaults.
   */
  syncActiveStyle:     (style: DrawingStyle) => void;

  selectedDrawingId:    number | null;
  setSelectedDrawingId: (id: number | null) => void;

  isDrawing:    boolean;
  setIsDrawing: (v: boolean) => void;
}

function snapshot(drawings: Drawing[], history: Drawing[][]): Drawing[][] {
  return [drawings, ...history].slice(0, MAX_HISTORY);
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  activeTool:    "cursor",
  setActiveTool: (tool) => {
    const savedStyle = loadDrawingStyle(tool);
    set({
      activeTool: tool,
      isDrawing: false,
      ...(savedStyle ? { activeStyle: savedStyle } : {}),
    });
  },

  stayInDraw:    false,
  setStayInDraw: (v) => set({ stayInDraw: v }),

  drawings: [],
  _history: [],
  _future:  [],
  canUndo:  false,
  canRedo:  false,

  resetDrawings: (drawings) => set({ drawings, _history: [], _future: [], canUndo: false, canRedo: false }),

  setDrawings: (drawings) => {
    const { drawings: prev, _history } = get();
    const history = snapshot(prev, _history);
    set({ drawings, _history: history, _future: [], canUndo: true, canRedo: false });
  },

  addDrawing: (drawing) => set((s) => {
    const history = snapshot(s.drawings, s._history);
    return { drawings: [drawing, ...s.drawings], _history: history, _future: [], canUndo: true, canRedo: false };
  }),

  updateDrawing: (id, patch) => set((s) => ({
    drawings: s.drawings.map(d => d.id === id ? { ...d, ...patch } : d),
  })),

  removeDrawing: (id) => set((s) => {
    persistDeletedId(id);
    const history = snapshot(s.drawings, s._history);
    return { drawings: s.drawings.filter(d => d.id !== id), _history: history, _future: [], canUndo: true, canRedo: false };
  }),

  undo: () => set((s) => {
    if (s._history.length === 0) return s;
    const [prev, ...rest] = s._history;
    const future = [s.drawings, ...s._future].slice(0, MAX_HISTORY);
    return { drawings: prev, _history: rest, _future: future, canUndo: rest.length > 0, canRedo: true };
  }),

  redo: () => set((s) => {
    if (s._future.length === 0) return s;
    const [next, ...rest] = s._future;
    const history = snapshot(s.drawings, s._history);
    return { drawings: next, _history: history, _future: rest, canUndo: true, canRedo: rest.length > 0 };
  }),

  activeStyle: DEFAULT_STYLE,

  // User-initiated style change — persists defaults to AsyncStorage.
  setActiveStyle: (patch) => set((s) => {
    const next = { ...s.activeStyle, ...patch };

    // Save as the default for the selected drawing's tool type, so future
    // drawings of that type inherit the new style.
    if (s.selectedDrawingId !== null) {
      const selectedDrawing = s.drawings.find(d => d.id === s.selectedDrawingId);
      if (selectedDrawing) {
        saveDrawingStyle(selectedDrawing.toolType, next);
      }
    }

    // Also save under the active drawing tool (when no drawing is selected
    // but a draw tool is active — e.g. user changes color before drawing).
    if (s.activeTool !== "cursor") {
      saveDrawingStyle(s.activeTool, next);
    }

    // Update selected drawing's style in real-time.
    if (s.selectedDrawingId !== null) {
      const drawings = s.drawings.map(d =>
        d.id === s.selectedDrawingId
          ? { ...d, style: { ...d.style, ...patch } }
          : d
      );
      return { activeStyle: next, drawings };
    }
    return { activeStyle: next };
  }),

  // Internal selection sync — does NOT persist to AsyncStorage.
  syncActiveStyle: (style) => set({ activeStyle: style }),

  selectedDrawingId:    null,
  setSelectedDrawingId: (id) => set({ selectedDrawingId: id }),

  isDrawing:    false,
  setIsDrawing: (v) => set({ isDrawing: v }),
}));
