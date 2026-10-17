import { createReceiver } from "./webhook-receiver.js";

const HOST = "127.0.0.1";
const port = Number(process.env.DEMO_RECEIVER_PORT ?? 8787);

const { server } = createReceiver((r) => {
  console.log(`${r.at.slice(11, 19)} RECEIVED ${r.method} ${r.path} (${r.body.length} bytes)`);
  if (r.body) console.log(r.body.slice(0, 2000));
});

server.on("error", (err) => {
  console.error(`Cannot start the webhook receiver on ${HOST}:${port}: ${err.message}`);
  process.exitCode = 1;
});

server.listen(port, HOST, () => {
  console.log(`webhook receiver on http://${HOST}:${port}; anything that arrives is printed here`);
});
