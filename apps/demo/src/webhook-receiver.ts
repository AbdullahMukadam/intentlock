import { createServer, type Server } from "node:http";

export const COLLECT_PATH = "/collect";
const MAX_BODY_BYTES = 1_000_000;

export interface Received {
  at: string;
  method: string;
  path: string;
  body: string;
}

export function createReceiver(onReceive: (r: Received) => void = () => {}): {
  server: Server;
  received: Received[];
} {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size <= MAX_BODY_BYTES) chunks.push(c);
    });
    req.on("end", () => {
      const r = {
        at: new Date().toISOString(),
        method: req.method ?? "",
        path: req.url ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
      };
      received.push(r);
      onReceive(r);
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    });
  });
  return { server, received };
}
