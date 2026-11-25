import { describe, expect, it } from "vitest";
import { globalLabel, inspectSession, sessionLabel, type SessionHealth } from "../src/obsidian/diagnostics.js";
import type { CollaborationSession } from "../src/obsidian/session.js";

const health = (overrides: Partial<SessionHealth> = {}): SessionHealth => ({
  roomId: "team/test", seeded: true, localReady: true,
  signalingConfigured: 1, signalingConnected: 1,
  connectedPeers: 1, pendingPeers: 0, syncedPeers: 1,
  localPeers: 0, members: [], ...overrides,
});

describe("collaboration diagnostics", () => {
  it("keeps reporting a connected room when focus leaves Markdown", () => {
    expect(globalLabel([health()], null)).toBe("后台协同 · 1 个对端");
  });
  it("shows active-room status independently of other sessions", () => {
    expect(globalLabel([health(), health({roomId:"other", connectedPeers:0})], "team/test"))
      .toBe("协同中 · 1 个对端");
  });
  it("shows idle only when no sessions exist", () => {
    expect(globalLabel([], null)).toBe("空闲 · 无协同会话");
  });
  it("distinguishes a disconnected signaling server from a live DataChannel", () => {
    expect(sessionLabel(health({signalingConnected:0}))).toContain("协同中 · 1 个对端 · 信令未连接");
  });
  it("does not call a pending peer or a local tab a remote connection", () => {
    expect(sessionLabel(health({connectedPeers:0,pendingPeers:1,syncedPeers:0}))).toContain("正在建立 P2P");
    expect(sessionLabel(health({connectedPeers:0,localPeers:1,syncedPeers:0}))).toBe("本机标签页协同");
  });
  it("does not claim offline readiness before IndexedDB loads or a seed arrives", () => {
    expect(sessionLabel(health({localReady:false}))).toBe("本地状态加载中");
    expect(sessionLabel(health({seeded:false}))).toBe("等待初始化");
  });
  it("prioritizes persistence errors over connection state", () => {
    expect(sessionLabel(health({localError:true}))).toBe("本地存储异常 · 请勿重新初始化");
  });
  it("distinguishes initial synchronization from a connected channel", () => {
    expect(sessionLabel(health({syncedPeers:0}))).toContain("正在交换状态");
  });
  it("counts only open sockets and connected nonclosed WebRTC channels", () => {
    const provider = {
      doc: {clientID:1},
      signalingUrls:["ws://host","ws://stale"],
      signalingConns: [] as unknown[],
      room: {webrtcConns:new Map([
        ["a",{connected:true,closed:false,synced:true}],
        ["b",{connected:false,closed:false,synced:false}],
        ["c",{connected:true,closed:true,synced:true}],
      ]),bcConns:new Set(["tab"])},
      awareness:{getStates:()=>new Map([[1,{user:{name:"本机"}}],[2,{user:{name:"PC2"}}]])},
    };
    const providers = new Set([provider]);
    provider.signalingConns.push(
      {providers,url:"ws://host",connected:true,ws:{readyState:1}},
      {providers,url:"ws://host",connected:true,ws:{readyState:1}},
      {providers,url:"ws://stale",connected:true,ws:{readyState:3}},
    );
    const s = inspectSession({roomId:"room",meta:new Map([["seeded",true]]),
      persistence:{synced:true},provider} as unknown as CollaborationSession);
    expect(s).toMatchObject({signalingConnected:1,connectedPeers:1,pendingPeers:1,
      syncedPeers:1,localPeers:1,members:["PC2"],localReady:true});
  });
});
