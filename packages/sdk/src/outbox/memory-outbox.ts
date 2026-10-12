import { chainClientEntry, type ClientEntry, type NewClientEntry } from "@intentlock/core";

export interface PlanBacklog {
  planId: string;
  entries: ClientEntry[];
}

type PlanState = {
  last: ClientEntry | null;
  pending: ClientEntry[];
  done: boolean;
  queue: Promise<unknown>;
};

export class MemoryOutbox {
  protected readonly plans = new Map<string, PlanState>();

  async recover(): Promise<PlanBacklog[]> {
    return [];
  }

  append(planId: string, entry: NewClientEntry): Promise<ClientEntry> {
    const state = this.state(planId);
    const next = state.queue.then(async () => {
      const chained = await chainClientEntry(state.last, entry);
      await this.persistEntry(planId, chained);
      state.last = chained;
      state.pending.push(chained);
      return chained;
    });
    state.queue = next.catch(() => undefined);
    return next;
  }

  pending(maxPerPlan: number): PlanBacklog[] {
    return [...this.plans]
      .filter(([, s]) => s.pending.length > 0)
      .map(([planId, s]) => ({ planId, entries: s.pending.slice(0, maxPerPlan) }));
  }

  async ack(planId: string, clientSeq: number): Promise<void> {
    const state = this.plans.get(planId);
    if (!state) return;
    state.pending = state.pending.filter((e) => e.clientSeq > clientSeq);
    await this.persistAck(planId, clientSeq);
    await this.removeIfFinished(planId, state);
  }

  async complete(planId: string): Promise<void> {
    const state = this.state(planId);
    state.done = true;
    await this.persistDone(planId);
    await this.removeIfFinished(planId, state);
  }

  unackedCount(): number {
    let n = 0;
    for (const s of this.plans.values()) n += s.pending.length;
    return n;
  }

  oldestUnackedAt(): number | null {
    let oldest: number | null = null;
    for (const s of this.plans.values()) {
      const first = s.pending[0];
      if (first) oldest = Math.min(oldest ?? Infinity, Date.parse(first.clientAt));
    }
    return oldest;
  }

  protected state(planId: string): PlanState {
    let s = this.plans.get(planId);
    if (!s) {
      s = { last: null, pending: [], done: false, queue: Promise.resolve() };
      this.plans.set(planId, s);
    }
    return s;
  }

  private async removeIfFinished(planId: string, state: PlanState) {
    if (!state.done || state.pending.length > 0) return;
    this.plans.delete(planId);
    await this.remove(planId);
  }

  protected async persistEntry(_planId: string, _entry: ClientEntry): Promise<void> {}
  protected async persistAck(_planId: string, _clientSeq: number): Promise<void> {}
  protected async persistDone(_planId: string): Promise<void> {}
  protected async remove(_planId: string): Promise<void> {}
}
