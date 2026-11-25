import type { CollaborationSession } from "./session.js";

export interface SessionHealth {
  roomId: string;
  seeded: boolean;
  localReady: boolean;
  localError?: boolean;
  signalingConfigured: number;
  signalingConnected: number;
  connectedPeers: number;
  pendingPeers: number;
  syncedPeers: number;
  localPeers: number;
  members: string[];
}

// y-webrtc 10.3.0 exposes these typed Room fields. Its provider.connected
// indicates discovery intent, not a live socket or DataChannel.
export function inspectSession(session: CollaborationSession): SessionHealth {
  const provider = session.provider;
  const peers = [...(provider.room?.webrtcConns.values() ?? [])];
  const connected = peers.filter((peer) => peer.connected && !peer.closed);
  const signals = new Set(provider.signalingConns.filter((conn) =>
    conn.providers?.has(provider) && conn.connected === true &&
    conn.ws?.readyState === 1).map((conn) => conn.url));
  const members = [...provider.awareness.getStates()].filter(([id]) =>
    id !== provider.doc.clientID).map(([, state]) =>
    typeof state.user?.name === "string" ? state.user.name : "未命名成员");
  return {
    roomId: session.roomId,
    seeded: session.meta.get("seeded") === true,
    localReady: session.persistence.synced === true,
    localError: session.localError === true,
    signalingConfigured: provider.signalingUrls.length,
    signalingConnected: signals.size,
    connectedPeers: connected.length,
    pendingPeers: peers.filter((peer) => !peer.connected && !peer.closed).length,
    syncedPeers: connected.filter((peer) => peer.synced).length,
    localPeers: provider.room?.bcConns.size ?? 0,
    members,
  };
}

export function sessionLabel(s: SessionHealth, background = false): string {
  if (s.localError) return "本地存储异常 · 请勿重新初始化";
  if (!s.localReady) return "本地状态加载中";
  if (!s.seeded) return "等待初始化";
  if (s.connectedPeers > 0) {
    const prefix = background ? "后台协同" : "协同中";
    const sync = s.syncedPeers < s.connectedPeers ? " · 正在交换状态" : "";
    const signal = s.signalingConfigured > 0 && s.signalingConnected === 0
      ? " · 信令未连接" : "";
    return prefix + " · " + s.connectedPeers + " 个对端" + sync + signal;
  }
  if (s.pendingPeers > 0) return "正在建立 P2P 连接";
  if (s.localPeers > 0) return "本机标签页协同";
  if (s.signalingConnected > 0) return "等待其他设备 · 本地状态已加载";
  if (s.signalingConfigured === 0) return "本地编辑 · 未配置信令";
  return "离线编辑 · 信令未连接";
}

export function globalLabel(sessions: SessionHealth[], activeRoom: string | null): string {
  if (!sessions.length) return "空闲 · 无协同会话";
  const active = sessions.find((session) => session.roomId === activeRoom);
  if (active) return sessionLabel(active);
  if (sessions.length === 1) return sessionLabel(sessions[0]!, true);
  const connectedRooms = sessions.filter((session) => session.connectedPeers > 0).length;
  return "后台会话 " + sessions.length + " · " + connectedRooms + " 篇已连接";
}
