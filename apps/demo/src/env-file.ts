import type { DemoAgent } from "./enums/demo-agent.enum.js";

export function keyVar(agent: DemoAgent) {
  return `INTENTLOCK_API_KEY_${agent.toUpperCase().replaceAll("-", "_")}`;
}

export function hasValue(text: string, key: string) {
  return new RegExp(`^${key}=\\S+`, "m").test(text);
}

export function upsertEnv(text: string, key: string, value: string) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, () => line);
  return `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
}
