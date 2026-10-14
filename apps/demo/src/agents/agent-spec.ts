import type { FakeStep, GuardTool } from "@intentlock/guard";

export interface AgentSpec {
  system: string;
  task: string;
  tools: GuardTool[];
  forced: () => FakeStep[];
  summary: () => string[];
}
