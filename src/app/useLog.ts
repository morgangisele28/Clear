import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { IsoDate } from "@/domain/dates.ts";
import { emptyState } from "@/domain/state.ts";
import type { AppState } from "@/domain/types.ts";
import { loadLog, saveLog } from "@/storage/log.ts";
import { browserStore, type KeyValueStore } from "@/storage/store.ts";
import { reduce, type Action } from "./actions.ts";

/**
 * How long to wait after a change before writing.
 *
 * Long enough that dragging a slider does not write forty times, short enough
 * that closing the app straight after a tap does not lose it.
 */
const SAVE_DEBOUNCE_MS = 700;

export type SaveFailure = "full" | "blocked";

export type SaveState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "failed"; reason: SaveFailure };

export interface Log {
  state: AppState;
  dispatch: (action: Action) => void;
  /** False while the stored log is still being read. */
  ready: boolean;
  /** False when the browser will not hold anything, so nothing typed will save. */
  canSave: boolean;
  save: SaveState;
  /** Writes immediately rather than waiting for the debounce. */
  flush: () => void;
}

/**
 * Holds the log, and keeps it written down.
 *
 * The store is injectable so this can be driven in a test without a browser, and
 * so a device that refuses to persist anything can be handed an in-memory one
 * and still run for the session rather than failing to open.
 */
export function useLog(today: IsoDate, store: KeyValueStore = browserStore()): Log {
  const [state, dispatch] = useReducer(reduce, undefined, emptyState);
  const [ready, setReady] = useState(false);
  const [canSave, setCanSave] = useState(true);
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  // The load itself is a dispatch, and writing it straight back would rewrite
  // the file on every open for no reason.
  const loaded = useRef(false);

  useEffect(() => {
    const result = loadLog(store, today);
    if (result.hadExisting) dispatch({ type: "log/replace", state: result.state });
    setCanSave(result.canSave);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, on open
  }, []);

  const write = useCallback(
    (next: AppState) => {
      if (!canSave) return;
      const result = saveLog(store, next, today);
      if (result.ok) {
        setSave({ status: "saved" });
        window.setTimeout(() => setSave({ status: "idle" }), 1100);
      } else {
        setSave({ status: "failed", reason: result.reason });
      }
      pending.current = false;
    },
    [canSave, store, today],
  );

  useEffect(() => {
    if (!ready) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }

    pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => write(state), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [state, ready, write]);

  // An app being closed or backgrounded is the moment a pending write is most
  // likely to be lost, and on a phone it is also the most common one.
  useEffect(() => {
    const flushNow = () => {
      if (!pending.current) return;
      window.clearTimeout(timer.current);
      write(state);
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flushNow);
    };
  }, [state, write]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    write(state);
  }, [state, write]);

  return { state, dispatch, ready, canSave, save, flush };
}
