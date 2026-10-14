import { afterEach, expect, test, vi } from "vitest";

import { onShutdown } from "../../src/shutdown.js";

afterEach(() => vi.restoreAllMocks());

test("SIGTERM flushes once, then re-raises the signal", async () => {
  const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
  const close = vi.fn(async () => {});
  onShutdown(close);
  process.emit("SIGTERM", "SIGTERM");
  process.emit("SIGTERM", "SIGTERM");
  await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(process.pid, "SIGTERM"));
  expect(close).toHaveBeenCalledOnce();
});

test("unregistering removes the handlers", () => {
  const before = process.listenerCount("SIGINT");
  const unregister = onShutdown(async () => {});
  expect(process.listenerCount("SIGINT")).toBe(before + 1);
  unregister();
  expect(process.listenerCount("SIGINT")).toBe(before);
});
