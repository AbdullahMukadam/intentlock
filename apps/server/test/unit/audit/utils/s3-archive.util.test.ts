import { S3Archive } from "../../../../src/audit/utils/s3-archive.util.js";

describe("S3Archive", () => {
  it("puts and gets path-style objects under the bucket URL with a SigV4 signature", async () => {
    const stored = new Map<string, Uint8Array>();
    const calls: { method: string; url: string; auth: string | undefined }[] = [];
    const fakeFetch = (async (input: URL | string, init?: RequestInit) => {
      const url = String(input);
      const headers = init?.headers as Record<string, string>;
      calls.push({ method: init?.method ?? "GET", url, auth: headers.authorization });
      if (init?.method === "PUT") {
        stored.set(url, init.body as Uint8Array);
        return new Response(null, { status: 200 });
      }
      const body = stored.get(url);
      return body ? new Response(body) : new Response(null, { status: 404 });
    }) as typeof fetch;
    const archive = new S3Archive({
      bucketUrl: "https://acct.r2.cloudflarestorage.com/audit/",
      region: "auto",
      accessKeyId: "AKID",
      secretAccessKey: "secret",
      fetch: fakeFetch,
    });
    const data = new TextEncoder().encode('{"seq":1}\n');
    await archive.put("audit-1-1.jsonl", data);
    expect(new TextDecoder().decode(await archive.get("audit-1-1.jsonl"))).toBe('{"seq":1}\n');
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["PUT", "https://acct.r2.cloudflarestorage.com/audit/audit-1-1.jsonl"],
      ["GET", "https://acct.r2.cloudflarestorage.com/audit/audit-1-1.jsonl"],
    ]);
    expect(calls[0]?.auth).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request/,
    );
    await expect(archive.get("missing.jsonl")).rejects.toThrow(/HTTP 404/);
  });
});
