import { describe, expect, it } from "vitest";
import {
  applyRemoteUpdate,
  encodeDocumentStateVector,
  encodeFullState,
  encodeUpdateSince,
} from "../src/index.js";
import { body, createSeededPair } from "./helpers.js";

describe("Yjs update exchange", () => {
  it("does not duplicate content when the same update is applied repeatedly", () => {
    const { docA, docB } = createSeededPair("Shared base");
    docB.getText("body").insert(11, " plus B");
    const updateB = encodeFullState(docB);
    applyRemoteUpdate(docA, updateB);
    const afterFirstApply = body(docA);
    applyRemoteUpdate(docA, updateB);
    applyRemoteUpdate(docA, updateB);
    expect(body(docA)).toBe(afterFirstApply);
    expect(body(docA).match(/plus B/g)).toHaveLength(1);
  });

  it("creates an incremental update from a known state vector", () => {
    const { docA, docB } = createSeededPair("Initial");
    const knownStateVector = encodeDocumentStateVector(docA);
    docB.getText("body").insert(7, " content");
    const incrementalUpdate = encodeUpdateSince(docB, knownStateVector);
    applyRemoteUpdate(docA, incrementalUpdate);
    expect(body(docA)).toBe("Initial content");
  });
});
