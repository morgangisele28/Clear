/**
 * The storage keys.
 *
 * `LOG_KEY` is not a name anybody would choose today — it is the one already
 * holding every existing user's entries, and renaming it would present them all
 * with an empty app and no way back. It stays.
 */

/** Where the log itself lives. Named before the app was called Clear. */
export const LOG_KEY = "bxlog-v1";

/** The date of the last backup, so its age can be shown. */
export const BACKUP_KEY = "clear-last-backup";

/** Rolling daily copies of the log. */
export const SNAPSHOT_PREFIX = "clear-snap-";

/** How many daily snapshots to keep. */
export const SNAPSHOTS_KEPT = 3;
