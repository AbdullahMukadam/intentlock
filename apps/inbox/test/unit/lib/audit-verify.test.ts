import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";

import { auditVerifyQuery } from "../../../src/lib/audit-verify";

const RESULT = { ok: true, count: 42, flagged: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("auditVerifyQuery", () => {
  test("keeps the last result after the page unmounts and shows it on return without verifying again", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => Response.json(RESULT));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient();

    const first = new QueryObserver(client, auditVerifyQuery);
    const unsubscribe = first.subscribe(() => undefined);
    expect(fetchMock).not.toHaveBeenCalled();
    await first.refetch();
    unsubscribe();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    const back = new QueryObserver(client, auditVerifyQuery);
    back.subscribe(() => undefined);
    expect(back.getCurrentResult().data).toMatchObject({ ok: true, count: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("never verifies on its own", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const observer = new QueryObserver(new QueryClient(), auditVerifyQuery);
    observer.subscribe(() => undefined);
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
