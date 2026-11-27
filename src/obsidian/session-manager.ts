export interface SessionLease<T> {
  readonly session: T;
  release(): Promise<void>;
}

interface SessionEntry<T> {
  readonly key: string;
  readonly creation: Promise<T>;
  session?: T;
  leases: number;
  idleTimer?: ReturnType<typeof setTimeout>;
  closing?: Promise<void>;
}

export interface SessionManagerOptions<T> {
  create(key: string): T | Promise<T>;
  destroy(session: T): void | Promise<void>;
  idleTimeoutMs?: number;
  onDestroyError?: (key: string, error: unknown) => void;
}

export type SessionManagerState =
  | "creating"
  | "active"
  | "idle"
  | "closing"
  | "missing";

/**
 * Owns one in-memory session per key and gives each editor view an idempotent
 * lease. Releasing the final lease only schedules eviction; it never deletes
 * the session's persistent data.
 */
export class SessionManager<T> {
  private readonly entries = new Map<string, SessionEntry<T>>();
  private readonly createSession: SessionManagerOptions<T>["create"];
  private readonly destroySession: SessionManagerOptions<T>["destroy"];
  private readonly idleTimeoutMs: number;
  private readonly onDestroyError?: SessionManagerOptions<T>["onDestroyError"];
  private closed = false;

  constructor(options: SessionManagerOptions<T>) {
    this.createSession = options.create;
    this.destroySession = options.destroy;
    this.idleTimeoutMs = Math.max(0, options.idleTimeoutMs ?? 30_000);
    this.onDestroyError = options.onDestroyError;
  }

  async acquire(key: string): Promise<SessionLease<T>> {
    if (!key.trim()) throw new Error("Session key must not be empty");

    while (true) {
      if (this.closed) throw new Error("SessionManager is closed");

      let entry = this.entries.get(key);
      if (!entry) {
        let next!: SessionEntry<T>;
        const creation = Promise.resolve()
          .then(() => this.createSession(key))
          .then(
          (session) => {
            next.session = session;
            return session;
          },
          (error: unknown) => {
            if (this.entries.get(key) === next) this.entries.delete(key);
            throw error;
          },
        );
        next = { key, leases: 0, creation };
        this.entries.set(key, next);
        entry = next;
      }

      const pendingClose = this.getClosingPromise(entry);
      if (pendingClose) {
        await pendingClose;
        continue;
      }

      if (entry.idleTimer !== undefined) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = undefined;
      }

      let session: T;
      try {
        session = await entry.creation;
      } catch (error) {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        throw error;
      }

      if (this.closed) throw new Error("SessionManager is closed");
      const pendingCloseAfterCreate = this.getClosingPromise(entry);
      if (pendingCloseAfterCreate) {
        await pendingCloseAfterCreate;
        continue;
      }
      if (this.entries.get(key) !== entry) continue;

      entry.leases += 1;
      let released = false;
      return {
        session,
        release: async () => {
          if (released) return;
          released = true;
          await this.release(entry!);
        },
      };
    }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    return entry && !entry.closing ? entry.session : undefined;
  }

  list(): T[] {
    return [...this.entries.values()]
      .filter((entry) => entry.session !== undefined && !entry.closing)
      .map((entry) => entry.session!);
  }

  getLeaseCount(key: string): number {
    return this.entries.get(key)?.leases ?? 0;
  }

  getState(key: string): SessionManagerState {
    const entry = this.entries.get(key);
    if (!entry) return "missing";
    if (entry.closing) return "closing";
    if (!entry.session) return "creating";
    return entry.leases > 0 ? "active" : "idle";
  }

  private getClosingPromise(entry: SessionEntry<T>): Promise<void> | undefined {
    return entry.closing;
  }

  async closeAll(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const failures: unknown[] = [];

    await Promise.all([...this.entries.values()].map(async (entry) => {
      if (entry.idleTimer !== undefined) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = undefined;
      }
      try {
        await this.destroyEntry(entry);
      } catch (error) {
        failures.push(error);
        this.onDestroyError?.(entry.key, error);
      }
    }));

    this.entries.clear();
    if (failures.length) {
      throw new AggregateError(failures, "One or more sessions failed to close");
    }
  }

  private async release(entry: SessionEntry<T>): Promise<void> {
    if (this.entries.get(entry.key) !== entry || entry.leases === 0) return;
    entry.leases -= 1;
    if (entry.leases > 0) return;

    if (this.closed || this.idleTimeoutMs === 0) {
      await this.destroyEntry(entry);
      return;
    }

    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = undefined;
      if (entry.leases !== 0 || this.entries.get(entry.key) !== entry) return;
      void this.destroyEntry(entry).catch((error: unknown) => {
        this.onDestroyError?.(entry.key, error);
      });
    }, this.idleTimeoutMs);
  }

  private async destroyEntry(entry: SessionEntry<T>): Promise<void> {
    if (entry.idleTimer !== undefined) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }
    if (!entry.closing) {
      entry.closing = (async () => {
        const session = await entry.creation;
        await this.destroySession(session);
      })();
    }

    await entry.closing;
    if (this.entries.get(entry.key) === entry) {
      this.entries.delete(entry.key);
    }
  }
}
