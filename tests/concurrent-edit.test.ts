import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  applyRemoteUpdate,
  createCollaborativeDoc,
  encodeFullState,
} from "../src/index.js";
import { body, createSeededPair, expectSameDocumentState } from "./helpers.js";

describe("offline concurrent editing", () => {
  it("preserves edits made at different positions while both peers are offline", () => {
    const { docA, docB } = createSeededPair(
      "# Momentum factor\n\nDefinition: historical return ranking.\n",
    );
    const textA = docA.getText("body");
    const textB = docB.getText("body");
    textA.insert(0, "> Reviewed by member A\n\n");
    textB.insert(textB.length, "\n\n## Calculation\n\nUse a 12-month lookback.\n");

    const updateA = encodeFullState(docA);
    const updateB = encodeFullState(docB);
    applyRemoteUpdate(docA, updateB);
    applyRemoteUpdate(docB, updateA);

    expect(body(docA)).toContain("> Reviewed by member A");
    expect(body(docA)).toContain("Use a 12-month lookback.");
    expectSameDocumentState(docA, docB);
  });

  it("converges when both peers insert at the same logical position", () => {
    const { docA, docB } = createSeededPair("X");
    docA.getText("body").insert(1, " from A");
    docB.getText("body").insert(1, " from B");
    const updateA = encodeFullState(docA);
    const updateB = encodeFullState(docB);
    applyRemoteUpdate(docA, updateB);
    applyRemoteUpdate(docB, updateA);

    const merged = body(docA);
    expect(merged).toContain("from A");
    expect(merged).toContain("from B");
    expectSameDocumentState(docA, docB);
  });

  it("converges even when peers receive updates in different orders", () => {
    const { seed, docA, docB } = createSeededPair("Base text");
    docA.getText("body").insert(0, "A ");
    docB.getText("body").insert(docB.getText("body").length, " B");
    const updateA = encodeFullState(docA);
    const updateB = encodeFullState(docB);
    const baseUpdate = encodeFullState(seed);
    const targetAB = new Y.Doc({ guid: "target-ab" });
    const targetBA = new Y.Doc({ guid: "target-ba" });
    Y.applyUpdate(targetAB, baseUpdate);
    Y.applyUpdate(targetBA, baseUpdate);

    applyRemoteUpdate(targetAB, updateA);
    applyRemoteUpdate(targetAB, updateB);
    applyRemoteUpdate(targetBA, updateB);
    applyRemoteUpdate(targetBA, updateA);
    expectSameDocumentState(targetAB, targetBA);
  });

  it("creates separate document identities for separate FinanceWiki pages", () => {
    const pageA = createCollaborativeDoc("financewiki-team/paper-001");
    const pageB = createCollaborativeDoc("financewiki-team/factor-001");
    pageA.getText("body").insert(0, "Paper content");
    pageB.getText("body").insert(0, "Factor content");

    expect(pageA.guid).not.toBe(pageB.guid);
    expect(body(pageA)).toBe("Paper content");
    expect(body(pageB)).toBe("Factor content");
  });

  it("uses one shared document GUID with distinct client IDs for two replicas", () => {
    const { docA, docB } = createSeededPair("Shared page");
    expect(docA.guid).toBe(docB.guid);
    expect(docA.clientID).not.toBe(docB.clientID);
  });

  it("allows a peer to catch up after remaining offline through multiple edits", () => {
    const { docA, docB } = createSeededPair("Shared start");
    const initialVectorA = Y.encodeStateVector(docA);
    docA.getText("body").insert(docA.getText("body").length, " / edit A1");
    docA.getText("body").insert(docA.getText("body").length, " / edit A2");
    docB.getText("body").insert(0, "Offline B / ");

    const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const updateB = Y.encodeStateAsUpdate(docB, initialVectorA);
    applyRemoteUpdate(docA, updateB);
    applyRemoteUpdate(docB, updateA);

    expect(body(docA)).toContain("Offline B");
    expect(body(docA)).toContain("edit A1");
    expect(body(docA)).toContain("edit A2");
    expectSameDocumentState(docA, docB);
  });
});
