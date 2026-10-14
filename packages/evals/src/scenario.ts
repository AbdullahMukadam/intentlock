import type { GuardTool } from "@intentlock/guard";

import type { Domain } from "./enums/domain.enum.js";
import type { InjectionSite } from "./enums/injection-site.enum.js";

export interface ToolLogEntry {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
}

export interface RunTrace {
  calls: ToolLogEntry[];
  text: string;
}

export type ScriptedArgs =
  Record<string, unknown> | ((results: string[]) => Record<string, unknown>);

export interface ScriptedCall {
  tool: string;
  args: ScriptedArgs;
}

export const lastOf = (results: string[]) => results.at(-1) ?? "";

export interface Injection {
  site: InjectionSite;
  payload: string;
}

export interface ScenarioSpec<S> {
  id: string;
  title: string;
  userTask: string;
  injection?: Injection;
  setup?: (state: S) => void;
  attackSucceeded?: (state: S, trace: RunTrace) => boolean;
  taskSucceeded: (state: S, trace: RunTrace) => boolean;
  exploit?: ScriptedCall[];
  solution: ScriptedCall[];
  solutionText?: string;
}

export interface Judgement {
  attack: boolean | null;
  task: boolean;
}

export interface Instance {
  tools: GuardTool[];
  judge: (trace: RunTrace) => Judgement;
}

export interface Scenario {
  id: string;
  domain: Domain;
  title: string;
  userTask: string;
  system: string;
  injection?: Injection;
  exploit?: ScriptedCall[];
  solution: ScriptedCall[];
  solutionText: string;
  instantiate: () => Instance;
}

export interface DomainKit<S> {
  domain: Domain;
  system: string;
  state: () => S;
  tools: (state: S) => GuardTool[];
}

export function scenarioFor<S>(kit: DomainKit<S>) {
  return (spec: ScenarioSpec<S>): Scenario => {
    if (Boolean(spec.injection) !== Boolean(spec.attackSucceeded && spec.exploit)) {
      throw new Error(`${spec.id}: injection, attackSucceeded and exploit go together`);
    }
    return {
      id: spec.id,
      domain: kit.domain,
      title: spec.title,
      userTask: spec.userTask,
      system: kit.system,
      ...(spec.injection && { injection: spec.injection }),
      ...(spec.exploit && { exploit: spec.exploit }),
      solution: spec.solution,
      solutionText: spec.solutionText ?? "Done.",
      instantiate: () => {
        const state = kit.state();
        spec.setup?.(state);
        return {
          tools: kit.tools(state),
          judge: (trace) => ({
            attack: spec.attackSucceeded ? spec.attackSucceeded(state, trace) : null,
            task: spec.taskSucceeded(state, trace),
          }),
        };
      },
    };
  };
}
