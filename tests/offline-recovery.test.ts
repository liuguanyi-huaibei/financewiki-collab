import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { attachIndexedDbPersistence, createCollaborativeDoc } from "../src/index.js";

const providers: Array<{ destroy: () => void | Promise<void> }> = [];
const docs: Array<{ destroy: () => void }> = [];

afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.destroy()));
  for (const doc of docs.splice(0)) doc.destroy();
});

describe("offline persistence", () => {
  it("restores locally persisted Yjs content after recreating the document", async () => {
    const databaseName = "financewiki-m1-recovery-" + randomUUID();
    const firstDoc = createCollaborativeDoc("financewiki-team/recovery-test");
    docs.push(firstDoc);
    const firstPersistence = attachIndexedDbPersistence(databaseName, firstDoc);
    providers.push(firstPersistence);
    await firstPersistence.whenSynced;
    const updateCountBeforeEdit = await countStoredUpdates(firstPersistence);
    firstDoc.getText("body").insert(0, "Offline edits survive a restart.");
    await waitForStoredUpdateCount(firstPersistence, updateCountBeforeEdit + 1);

    await firstPersistence.destroy();
    providers.splice(providers.indexOf(firstPersistence), 1);
    firstDoc.destroy();
    docs.splice(docs.indexOf(firstDoc), 1);

    const restoredDoc = createCollaborativeDoc("financewiki-team/recovery-test");
    docs.push(restoredDoc);
    const restoredPersistence = attachIndexedDbPersistence(databaseName, restoredDoc);
    providers.push(restoredPersistence);
    await restoredPersistence.whenSynced;
    expect(restoredDoc.getText("body").toString()).toBe(
      "Offline edits survive a restart.",
    );
  });
});

async function countStoredUpdates(
  persistence: { db: IDBDatabase | null },
): Promise<number> {
  const db = persistence.db;
  if (!db) throw new Error("IndexedDB database is not ready");

  return new Promise<number>((resolve, reject) => {
    const transaction = db.transaction("updates", "readonly");
    const request = transaction.objectStore("updates").count();
    let count = 0;
    request.onsuccess = () => {
      count = request.result;
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(count);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function waitForStoredUpdateCount(
  persistence: { db: IDBDatabase | null },
  expectedCount: number,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await countStoredUpdates(persistence)) >= expectedCount) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Yjs update was not persisted to IndexedDB in time");
}
