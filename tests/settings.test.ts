import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  parseSignalingServers,
} from "../src/obsidian/settings.js";

describe("collaboration settings", () => {
  it("does not silently enable public signaling servers by default", () => {
    expect(DEFAULT_SETTINGS.signalingServers).toEqual([]);
  });

  it("accepts and de-duplicates ws and wss signaling URLs", () => {
    expect(
      parseSignalingServers(
        "wss://signal.example.org\nws://192.168.1.10:4444\nwss://signal.example.org",
      ),
    ).toEqual([
      "wss://signal.example.org",
      "ws://192.168.1.10:4444",
    ]);
  });

  it("rejects non-WebSocket signaling URLs", () => {
    expect(() => parseSignalingServers("https://signal.example.org")).toThrow(
      "ws:// or wss://",
    );
  });

  it("clamps the peer connection count to the supported small-team range", () => {
    expect(normalizeSettings({ maxConnections: 100 }).maxConnections).toBe(64);
    expect(normalizeSettings({ maxConnections: 1 }).maxConnections).toBe(2);
  });

  it("defaults collaboration to the isolated Collab-Test folder", () => {
    expect(DEFAULT_SETTINGS.collaborationFolder).toBe("Collab-Test");
  });

  it("normalizes an empty workspace ID and Windows collaboration folder path", () => {
    const settings = normalizeSettings({
      workspaceId: "",
      collaborationFolder: "\\Collab-Test\\",
    });
    expect(settings.workspaceId).toBe("financewiki-team");
    expect(settings.collaborationFolder).toBe("Collab-Test");
  });
});
