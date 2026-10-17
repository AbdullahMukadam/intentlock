const SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

export function onShutdown(close: () => Promise<void>): () => void {
  const handler = (signal: NodeJS.Signals) => {
    unregister();
    close()
      .catch(() => undefined)
      .finally(() => process.kill(process.pid, signal));
  };
  const unregister = () => {
    for (const s of SIGNALS) process.off(s, handler);
  };
  for (const s of SIGNALS) process.once(s, handler);
  return unregister;
}
