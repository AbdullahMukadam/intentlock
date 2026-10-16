import { setTimeout as sleep } from "node:timers/promises";

const ATTEMPTS = 3;
const FIRST_DELAY_MS = 200;
const SERVER_ERROR_FROM = 500;

export function retryingFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    for (let attempt = 1; ; attempt++) {
      const last = attempt === ATTEMPTS;
      try {
        const res = await fetchImpl(input, init);
        if (res.status < SERVER_ERROR_FROM || last) return res;
        await res.body?.cancel();
      } catch (err) {
        if (last || init?.signal?.aborted) throw err;
      }
      await sleep(FIRST_DELAY_MS * 2 ** (attempt - 1));
    }
  };
}
