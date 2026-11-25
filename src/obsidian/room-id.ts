export function createRoomId(workspaceId: string, filePath: string): string {
  const workspace = workspaceId.trim();
  const path = filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

  if (!workspace) {
    throw new Error("Workspace ID must not be empty");
  }
  if (!path) {
    throw new Error("Markdown file path must not be empty");
  }

  return [
    "financewiki",
    encodeURIComponent(workspace),
    encodeURIComponent(path),
  ].join("/");
}

export function createIndexedDbName(roomId: string): string {
  return "financewiki-collab:" + roomId;
}

export function isInCollaborationFolder(
  filePath: string,
  collaborationFolder: string,
): boolean {
  const path = filePath.replace(/\\/g, "/").replace(/^\/+/g, "");
  const folder = collaborationFolder
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

  return folder.length > 0 && path.startsWith(folder + "/");
}

/**
 * M2 deliberately supports plain Markdown test notes only. YAML frontmatter
 * needs a separate single-writer bridge and is handled in M3.
 */
export function hasYamlFrontmatter(markdown: string): boolean {
  // Treat any leading YAML delimiter as frontmatter, including an incomplete
  // block. Refusing collaboration is safer than accidentally syncing metadata.
  return /^---(?:\r?\n|$)/.test(markdown);
}
