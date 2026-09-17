/**
 * A key/value store, with the browser behind an interface.
 *
 * `localStorage` throws rather than returning null in more situations than is
 * comfortable — private browsing on some versions of Safari, blocked site data,
 * an exhausted quota — and every one of those throws sits between a person and
 * their own medical history. So every call is contained here, and the rest of
 * the app talks to something it can also run in a test.
 */

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

/** Thrown when a write fails because there is no room left. */
export class QuotaExceeded extends Error {
  constructor(cause?: unknown) {
    super("The browser has no room left to save this.");
    this.name = "QuotaExceeded";
    this.cause = cause;
  }
}

function isQuotaError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    // Older WebKit reported this as a numeric code with a generic name.
    (e as { code?: number }).code === 22
  );
}

/**
 * The real thing. Reads that fail are treated as a miss, because a missing value
 * and an unreadable one lead to the same place. Writes that fail are not
 * swallowed: the caller has to know, so it can tell the person their entry did
 * not save rather than letting them believe it did.
 */
export function browserStore(storage: Storage = localStorage): KeyValueStore {
  return {
    get(key) {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage.setItem(key, value);
      } catch (e) {
        if (isQuotaError(e)) throw new QuotaExceeded(e);
        throw e;
      }
    },
    remove(key) {
      try {
        storage.removeItem(key);
      } catch {
        // Nothing useful to do, and nothing lost by carrying on.
      }
    },
    keys() {
      try {
        return Object.keys(storage);
      } catch {
        return [];
      }
    },
  };
}

/** An in-memory store, for tests and for a browser that will not let us write. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  };
}

/**
 * A store that refuses a write once it is holding more than `limit` characters,
 * so the quota path can be exercised rather than hoped about.
 */
export function boundedMemoryStore(limit: number): KeyValueStore {
  const inner = memoryStore();
  return {
    ...inner,
    set(key, value) {
      const others = inner
        .keys()
        .filter((k) => k !== key)
        .reduce((n, k) => n + (inner.get(k)?.length ?? 0), 0);
      if (others + value.length > limit) throw new QuotaExceeded();
      inner.set(key, value);
    },
  };
}

/** Whether this browser will actually hold anything for us. */
export function storageWorks(store: KeyValueStore): boolean {
  const probe = "clear-probe";
  try {
    store.set(probe, "1");
    const ok = store.get(probe) === "1";
    store.remove(probe);
    return ok;
  } catch {
    return false;
  }
}
