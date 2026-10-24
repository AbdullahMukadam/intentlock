import { createHash, createHmac } from "node:crypto";

export interface SigV4Input {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  now: Date;
}

const ALGORITHM = "AWS4-HMAC-SHA256";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

export function signV4(input: SigV4Input): Record<string, string> {
  const amzDate = input.now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v])),
    host: input.url.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate,
    ...(input.sessionToken !== undefined && { "x-amz-security-token": input.sessionToken }),
  };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const canonical = [
    input.method,
    input.url.pathname,
    input.url.searchParams.toString(),
    ...names.map((n) => `${n}:${headers[n]!.trim()}`),
    "",
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = [ALGORITHM, amzDate, scope, sha256Hex(canonical)].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  const { host: _host, ...rest } = headers;
  return {
    ...rest,
    authorization: `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
