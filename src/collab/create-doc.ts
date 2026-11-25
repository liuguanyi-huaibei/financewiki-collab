import * as Y from "yjs";

export const DEFAULT_TEXT_FIELD = "body";

/** Create one Yjs document for one stable FinanceWiki document ID. */
export function createCollaborativeDoc(documentId: string): Y.Doc {
  const normalizedId = documentId.trim();
  if (normalizedId.length === 0) {
    throw new Error("documentId must be a non-empty stable identifier");
  }
  return new Y.Doc({ guid: normalizedId });
}

export function getDocumentText(doc: Y.Doc, field = DEFAULT_TEXT_FIELD): Y.Text {
  if (field.trim().length === 0) {
    throw new Error("Y.Text field name must not be empty");
  }
  return doc.getText(field);
}

export function encodeFullState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function encodeDocumentStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc);
}
