import { IntentlockError } from "@intentlock/core";

import type { ChatRequest, ChatResponse, LLMProvider } from "./types.js";

export type FakeStep = ChatResponse | ((req: ChatRequest) => ChatResponse | Promise<ChatResponse>);

export class FakeProvider implements LLMProvider {
  readonly name = "fake";
  readonly requests: ChatRequest[] = [];
  readonly #script: FakeStep[];

  constructor(script: FakeStep[] = []) {
    this.#script = [...script];
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.requests.push(structuredClone(req));
    const step = this.#script.shift();
    if (!step) throw new IntentlockError("FakeProvider script exhausted");
    return typeof step === "function" ? step(req) : step;
  }
}
