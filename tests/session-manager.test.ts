import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCollaborationSession,
  destroyCollaborationSession,
} from "../src/obsidian/session.js";
import { normalizeSettings } from "../src/obsidian/settings.js";
import { SessionManager } from "../src/obsidian/session-manager.js";

describe("SessionManager", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("deduplicates concurrent acquisition and shares one session", async () => {
    const session = { id: "doc-a" };
    const create = vi.fn(async () => session);
    const destroy = vi.fn();
    const manager = new SessionManager({ create, destroy });

    const [a, b] = await Promise.all([
      manager.acquire("room-a"),
      manager.acquire("room-a"),
    ]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(a.session).toBe(session);
    expect(b.session).toBe(session);
    expect(manager.getLeaseCount("room-a")).toBe(2);
    await manager.closeAll();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("isolates separate document rooms while reusing a room across editor views", async () => {
    vi.useRealTimers();
    const settings = normalizeSettings({
      workspaceId: "m3-session-manager-test",
      signalingServers: [],
      userName: "Test Member",
    });
    const manager = new SessionManager({
      create: (roomId) => createCollaborationSession(roomId, settings),
      destroy: destroyCollaborationSession,
    });
    const suffix = crypto.randomUUID();
    const roomA = "financewiki/m3/" + suffix + "/a";
    const roomB = "financewiki/m3/" + suffix + "/b";
    const [a1, a2, b] = await Promise.all([
      manager.acquire(roomA),
      manager.acquire(roomA),
      manager.acquire(roomB),
    ]);
    await Promise.all([
      a1.session.persistence.whenSynced,
      b.session.persistence.whenSynced,
    ]);

    expect(a1.session).toBe(a2.session);
    expect(a1.session.doc).not.toBe(b.session.doc);
    a1.session.text.insert(0, "Document A");
    b.session.text.insert(0, "Document B");
    expect(a1.session.text.toString()).toBe("Document A");
    expect(b.session.text.toString()).toBe("Document B");
    expect(manager.list()).toHaveLength(2);

    await a1.release();
    expect(manager.get(roomA)).toBe(a2.session);
    await manager.closeAll();
  });

  it("releases one editor lease without closing a session still in use", async () => {
    const session = { id: "doc-a" };
    const destroy = vi.fn();
    const manager = new SessionManager({ create: () => session, destroy });
    const a = await manager.acquire("room-a");
    const b = await manager.acquire("room-a");

    await a.release();
    await a.release();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(manager.get("room-a")).toBe(session);
    expect(manager.getLeaseCount("room-a")).toBe(1);
    expect(destroy).not.toHaveBeenCalled();

    await b.release();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(manager.get("room-a")).toBeUndefined();
  });

  it("cancels idle eviction when a document is reopened", async () => {
    const session = { id: "doc-a" };
    const destroy = vi.fn();
    const manager = new SessionManager({ create: () => session, destroy });
    const first = await manager.acquire("room-a");
    await first.release();
    await vi.advanceTimersByTimeAsync(20_000);
    const second = await manager.acquire("room-a");
    await vi.advanceTimersByTimeAsync(20_000);

    expect(second.session).toBe(session);
    expect(destroy).not.toHaveBeenCalled();
    await manager.closeAll();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("waits for an in-progress eviction before creating a replacement", async () => {
    const first = { id: "first" };
    const second = { id: "second" };
    let resolveDestroy!: () => void;
    let destroyCalls = 0;
    const destroy = vi.fn(() => {
      destroyCalls += 1;
      if (destroyCalls > 1) return Promise.resolve();
      return new Promise<void>((resolve) => {
        resolveDestroy = resolve;
      });
    });
    const create = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const manager = new SessionManager({ create, destroy, idleTimeoutMs: 0 });
    const lease = await manager.acquire("room-a");
    const release = lease.release();
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledTimes(1);

    const acquireAgain = manager.acquire("room-a");
    await Promise.resolve();
    expect(create).toHaveBeenCalledTimes(1);
    resolveDestroy();
    await release;
    const next = await acquireAgain;
    expect(next.session).toBe(second);
    expect(create).toHaveBeenCalledTimes(2);
    await manager.closeAll();
  });

  it("does not retain a failed creation and allows a later retry", async () => {
    const session = { id: "recovered" };
    const create = vi.fn()
      .mockRejectedValueOnce(new Error("local persistence failed"))
      .mockResolvedValueOnce(session);
    const manager = new SessionManager({ create, destroy: vi.fn() });

    await expect(manager.acquire("room-a")).rejects.toThrow("local persistence failed");
    const lease = await manager.acquire("room-a");
    expect(lease.session).toBe(session);
    expect(create).toHaveBeenCalledTimes(2);
    await manager.closeAll();
  });

  it("closes every distinct session once and rejects later acquisition", async () => {
    const destroy = vi.fn();
    const manager = new SessionManager({
      create: (key) => ({ key }),
      destroy,
    });
    await Promise.all([manager.acquire("a"), manager.acquire("b")]);
    await manager.closeAll();
    await manager.closeAll();

    expect(destroy).toHaveBeenCalledTimes(2);
    expect(manager.list()).toEqual([]);
    await expect(manager.acquire("c")).rejects.toThrow("closed");
  });

  it("evicts immediately when idle timeout is zero", async () => {
    const destroy = vi.fn();
    const manager = new SessionManager({
      create: (key) => ({ key }),
      destroy,
      idleTimeoutMs: 0,
    });
    const lease = await manager.acquire("a");
    await lease.release();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(manager.get("a")).toBeUndefined();
  });

  it("reports asynchronous eviction errors without corrupting other sessions", async () => {
    const onDestroyError = vi.fn();
    const manager = new SessionManager({
      create: (key) => ({ key }),
      destroy: (session) => {
        if (session.key === "bad") throw new Error("destroy failed");
      },
      idleTimeoutMs: 1,
      onDestroyError,
    });
    const bad = await manager.acquire("bad");
    const good = await manager.acquire("good");
    await bad.release();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(onDestroyError).toHaveBeenCalledTimes(1);
    expect(manager.get("bad")).toBeUndefined();
    expect(manager.getState("bad")).toBe("closing");
    expect(manager.get("good")).toBe(good.session);
    await expect(manager.acquire("bad")).rejects.toThrow("destroy failed");
    await expect(manager.closeAll()).rejects.toThrow("failed to close");
  });
});
