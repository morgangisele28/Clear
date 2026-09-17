import { describe, expect, it } from "vitest";
import {
  backupBody,
  backupFilename,
  backupStatus,
  inspectBackup,
  listSnapshots,
  loadLog,
  markBackedUp,
  readSnapshot,
  saveLog,
  takeSnapshot,
} from "./log.ts";
import { BACKUP_KEY, LOG_KEY, SNAPSHOT_PREFIX } from "./keys.ts";
import { boundedMemoryStore, memoryStore, QuotaExceeded, storageWorks } from "./store.ts";
import { emptyState } from "@/domain/state.ts";
import { SCHEMA_VERSION } from "@/domain/types.ts";
import type { IsoDate } from "@/domain/dates.ts";

const d = (s: string) => s as IsoDate;
const TODAY = d("2025-06-15");

const logWith = (days: Record<string, unknown>, v = SCHEMA_VERSION) =>
  JSON.stringify({ ...emptyState(), v, days });

describe("loadLog", () => {
  it("gives an empty log when there is nothing stored", () => {
    const result = loadLog(memoryStore(), TODAY);
    expect(result.hadExisting).toBe(false);
    expect(result.canSave).toBe(true);
    expect(result.state.days).toEqual({});
  });

  it("reads a stored log and brings it to the current schema", () => {
    const store = memoryStore({ [LOG_KEY]: JSON.stringify({ v: 1, days: { "2023-01-01": { status: "well" } } }) });
    const result = loadLog(store, TODAY);
    expect(result.hadExisting).toBe(true);
    expect(result.state.v).toBe(SCHEMA_VERSION);
    expect(result.state.days["2023-01-01"]!.status).toBe("well");
  });

  it("opens rather than failing on an unreadable log", () => {
    // An app that will not open at all is worse. The snapshot from before the
    // corruption is still there to restore from.
    const store = memoryStore({ [LOG_KEY]: "{ this is not json" });
    expect(loadLog(store, TODAY).state.days).toEqual({});
  });

  it("says when the browser will not hold anything", () => {
    const blocked = {
      get: () => null,
      set: () => {
        throw new Error("blocked");
      },
      remove: () => {},
      keys: () => [],
    };
    expect(loadLog(blocked, TODAY).canSave).toBe(false);
    expect(storageWorks(blocked)).toBe(false);
  });
});

describe("saveLog", () => {
  it("writes the log", () => {
    const store = memoryStore();
    expect(saveLog(store, emptyState(), TODAY)).toEqual({ ok: true });
    expect(JSON.parse(store.get(LOG_KEY)!).v).toBe(SCHEMA_VERSION);
  });

  it("round trips through load", () => {
    const store = memoryStore();
    const state = emptyState();
    state.conditions = ["copd"];
    state.tags = ["Damp flat"];
    saveLog(store, state, TODAY);
    const back = loadLog(store, TODAY).state;
    expect(back.conditions).toEqual(["copd"]);
    expect(back.tags).toEqual(["Damp flat"]);
  });

  it("reports a failure rather than letting somebody think it saved", () => {
    const store = boundedMemoryStore(10);
    expect(saveLog(store, emptyState(), TODAY)).toEqual({ ok: false, reason: "full" });
  });

  it("gives up an old snapshot to make room for today's entry", () => {
    // Losing a copy from three days ago to keep today's entry is the right trade.
    const existing = logWith({ "2025-06-01": { status: "well" } });
    const store = boundedMemoryStore(existing.length * 2 + 40);
    store.set(LOG_KEY, existing);
    takeSnapshot(store, d("2025-06-14"));
    expect(listSnapshots(store)).toHaveLength(1);

    const state = { ...emptyState(), tags: ["a bit more content to push it over"] };
    expect(saveLog(store, state, TODAY).ok).toBe(true);
  });

  it("reports a store that refuses writes for a reason other than room", () => {
    const store = {
      ...memoryStore(),
      set() {
        throw new Error("denied");
      },
    };
    expect(saveLog(store, emptyState(), TODAY)).toEqual({ ok: false, reason: "blocked" });
  });
});

describe("snapshots", () => {
  const seeded = () => memoryStore({ [LOG_KEY]: logWith({ "2025-06-01": { status: "well" } }) });

  it("keeps the log as it stood at the start of the day", () => {
    const store = seeded();
    takeSnapshot(store, TODAY);
    expect(store.get(SNAPSHOT_PREFIX + TODAY)).toBe(store.get(LOG_KEY));
  });

  it("takes only one a day, so the good copy is not overwritten by a damaged one", () => {
    const store = seeded();
    takeSnapshot(store, TODAY);
    const first = store.get(SNAPSHOT_PREFIX + TODAY);

    store.set(LOG_KEY, logWith({}));
    takeSnapshot(store, TODAY);
    expect(store.get(SNAPSHOT_PREFIX + TODAY)).toBe(first);
  });

  it("takes nothing when there is no log yet", () => {
    const store = memoryStore();
    takeSnapshot(store, TODAY);
    expect(listSnapshots(store)).toEqual([]);
  });

  it("keeps three days and drops the oldest", () => {
    const store = seeded();
    for (const day of ["2025-06-11", "2025-06-12", "2025-06-13", "2025-06-14", "2025-06-15"]) {
      store.set(LOG_KEY, logWith({ [day]: { status: "well" } }));
      takeSnapshot(store, d(day));
    }
    const snaps = listSnapshots(store);
    expect(snaps.map((s) => s.date)).toEqual(["2025-06-15", "2025-06-14", "2025-06-13"]);
  });

  it("lists newest first, with a size so a suspiciously small copy shows", () => {
    const store = seeded();
    takeSnapshot(store, d("2025-06-14"));
    store.set(LOG_KEY, logWith({}));
    takeSnapshot(store, TODAY);

    const snaps = listSnapshots(store);
    expect(snaps[0]!.date).toBe("2025-06-15");
    expect(snaps[0]!.size).toBeLessThan(snaps[1]!.size);
  });

  it("reads a snapshot back through the migration chain", () => {
    const store = memoryStore({
      [SNAPSHOT_PREFIX + "2025-06-14"]: JSON.stringify({ v: 1, days: { "2023-01-01": { status: "well" } } }),
    });
    const restored = readSnapshot(store, SNAPSHOT_PREFIX + "2025-06-14", TODAY)!;
    expect(restored.v).toBe(SCHEMA_VERSION);
    expect(restored.days["2023-01-01"]!.status).toBe("well");
  });

  it("returns nothing for a snapshot that has gone or cannot be read", () => {
    const store = memoryStore({ [SNAPSHOT_PREFIX + "bad"]: "not json" });
    expect(readSnapshot(store, SNAPSHOT_PREFIX + "missing", TODAY)).toBeNull();
    expect(readSnapshot(store, SNAPSHOT_PREFIX + "bad", TODAY)).toBeNull();
  });
});

describe("backupStatus", () => {
  it("is red before there has ever been one", () => {
    expect(backupStatus(memoryStore(), TODAY)).toMatchObject({ tone: "bad", short: "never" });
  });

  it("goes green, then amber, then red as it ages", () => {
    const at = (date: string) => backupStatus(memoryStore({ [BACKUP_KEY]: date }), TODAY);
    expect(at("2025-06-15").tone).toBe("ok");
    expect(at("2025-06-12").tone).toBe("ok");
    expect(at("2025-06-11").tone).toBe("warn");
    expect(at("2025-06-08").tone).toBe("warn");
    expect(at("2025-06-07").tone).toBe("bad");
  });

  it("says it in words as well as colour", () => {
    // A coloured dot on its own is not something everyone can read.
    expect(backupStatus(memoryStore({ [BACKUP_KEY]: "2025-06-15" }), TODAY).label).toBe("Backed up today");
    expect(backupStatus(memoryStore({ [BACKUP_KEY]: "2025-06-14" }), TODAY).label).toBe("Backed up 1 day ago");
    expect(backupStatus(memoryStore({ [BACKUP_KEY]: "2025-06-05" }), TODAY).label).toBe("Backed up 10 days ago");
  });

  it("records a backup", () => {
    const store = memoryStore();
    markBackedUp(store, TODAY);
    expect(backupStatus(store, TODAY).tone).toBe("ok");
  });
});

describe("inspectBackup", () => {
  it("reports what is in a file without restoring it", () => {
    // Restoring replaces the whole log. A file with four entries in it, restored
    // over a year of them, is not a mistake anybody gets to undo.
    const file = logWith({ "2024-01-01": { status: "well" }, "2025-01-01": { status: "unwell" } });
    const result = inspectBackup(file, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days).toBe(2);
    expect(result.first).toBe("2024-01-01");
    expect(result.last).toBe("2025-01-01");
  });

  it("brings an old backup forward as part of reading it", () => {
    const old = JSON.stringify({ v: 1, days: { "2023-01-01": { sputum: { volume: 2 } } } });
    const result = inspectBackup(old, TODAY);
    expect(result.ok && result.state.days["2023-01-01"]!.sputum.volume).toBe(4);
  });

  it("rejects a file that is not a backup", () => {
    expect(inspectBackup("not json at all", TODAY)).toMatchObject({ ok: false });
    expect(inspectBackup("[1,2,3]", TODAY)).toMatchObject({ ok: false });
    expect(inspectBackup('{"something":"else"}', TODAY)).toMatchObject({ ok: false });
  });

  it("accepts a backup that happens to be empty", () => {
    const result = inspectBackup(logWith({}), TODAY);
    expect(result.ok).toBe(true);
    expect(result.ok && result.days).toBe(0);
  });
});

describe("backup files", () => {
  it("writes readable JSON, dated", () => {
    expect(backupBody(emptyState())).toContain("\n");
    expect(backupFilename(TODAY)).toBe("clear-backup-2025-06-15.json");
  });

  it("can be read straight back", () => {
    const state = emptyState();
    state.conditions = ["cf"];
    const result = inspectBackup(backupBody(state), TODAY);
    expect(result.ok && result.state.conditions).toEqual(["cf"]);
  });
});

describe("the quota error", () => {
  it("is distinguishable from any other failure", () => {
    const store = boundedMemoryStore(4);
    expect(() => store.set("k", "much too long")).toThrow(QuotaExceeded);
  });
});
