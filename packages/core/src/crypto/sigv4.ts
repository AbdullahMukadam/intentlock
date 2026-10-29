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
const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesOf(data: string | Uint8Array): Uint8Array<ArrayBuffer> {
  return typeof data === "string" ? encoder.encode(data) : new Uint8Array(data);
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytesOf(data)));
}

async function hmac(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const raw = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

export async function signV4(input: SigV4Input): Promise<Record<string, string>> {
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
  const toSign = [ALGORITHM, amzDate, scope, await sha256Hex(canonical)].join("\n");
  const dayKey = await hmac(`AWS4${input.secretAccessKey}`, day);
  const regionKey = await hmac(dayKey, input.region);
  const serviceKey = await hmac(regionKey, input.service);
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, toSign));
  const { host: _host, ...rest } = headers;
  return {
    ...rest,
    authorization: `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
