/**
 * use-toast.ts — React Native port
 *
 * Web source: shadcn/ui use-toast (Radix-based reducer state machine)
 *
 * Web → RN replacements:
 *   Radix toast state / open prop   → react-native-toast-message imperative API
 *   setTimeout remove queue         → library auto-dismiss
 *   open: boolean on toast object   → library visibility state
 *   onOpenChange callback           → library onHide callback
 *
 * Preserved exactly:
 *   reducer()             — state machine (used by useToast())
 *   useToast()            — hook returning { toasts, toast, dismiss }
 *   toast()               — main function returning { id, dismiss, update }
 *   ToasterToast type     — unchanged shape
 *   State type            — unchanged shape
 *
 * New additions (not in web source):
 *   toast.success()       — shorthand for type "success"
 *   toast.error()         — shorthand for type "error"  
 *   toast.warning()       — shorthand for type "warning"
 *   toast.info()          — shorthand for type "info"
 *   toast.loading()       — shorthand for type "loading" (autoHide:false)
 *   toast.dismiss()       — alias for top-level dismiss()
 *   toast.promise()       — loading → success/error lifecycle helper
 *
 * Implementation notes:
 *   - Internal state (memoryState + listeners) is preserved for useToast()
 *     backward compat (toasts array, open field, onOpenChange callback).
 *   - Actual toast display is delegated to react-native-toast-message.
 *   - Since the library shows one toast at a time, dismiss(toastId) hides
 *     the currently visible toast (no per-id targeting in the library).
 *   - ReactNode titles/descriptions are accepted for type compat but only
 *     string values are passed to the library (complex nodes are ignored).
 *   - `update()` re-calls Toast.show() with updated data, replacing the
 *     visible toast.
 */

import * as React from "react";
import RNToast from "react-native-toast-message";

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOAST_LIMIT = 1;
// Internal state keep-alive — actual removal is library-driven
const TOAST_REMOVE_DELAY = 1_000_000;

// ─── Types ────────────────────────────────────────────────────────────────────

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | { type: ActionType["ADD_TOAST"]; toast: ToasterToast }
  | { type: ActionType["UPDATE_TOAST"]; toast: Partial<ToasterToast> }
  | { type: ActionType["DISMISS_TOAST"]; toastId?: ToasterToast["id"] }
  | { type: ActionType["REMOVE_TOAST"]; toastId?: ToasterToast["id"] };

interface State {
  toasts: ToasterToast[];
}

// ─── Reducer (preserved exactly from web source) ──────────────────────────────

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) return;

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: "REMOVE_TOAST", toastId });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((t) => addToRemoveQueue(t.id));
      }
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t,
        ),
      };
    }

    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return { ...state, toasts: [] };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

// ─── Global listeners (preserved from web source) ────────────────────────────

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

// ─── Map variant to react-native-toast-message type ──────────────────────────

type RNToastType = "success" | "error" | "warning" | "info" | "loading" | "default" | "destructive";

function variantToType(variant?: string, explicitType?: RNToastType): RNToastType {
  if (explicitType) return explicitType;
  if (variant === "destructive") return "destructive";
  return "default";
}

// ─── Internal show helper ─────────────────────────────────────────────────────

function showRNToast(
  type: RNToastType,
  title?: React.ReactNode,
  description?: React.ReactNode,
  options?: {
    onPress?: () => void;
    onHide?: () => void;
    visibilityTime?: number;
    autoHide?: boolean;
  },
) {
  RNToast.show({
    type,
    text1: typeof title === "string" ? title : undefined,
    text2: typeof description === "string" ? description : undefined,
    onPress: options?.onPress,
    onHide: options?.onHide,
    visibilityTime: options?.visibilityTime ?? (type === "loading" ? 999_999 : 4_000),
    autoHide: options?.autoHide ?? type !== "loading",
  });
}

// ─── Return type ──────────────────────────────────────────────────────────────

type ToastInput = Omit<ToasterToast, "id">;

interface ToastReturn {
  id: string;
  dismiss: () => void;
  update: (props: ToasterToast) => void;
}

// ─── Core toast function ──────────────────────────────────────────────────────

function toast(props: ToastInput): ToastReturn;
function toast(title: string, options?: Partial<ToastInput>): ToastReturn;
function toast(
  propsOrTitle: ToastInput | string,
  optionOverrides?: Partial<ToastInput>,
): ToastReturn {
  const id = genId();

  // Normalize overloads
  const resolved: ToastInput =
    typeof propsOrTitle === "string"
      ? { title: propsOrTitle, ...optionOverrides }
      : propsOrTitle;

  const { title, description, variant, open: _open, onOpenChange, ...rest } = resolved;
  const type = variantToType(variant);

  const dismissFn = () => {
    RNToast.hide();
    dispatch({ type: "DISMISS_TOAST", toastId: id });
  };

  const updateFn = (next: ToasterToast) => {
    dispatch({ type: "UPDATE_TOAST", toast: { ...next, id } });
    showRNToast(
      variantToType(next.variant),
      next.title,
      next.description,
      { visibilityTime: 4_000 },
    );
  };

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...rest,
      id,
      title,
      description,
      variant,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismissFn();
        onOpenChange?.(open);
      },
    },
  });

  showRNToast(type, title, description, {
    onHide: () => dispatch({ type: "DISMISS_TOAST", toastId: id }),
  });

  return { id, dismiss: dismissFn, update: updateFn };
}

// ─── Variant shorthands ───────────────────────────────────────────────────────

function makeVariant(type: RNToastType) {
  return function (
    title: string,
    options?: Partial<Omit<ToastInput, "title" | "variant">> & {
      description?: string;
      visibilityTime?: number;
      onPress?: () => void;
    },
  ): ToastReturn {
    const id = genId();

    const dismissFn = () => {
      RNToast.hide();
      dispatch({ type: "DISMISS_TOAST", toastId: id });
    };

    dispatch({
      type: "ADD_TOAST",
      toast: {
        id,
        title,
        description: options?.description,
        variant: type === "destructive" ? "destructive" : "default",
        open: true,
        onOpenChange: (open) => {
          if (!open) dismissFn();
        },
      },
    });

    showRNToast(type, title, options?.description, {
      visibilityTime: options?.visibilityTime,
      autoHide: type !== "loading",
      onPress: options?.onPress,
      onHide: () => dispatch({ type: "DISMISS_TOAST", toastId: id }),
    });

    return {
      id,
      dismiss: dismissFn,
      update: (next: ToasterToast) => {
        dispatch({ type: "UPDATE_TOAST", toast: { ...next, id } });
        showRNToast(variantToType(next.variant), next.title, next.description);
      },
    };
  };
}

toast.success = makeVariant("success");
toast.error   = makeVariant("error");
toast.warning = makeVariant("warning");
toast.info    = makeVariant("info");
toast.loading = makeVariant("loading");
toast.dismiss = (toastId?: string) => {
  RNToast.hide();
  dispatch({ type: "DISMISS_TOAST", toastId });
};

// ─── promise() helper ─────────────────────────────────────────────────────────

toast.promise = function <T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((err: unknown) => string);
  },
): Promise<T> {
  const { id } = toast.loading(messages.loading);

  return promise.then(
    (data) => {
      RNToast.hide();
      dispatch({ type: "DISMISS_TOAST", toastId: id });
      toast.success(
        typeof messages.success === "function" ? messages.success(data) : messages.success,
      );
      return data;
    },
    (err: unknown) => {
      RNToast.hide();
      dispatch({ type: "DISMISS_TOAST", toastId: id });
      toast.error(
        typeof messages.error === "function" ? messages.error(err) : messages.error,
      );
      return Promise.reject(err);
    },
  );
};

// ─── useToast hook (preserved from web source) ────────────────────────────────

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => {
      RNToast.hide();
      dispatch({ type: "DISMISS_TOAST", toastId });
    },
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { useToast, toast };
export type { ToasterToast };
