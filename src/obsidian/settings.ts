export interface CollaborationSettings {
  workspaceId: string;
  collaborationFolder: string;
  signalingServers: string[];
  roomPassword: string;
  userName: string;
  userColor: string;
  maxConnections: number;
}

export const DEFAULT_SETTINGS: CollaborationSettings = {
  workspaceId: "financewiki-team",
  collaborationFolder: "Collab-Test",
  signalingServers: [],
  roomPassword: "",
  userName: "FinanceWiki member",
  userColor: "#30bced",
  maxConnections: 20,
};

export function normalizeSettings(
  value: Partial<CollaborationSettings> | null | undefined,
): CollaborationSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(value ?? {}) };
  const workspaceId =
    typeof merged.workspaceId === "string" ? merged.workspaceId.trim() : "";
  const collaborationFolder =
    typeof merged.collaborationFolder === "string"
      ? merged.collaborationFolder
          .replace(/\\/g, "/")
          .replace(/^\/+|\/+$/g, "")
          .trim()
      : "";
  const roomPassword =
    typeof merged.roomPassword === "string" ? merged.roomPassword : "";
  const userName =
    typeof merged.userName === "string" ? merged.userName.trim() : "";
  const userColor =
    typeof merged.userColor === "string" ? merged.userColor : "";
  const signalingServers =
    typeof merged.signalingServers === "string" ||
    Array.isArray(merged.signalingServers)
      ? parseSignalingServers(merged.signalingServers)
      : [];

  return {
    workspaceId: workspaceId || DEFAULT_SETTINGS.workspaceId,
    collaborationFolder:
      collaborationFolder || DEFAULT_SETTINGS.collaborationFolder,
    signalingServers,
    roomPassword,
    userName: userName || DEFAULT_SETTINGS.userName,
    userColor: isHexColor(userColor)
      ? userColor
      : DEFAULT_SETTINGS.userColor,
    maxConnections: Number.isInteger(merged.maxConnections)
      ? Math.min(64, Math.max(2, merged.maxConnections))
      : DEFAULT_SETTINGS.maxConnections,
  };
}

export function parseSignalingServers(
  input: string[] | string | null | undefined,
): string[] {
  const entries = Array.isArray(input) ? input : (input ?? "").split(/\r?\n/);
  const result = new Set<string>();

  for (const entry of entries) {
    const candidate = entry.trim();
    if (!candidate) continue;

    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw new Error("Invalid signaling URL: " + candidate);
    }

    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      throw new Error("Signaling URLs must use ws:// or wss://");
    }

    result.add(url.toString().replace(/\/$/, ""));
  }

  return [...result];
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
