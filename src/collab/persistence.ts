import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";

/**
 * Attach per-device IndexedDB persistence to a Y.Doc.
 * This is local durability, not network synchronization or a backup.
 */
export function attachIndexedDbPersistence(
  databaseName: string,
  doc: Y.Doc,
): IndexeddbPersistence {
  const normalizedName = databaseName.trim();
  if (normalizedName.length === 0) {
    throw new Error("databaseName must be a non-empty stable identifier");
  }
  return new IndexeddbPersistence(normalizedName, doc);
}
