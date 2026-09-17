/**
 * Loading and saving the log, and the copies that make a mistake survivable.
 *
 * The app has no server, so there is no other copy of any of this. Everything
 * here is built around that: a failed save is reported rather than swallowed, a
 * rolling snapshot is taken before each day's first write, and the age of the
 * last backup is tracked so it can be nagged about before it matters.
 */

import { diffDays, type IsoDate } from "@/domain/dates.ts";
import { migrate } from "@/domain/migrate.ts";
import { emptyState } from "@/domain/state.ts";
import type { AppState } from "@/domain/types.ts";
import { BACKUP_KEY, LOG_KEY, SNAPSHOTS_KEPT, SNAPSHOT_PREFIX } from "./keys.ts";
import { QuotaExceeded, storageWorks, type KeyValueStore } from "./store.ts";

export interface LoadResult {
  state: AppState;
  /** False when the browser will not hold anything, so nothing typed will save. */
  canSave: boolean;
  /** True when a stored log was found and read. */
  hadExisting: boolean;
}

/**
 * Reads the stored log and brings it to the current schema.
 *
 * Unreadable JSON gives an empty log rather than an error page. That is a real
 * decision with a cost: somebody with a corrupted log sees an empty app instead
 * of being told. It is made anyway, because the alternative is an app that will
 * not open at all — and the snapshots below are how the corrupted copy is got
 * back, with the daily copy from before the corruption still sitting beside it.
 */
export function loadLog(store: KeyValueStore, today: IsoDate): LoadResult {
  if (!storageWorks(store)) {
    return { state: emptyState(), canSave: false, hadExisting: false };
  }

  const raw = store.get(LOG_KEY);
  if (!raw) return { state: emptyState(), canSave: true, hadExisting: false };

  try {
    return { state: migrate(JSON.parse(raw), today), canSave: true, hadExisting: true };
  } catch {
    return { state: emptyState(), canSave: true, hadExisting: false };
  }
}

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "full" | "blocked" };

/**
 * Writes the log, taking today's snapshot first if there is not one already.
 *
 * If the browser is full, the oldest snapshot is dropped and the write retried:
 * losing a copy from three days ago to keep today's entry is the right trade,
 * and the person finds out either way if it still fails.
 */
export function saveLog(store: KeyValueStore, state: AppState, today: IsoDate): SaveResult {
  takeSnapshot(store, today);

  const body = JSON.stringify(state);
  try {
    store.set(LOG_KEY, body);
    return { ok: true };
  } catch (e) {
    if (!(e instanceof QuotaExceeded)) return { ok: false, reason: "blocked" };
  }

  // Out of room. Give up the oldest copies, newest first to go last.
  for (const key of snapshotKeys(store)) {
    store.remove(key);
    try {
      store.set(LOG_KEY, body);
      return { ok: true };
    } catch (e) {
      if (!(e instanceof QuotaExceeded)) return { ok: false, reason: "blocked" };
    }
  }

  return { ok: false, reason: "full" };
}

/* -------------------------------------------------------------------------- */
/*  Snapshots                                                                  */
/* -------------------------------------------------------------------------- */

export interface Snapshot {
  key: string;
  date: IsoDate;
  /** Size in characters, so a suspiciously small copy is visible before restoring. */
  size: number;
}

function snapshotKeys(store: KeyValueStore): string[] {
  return store.keys().filter((k) => k.startsWith(SNAPSHOT_PREFIX)).sort();
}

/**
 * Keeps a few days of rolling copies, so a bad migration or a mis-tap that wipes
 * something is recoverable without reaching for a file. Each snapshot holds the
 * log as it stood at the start of that day, which is why it is only taken once
 * per day: taking it on every write would overwrite the good copy with the
 * damaged one within seconds.
 */
export function takeSnapshot(store: KeyValueStore, today: IsoDate): void {
  const current = store.get(LOG_KEY);
  if (!current) return;

  const key = SNAPSHOT_PREFIX + today;
  if (store.get(key) != null) return;

  try {
    store.set(key, current);
  } catch {
    // No room for a copy. The log itself matters more, so drop the oldest and
    // let the caller's write proceed.
    const keys = snapshotKeys(store);
    if (keys.length) store.remove(keys[0]!);
    return;
  }

  const keys = snapshotKeys(store);
  while (keys.length > SNAPSHOTS_KEPT) store.remove(keys.shift()!);
}

/** The copies available to restore, newest first. */
export function listSnapshots(store: KeyValueStore): Snapshot[] {
  return snapshotKeys(store)
    .map((key) => ({
      key,
      date: key.slice(SNAPSHOT_PREFIX.length) as IsoDate,
      size: store.get(key)?.length ?? 0,
    }))
    .reverse();
}

/** Reads a snapshot back, or null if it has gone or cannot be parsed. */
export function readSnapshot(
  store: KeyValueStore,
  key: string,
  today: IsoDate,
): AppState | null {
  const raw = store.get(key);
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw), today);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Backups                                                                    */
/* -------------------------------------------------------------------------- */

export type BackupTone = "ok" | "warn" | "bad";

export interface BackupStatus {
  tone: BackupTone;
  /** The full sentence, which carries the same information as the colour. */
  label: string;
  /** The short form for the header, e.g. "today" or "9d". */
  short: string;
  days: number | null;
}

/** Days before the reminder turns amber, and then red. */
const BACKUP_FRESH_DAYS = 3;
const BACKUP_STALE_DAYS = 7;

/**
 * How overdue a backup is.
 *
 * The label says it in words as well as colour, because a coloured dot on its
 * own is not something everyone can read, and it is the one warning in the app
 * that protects against losing the lot.
 */
export function backupStatus(store: KeyValueStore, today: IsoDate): BackupStatus {
  const at = store.get(BACKUP_KEY);
  if (!at) return { tone: "bad", label: "No backup taken yet", short: "never", days: null };

  const days = diffDays(at as IsoDate, today);
  const label =
    days <= 0 ? "Backed up today" : `Backed up ${days} day${days === 1 ? "" : "s"} ago`;
  const short = days <= 0 ? "today" : `${days}d`;
  const tone: BackupTone =
    days <= BACKUP_FRESH_DAYS ? "ok" : days <= BACKUP_STALE_DAYS ? "warn" : "bad";

  return { tone, label, short, days };
}

export function markBackedUp(store: KeyValueStore, today: IsoDate): void {
  try {
    store.set(BACKUP_KEY, today);
  } catch {
    // Not being able to record the backup does not undo the backup.
  }
}

/* -------------------------------------------------------------------------- */
/*  Reading a backup file                                                      */
/* -------------------------------------------------------------------------- */

export type BackupInspection =
  | { ok: false; problem: string }
  | {
      ok: true;
      state: AppState;
      days: number;
      courses: number;
      first: IsoDate | null;
      last: IsoDate | null;
    };

/**
 * Reads a backup file and reports what is in it without touching anything.
 *
 * Restoring replaces the whole log, so it has to be possible to look before
 * leaping: a file with four entries in it, restored over a year of them, is not
 * a mistake anybody gets to undo.
 */
export function inspectBackup(text: string, today: IsoDate): BackupInspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: "That file is not readable as a Clear backup." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, problem: "That file is not readable as a Clear backup." };
  }
  if (!("days" in parsed)) {
    return { ok: false, problem: "That file has no entries in it, so it is not a Clear backup." };
  }

  const state = migrate(parsed, today);
  const dates = Object.keys(state.days).sort() as IsoDate[];

  return {
    ok: true,
    state,
    days: dates.length,
    courses: state.courses.length,
    first: dates[0] ?? null,
    last: dates.length ? dates[dates.length - 1]! : null,
  };
}

/** The file body written out on a backup, pretty-printed so it can be read. */
export function backupBody(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function backupFilename(today: IsoDate): string {
  return `clear-backup-${today}.json`;
}
