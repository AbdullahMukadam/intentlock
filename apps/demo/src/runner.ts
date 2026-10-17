import { buildAgent } from "./build-agent.js";
import { DemoAgent } from "./enums/demo-agent.enum.js";
import { RunnerEventKind } from "./enums/runner-event-kind.enum.js";
import { loadEnv } from "./env.js";
import { createRunner } from "./runner-server.js";

const HOST = "127.0.0.1";
const env = loadEnv();
const port = Number(process.env.DEMO_RUNNER_PORT ?? 8790);

const server = createRunner(async (mode, emit) => {
  const built = buildAgent({
    agent: DemoAgent.GITHUB_ASSISTANT,
    mode,
    env,
    onEvent: (event) => emit({ kind: RunnerEventKind.GUARD, event }),
  });
  emit({ kind: RunnerEventKind.STARTED, task: built.task, forced: built.forced });
  try {
    const result = await built.run();
    emit({ kind: RunnerEventKind.FINISHED, status: result.status, text: result.text ?? null });
  } finally {
    await built.close();
  }
});

server.on("error", (err) => {
  console.error(`Cannot start the demo runner on ${HOST}:${port}: ${err.message}`);
  process.exitCode = 1;
});

server.listen(port, HOST, () => {
  console.log(`demo runner on http://${HOST}:${port} (open /demo in the inbox)`);
});
