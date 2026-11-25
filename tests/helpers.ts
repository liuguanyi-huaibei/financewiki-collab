import * as Y from "yjs";
import { expect } from "vitest";
import { createCollaborativeDoc } from "../src/index.js";

export interface SeededPair {
  seed: Y.Doc;
  docA: Y.Doc;
  docB: Y.Doc;
}

export function createSeededPair(
  initialText: string,
  documentId = "financewiki-team/test-document",
): SeededPair {
  const seed = createCollaborativeDoc(documentId);
  seed.getText("body").insert(0, initialText);
  const initialUpdate = Y.encodeStateAsUpdate(seed);
  // Replicas of one logical page share a GUID but have independent client IDs.
  const docA = createCollaborativeDoc(documentId);
  const docB = createCollaborativeDoc(documentId);
  Y.applyUpdate(docA, initialUpdate);
  Y.applyUpdate(docB, initialUpdate);
  return { seed, docA, docB };
}

export function body(doc: Y.Doc): string {
  return doc.getText("body").toString();
}

export function expectSameDocumentState(docA: Y.Doc, docB: Y.Doc): void {
  expect(body(docA)).toBe(body(docB));
  expect(Array.from(Y.encodeStateVector(docA))).toEqual(
    Array.from(Y.encodeStateVector(docB)),
  );
}
