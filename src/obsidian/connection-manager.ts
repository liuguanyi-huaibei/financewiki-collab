import type { WebrtcProvider } from "y-webrtc";
import * as encoding from "lib0/encoding";
import { toBase64 } from "lib0/buffer";

// Wire format of y-webrtc 10.3.0. Keep encrypted rooms encrypted.
export async function encodeAnnouncement(peerId: string, key: CryptoKey | null) {
  const message = { type: "announce", from: peerId };
  if (!key) return message;
  const body = encoding.createEncoder();
  encoding.writeAny(body, message);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name: "AES-GCM", iv}, key,
    Uint8Array.from(encoding.toUint8Array(body)));
  const envelope = encoding.createEncoder();
  encoding.writeVarString(envelope, "AES-GCM");
  encoding.writeVarUint8Array(envelope, iv);
  encoding.writeVarUint8Array(envelope, new Uint8Array(cipher));
  return toBase64(encoding.toUint8Array(envelope));
}

export class ConnectionManager {
  private nextAttempt = 0;
  private delay = 1000;
  private busy = false;
  private stopped = false;
  private pendingSince = new WeakMap<object, number>();
  attempts = 0;
  lastAttempt: number | null = null;
  lastError: string | null = null;

  constructor(private readonly provider: WebrtcProvider) {}

  stop(): void { this.stopped = true; }

  // Called by the plugin timer, network-online event and optional manual action.
  // Never recreate a Y.Doc, persistence, or Provider. lib0 owns socket retries.
  async tick(online: boolean, immediate = false, now = Date.now()): Promise<void> {
    const p = this.provider;
    if (this.stopped || this.busy || !online || !p.shouldConnect ||
        !p.room || !p.signalingUrls.length) return;
    const room = p.room;
    const peers = [...room.webrtcConns.values()];
    if (peers.some(peer => peer.connected && !peer.closed)) {
      this.delay = 1000;
      this.nextAttempt = 0;
      this.lastError = null;
      return;
    }
    for (const peer of peers) {
      if (!peer.closed && !this.pendingSince.has(peer)) this.pendingSince.set(peer, now);
    }
    if (!immediate && now < this.nextAttempt) return;
    // Even repeated online events and manual clicks cannot spam the server.
    if (this.lastAttempt !== null && now - this.lastAttempt < 1000) return;
    this.busy = true;
    this.lastAttempt = now;
    this.attempts++;
    this.nextAttempt = now + this.delay;
    this.delay = Math.min(this.delay * 2, 30000);
    try {
      const signals = [...new Set(p.signalingConns)].filter(c => c.providers?.has(p));
      const open = signals.filter(c => c.connected === true && c.ws?.readyState === 1);
      if (!open.length) {
        // connect() on lib0 is idempotent when a socket exists. Do not call
        // WebrtcProvider.connect() repeatedly (it appends signaling connections).
        for (const c of signals) if (c.ws === null) c.connect();
        return;
      }
      // Leave healthy channels alone. Only retire stuck negotiations after 45s.
      for (const peer of peers) {
        if (!peer.connected && !peer.closed &&
            now - (this.pendingSince.get(peer) ?? now) >= 45000) peer.destroy();
      }
      const payload = await encodeAnnouncement(room.peerId, room.key);
      if (this.stopped || !p.shouldConnect || p.room !== room ||
          [...room.webrtcConns.values()].some(peer => peer.connected && !peer.closed)) return;
      for (const c of open) {
        if (!c.providers?.has(p) || !c.connected || c.ws?.readyState !== 1) continue;
        c.send({type: "subscribe", topics: [room.name]});
        c.send({type: "publish", topic: room.name, data: payload});
      }
      this.lastError = null;
    } catch (error) {
      // Never log plaintext, keys, or signaling payloads.
      this.lastError = error instanceof Error ? error.name : "ConnectionError";
    } finally {
      this.busy = false;
    }
  }
}
