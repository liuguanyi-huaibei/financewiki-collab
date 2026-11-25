import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import {
  attachIndexedDbPersistence,
  createCollaborativeDoc,
} from "../index.js";
import { createIndexedDbName } from "./room-id.js";
import type { CollaborationSettings } from "./settings.js";
import { ConnectionManager } from "./connection-manager.js";

export const SEED_ORIGIN = Symbol("financewiki:initial-seed");

export interface CollaborationSession {
  roomId: string;
  doc: Y.Doc;
  text: Y.Text;
  meta: Y.Map<unknown>;
  persistence: ReturnType<typeof attachIndexedDbPersistence>;
  provider: WebrtcProvider;
  peerIds: Set<string>;
  searchingForPeers: boolean;
  synced: boolean;
  localError?: boolean;
  connection?: ConnectionManager;
}

export function createCollaborationSession(
  roomId: string,
  settings: CollaborationSettings,
): CollaborationSession {
  const doc = createCollaborativeDoc(roomId);
  const text = doc.getText("body");
  const meta = doc.getMap<unknown>("meta");
  const persistence = attachIndexedDbPersistence(
    createIndexedDbName(roomId),
    doc,
  );

  // Passing an explicit empty array prevents y-webrtc from silently using its
  // public default signaling endpoint. Cross-device sync requires a configured
  // server; an empty list only permits same-device BroadcastChannel discovery.
  const provider = new WebrtcProvider(roomId, doc, {
    signaling: settings.signalingServers,
    password: settings.roomPassword || undefined,
    maxConns: settings.maxConnections,
  });

  provider.awareness.setLocalStateField("user", {
    name: settings.userName,
    color: settings.userColor,
    colorLight: settings.userColor + "33",
  });

  return {
    roomId,
    doc,
    text,
    meta,
    persistence,
    provider,
    peerIds: new Set<string>(),
    searchingForPeers: false,
    synced: false,
    connection: new ConnectionManager(provider),
  };
}

export function isSessionSeeded(session: CollaborationSession): boolean {
  return session.meta.get("seeded") === true;
}

export function seedSessionFromText(
  session: CollaborationSession,
  initialText: string,
): void {
  if (isSessionSeeded(session)) {
    throw new Error("This collaboration document has already been seeded");
  }
  if (session.text.length > 0) {
    throw new Error(
      "The Yjs body is not empty but has no seed marker; refusing to overwrite it",
    );
  }

  session.doc.transact(() => {
    if (initialText.length > 0) {
      session.text.insert(0, initialText);
    }
    session.meta.set("seeded", true);
  }, SEED_ORIGIN);
}

export async function destroyCollaborationSession(
  session: CollaborationSession,
): Promise<void> {
  session.connection?.stop();
  // Explicit disconnect removes this provider from shared signaling sockets.
  session.provider.disconnect();
  session.provider.destroy();
  await session.persistence.destroy();
  session.doc.destroy();
}
