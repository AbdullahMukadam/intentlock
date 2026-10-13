import { expect, test } from "vitest";

import { MessageRole } from "./enums/message-role.enum.js";
import { FakeProvider } from "./fake.js";

test("replays the script in order, records requests, then throws", async () => {
  const fake = new FakeProvider([
    { toolCalls: [{ id: "1", name: "a", args: {} }] },
    (req) => ({ text: `saw ${req.messages.length}`, toolCalls: [] }),
  ]);
  const req = { messages: [{ role: MessageRole.USER as const, text: "hi" }], tools: [] };
  expect((await fake.chat(req)).toolCalls[0]?.name).toBe("a");
  expect((await fake.chat(req)).text).toBe("saw 1");
  await expect(fake.chat(req)).rejects.toThrow(/exhausted/);
  expect(fake.requests).toHaveLength(3);
});
