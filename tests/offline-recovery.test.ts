import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { attachIndexedDbPersistence, createCollaborativeDoc } from "../src/index.js";
import * as Y from "yjs";

const providers: Array<{ destroy: () => void | Promise<void> }> = [];
const docs: Array<{ destroy: () => void }> = [];

afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.destroy()));
  for (const doc of docs.splice(0)) doc.destroy();
});

describe("offline persistence", () => {
  it("merges independent offline updates after both local databases reopen", async () => {
    const names = ["a", "b"].map(n => "financewiki-restart-" + n + randomUUID());
    const a = createCollaborativeDoc("restart-room");
    const b = createCollaborativeDoc("restart-room");
    docs.push(a,b);
    const pa = attachIndexedDbPersistence(names[0]!, a);
    const pb = attachIndexedDbPersistence(names[1]!, b);
    providers.push(pa,pb);
    await Promise.all([pa.whenSynced,pb.whenSynced]);
    a.getText("body").insert(0,"BASE");
    Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
    const ca = await countStoredUpdates(pa);
    const cb = await countStoredUpdates(pb);
    a.getText("body").insert(0,"PC1 ");
    b.getText("body").insert(4," PC2");
    await Promise.all([waitForStoredUpdateCount(pa,ca+1),waitForStoredUpdateCount(pb,cb+1)]);
    await Promise.all([pa.destroy(),pb.destroy()]);
    providers.splice(providers.indexOf(pa),1);
    providers.splice(providers.indexOf(pb),1);
    a.destroy(); b.destroy(); docs.splice(docs.indexOf(a),1); docs.splice(docs.indexOf(b),1);
    const ra = createCollaborativeDoc("restart-room"), rb = createCollaborativeDoc("restart-room");
    docs.push(ra,rb);
    const rpa = attachIndexedDbPersistence(names[0]!,ra), rpb = attachIndexedDbPersistence(names[1]!,rb);
    providers.push(rpa,rpb);
    await Promise.all([rpa.whenSynced,rpb.whenSynced]);
    expect(ra.getText("body").toString()).toBe("PC1 BASE");
    expect(rb.getText("body").toString()).toBe("BASE PC2");
    const ua = Y.encodeStateAsUpdate(ra,Y.encodeStateVector(rb));
    const ub = Y.encodeStateAsUpdate(rb,Y.encodeStateVector(ra));
    Y.applyUpdate(ra,ub); Y.applyUpdate(rb,ua);
    expect(ra.getText("body").toString()).toBe("PC1 BASE PC2");
    expect(rb.getText("body").toString()).toBe("PC1 BASE PC2");
  });
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
