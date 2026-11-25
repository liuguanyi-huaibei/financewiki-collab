import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { encodeFullState } from "../src/index.js";

describe("local undo isolation", () => {
  it("undoes the local user's edit without undoing a received remote edit", () => {
    const seed = new Y.Doc();
    seed.getText("body").insert(0, "Base");
    const seedUpdate = encodeFullState(seed);
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    Y.applyUpdate(docA, seedUpdate);
    Y.applyUpdate(docB, seedUpdate);

    const localOriginA = { peer: "A" };
    const localOriginB = { peer: "B" };
    const textA = docA.getText("body");
    const textB = docB.getText("body");
    const undoA = new Y.UndoManager(textA, {
      trackedOrigins: new Set([localOriginA]),
    });

    docA.transact(() => textA.insert(textA.length, " A"), localOriginA);
    docB.transact(() => textB.insert(textB.length, " B"), localOriginB);
    Y.applyUpdate(docA, encodeFullState(docB), { peer: "remote-B" });
    expect(textA.toString()).toContain(" B");
    expect(textA.toString()).toContain(" A");
    undoA.undo();
    expect(textA.toString()).toBe("Base B");

    undoA.destroy();
    seed.destroy();
    docA.destroy();
    docB.destroy();
  });
});
