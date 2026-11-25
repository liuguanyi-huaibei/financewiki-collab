import { describe, expect, it, vi } from "vitest";
import type { WebrtcProvider } from "y-webrtc";
import * as decoding from "lib0/decoding";
import { fromBase64 } from "lib0/buffer";
import { ConnectionManager, encodeAnnouncement } from "../src/obsidian/connection-manager.js";

function fixture() {
  const doc = { identity: "existing Y.Doc" };
  const peers = new Map<string, { connected: boolean; closed: boolean; destroy: ReturnType<typeof vi.fn> }>();
  const provider = {
    shouldConnect: true, signalingUrls: ["ws://host"], doc,
    room: { name: "financewiki/team/test", peerId: "pc2", key: null, webrtcConns: peers },
    signalingConns: [] as unknown[], connect: vi.fn(), disconnect: vi.fn(),
  };
  const signal = { providers: new Set([provider]), connected: true,
    ws: { readyState: 1 } as { readyState: number } | null,
    send: vi.fn(), connect: vi.fn() };
  provider.signalingConns.push(signal, signal);
  const manager = new ConnectionManager(provider as unknown as WebrtcProvider);
  return { doc, peers, signal, provider, manager };
}

describe("automatic connection recovery", () => {
  it("reannounces the existing room without creating or disconnecting a provider", async () => {
    const {manager, signal, provider, doc} = fixture();
    await manager.tick(true, false, 1000);
    expect(signal.send.mock.calls).toEqual([
      [{type:"subscribe",topics:["financewiki/team/test"]}],
      [{type:"publish",topic:"financewiki/team/test",data:{type:"announce",from:"pc2"}}],
    ]);
    expect(provider.doc).toBe(doc);
    expect(provider.connect).not.toHaveBeenCalled();
    expect(provider.disconnect).not.toHaveBeenCalled();
  });
  it("backs off retries and throttles duplicate manual or online events", async () => {
    const {manager,signal} = fixture();
    await manager.tick(true,false,1000);
    await manager.tick(true,true,1100);
    await manager.tick(true,false,2000);
    await manager.tick(true,false,3000);
    expect(manager.attempts).toBe(2);
    expect(signal.send).toHaveBeenCalledTimes(4);
    await manager.tick(true,true,3100);
    expect(manager.attempts).toBe(3);
  });
  it("waits while offline, and resumes on an online event", async () => {
    const {manager,signal} = fixture();
    await manager.tick(false,true,1000);
    expect(manager.attempts).toBe(0);
    await manager.tick(true,true,2000);
    expect(signal.send).toHaveBeenCalledTimes(2);
  });
  it("does not interrupt connected peers even if signaling is unavailable", async () => {
    const {manager,signal,peers} = fixture();
    const peer = {connected:true,closed:false,destroy:vi.fn()};
    peers.set("pc1", peer);
    signal.connected = false; signal.ws = null;
    await manager.tick(true,true,1000);
    expect(peer.destroy).not.toHaveBeenCalled();
    expect(signal.connect).not.toHaveBeenCalled();
    expect(manager.attempts).toBe(0);
  });
  it("nudges only an absent socket, not a socket already connecting", async () => {
    const {manager,signal} = fixture();
    signal.connected = false; signal.ws = {readyState:0};
    await manager.tick(true,false,1000);
    expect(signal.connect).not.toHaveBeenCalled();
    signal.ws = null;
    await manager.tick(true,false,2000);
    expect(signal.connect).toHaveBeenCalledTimes(1);
    expect(signal.send).not.toHaveBeenCalled();
  });
  it("retires only stalled negotiations after the timeout", async () => {
    const {manager,peers} = fixture();
    const peer = {connected:false,closed:false,destroy:vi.fn()};
    peers.set("pc1",peer);
    await manager.tick(true,false,1000);
    await manager.tick(true,true,45000);
    expect(peer.destroy).not.toHaveBeenCalled();
    await manager.tick(true,true,46000);
    expect(peer.destroy).toHaveBeenCalledTimes(1);
  });
  it("stops retries on unload", async () => {
    const {manager,signal} = fixture();
    manager.stop();
    await manager.tick(true,true,1000);
    expect(signal.send).not.toHaveBeenCalled();
  });
  it("does not advertise rooms without configured signaling", async () => {
    const {manager,provider,signal} = fixture();
    provider.signalingUrls = [];
    await manager.tick(true,true,1000);
    expect(signal.send).not.toHaveBeenCalled();
  });
  it("uses the encrypted wire format expected by y-webrtc", async () => {
    const key = await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
    const payload = await encodeAnnouncement("pc2",key);
    expect(typeof payload).toBe("string");
    const envelope = decoding.createDecoder(fromBase64(payload as string));
    expect(decoding.readVarString(envelope)).toBe("AES-GCM");
    const iv = Uint8Array.from(decoding.readVarUint8Array(envelope));
    const cipher = Uint8Array.from(decoding.readVarUint8Array(envelope));
    const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv},key,cipher);
    expect(decoding.readAny(decoding.createDecoder(new Uint8Array(plain))))
      .toEqual({type:"announce",from:"pc2"});
  });
});
