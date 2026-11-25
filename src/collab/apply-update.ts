import * as Y from "yjs";

/** Stable origin marker for updates received from another peer. */
export const REMOTE_UPDATE_ORIGIN = Symbol("financewiki:remote-update");

export function applyRemoteUpdate(
  doc: Y.Doc,
  update: Uint8Array,
  origin: unknown = REMOTE_UPDATE_ORIGIN,
): void {
  Y.applyUpdate(doc, update, origin);
}

export function encodeUpdateSince(doc: Y.Doc, stateVector: Uint8Array): Uint8Array {
  return Y.encodeStateAsUpdate(doc, stateVector);
}
