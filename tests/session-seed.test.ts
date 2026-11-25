import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  createCollaborationSession,
  destroyCollaborationSession,
  isSessionSeeded,
  seedSessionFromText,
  type CollaborationSession,
} from "../src/obsidian/session.js";
import { normalizeSettings } from "../src/obsidian/settings.js";

function createTestSession(): CollaborationSession {
  const doc = new Y.Doc();
  return {
    roomId: "financewiki/test",
    doc,
    text: doc.getText("body"),
    meta: doc.getMap("meta"),
    persistence: {} as CollaborationSession["persistence"],
    provider: {} as CollaborationSession["provider"],
    peerIds: new Set<string>(),
    searchingForPeers: false,
    synced: false,
  };
}

describe("explicit single-device seeding", () => {
  it("seeds the shared body and writes a replicated seed marker", () => {
    const session = createTestSession();
    seedSessionFromText(session, "# Shared test note\n\nFirst content.");

    expect(session.text.toString()).toBe(
      "# Shared test note\n\nFirst content.",
    );
    expect(isSessionSeeded(session)).toBe(true);
    session.doc.destroy();
  });

  it("refuses a second seed attempt", () => {
    const session = createTestSession();
    seedSessionFromText(session, "Initial body");

    expect(() => seedSessionFromText(session, "Duplicate body")).toThrow(
      "already been seeded",
    );
    expect(session.text.toString()).toBe("Initial body");
    session.doc.destroy();
  });

  it("refuses to overwrite an unmarked but non-empty Y.Text", () => {
    const session = createTestSession();
    session.text.insert(0, "Existing local content");

    expect(() => seedSessionFromText(session, "New seed")).toThrow(
      "refusing to overwrite",
    );
    session.doc.destroy();
  });

  it("sets local Awareness identity and does not select a public signaling server", async () => {
    const session = createCollaborationSession(
      "financewiki/m2-awareness-test-" + crypto.randomUUID(),
      normalizeSettings({
        userName: "Member A",
        userColor: "#abcdef",
        signalingServers: [],
      }),
    );

    await session.persistence.whenSynced;
    const user = session.provider.awareness.getLocalState()?.user as
      | { name: string; color: string; colorLight: string }
      | undefined;

    expect(user).toEqual({
      name: "Member A",
      color: "#abcdef",
      colorLight: "#abcdef33",
    });
    expect(session.provider.signalingUrls).toEqual([]);
    await destroyCollaborationSession(session);
  });
});
