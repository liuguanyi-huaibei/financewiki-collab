import { describe, expect, it } from "vitest";
import {
  createIndexedDbName,
  createRoomId,
  hasYamlFrontmatter,
  isInCollaborationFolder,
} from "../src/obsidian/room-id.js";

describe("Obsidian document identity", () => {
  it("creates the same deterministic room ID for matching workspace and path", () => {
    const first = createRoomId("financewiki-team", "Research/Factor Momentum.md");
    const second = createRoomId("financewiki-team", "Research/Factor Momentum.md");

    expect(first).toBe(second);
    expect(first).toBe(
      "financewiki/financewiki-team/Research%2FFactor%20Momentum.md",
    );
  });

  it("isolates the same path across workspaces", () => {
    expect(createRoomId("team-a", "Notes/Test.md")).not.toBe(
      createRoomId("team-b", "Notes/Test.md"),
    );
  });

  it("normalizes Windows separators before building the room ID", () => {
    expect(createRoomId("team", "Notes\\Test.md")).toBe(
      createRoomId("team", "Notes/Test.md"),
    );
  });

  it("uses a separate IndexedDB database name namespace", () => {
    expect(createIndexedDbName("room-1")).toBe(
      "financewiki-collab:room-1",
    );
  });

  it("limits collaboration to the configured vault-relative test folder", () => {
    expect(isInCollaborationFolder("Collab-Test/Note.md", "Collab-Test")).toBe(true);
    expect(isInCollaborationFolder("Research/Note.md", "Collab-Test")).toBe(false);
    expect(isInCollaborationFolder("Collab-Testing/Note.md", "Collab-Test")).toBe(false);
  });
});

describe("M2 frontmatter boundary", () => {
  it("detects a YAML frontmatter block at the start of a note", () => {
    expect(hasYamlFrontmatter("---\nid: factor-1\n---\n# Factor")).toBe(true);
  });

  it("does not mistake a horizontal rule later in a note for frontmatter", () => {
    expect(hasYamlFrontmatter("# Factor\n\n---\n\nBody")).toBe(false);
  });

  it("allows an ordinary plain Markdown test note", () => {
    expect(hasYamlFrontmatter("# Factor\n\nBody")).toBe(false);
  });

  it("blocks an incomplete leading frontmatter block as a safety precaution", () => {
    expect(hasYamlFrontmatter("---\nid: factor-1\n# Body")).toBe(true);
  });
});
