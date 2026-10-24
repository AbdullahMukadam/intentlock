"use client";

import { type Match, Role } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Input } from "@intentlock/ui/components/input";
import { Plus, X } from "lucide-react";

import { NativeSelect } from "@/components/native-select";
import { LooseInput } from "@/components/policy/loose-input";
import { ArgOp } from "@/lib/enums/arg-op.enum";
import { InPlanChoice } from "@/lib/enums/in-plan-choice.enum";
import {
  type ArgRow,
  argRows,
  argsFromRows,
  inPlanChoice,
  inPlanValue,
  joinList,
  splitList,
  textFromValue,
  toolFromList,
  toolsOf,
  valueFromText,
} from "@/lib/policy-form";

const OP_LABELS: Record<ArgOp, string> = {
  [ArgOp.EQ]: "equals",
  [ArgOp.IN]: "is one of",
  [ArgOp.NOT_IN]: "is not one of",
  [ArgOp.GLOB]: "matches glob",
  [ArgOp.NOT_GLOB]: "does not match glob",
  [ArgOp.REGEX]: "matches regex",
  [ArgOp.LTE]: "≤",
  [ArgOp.GTE]: "≥",
};

const IN_PLAN_LABELS: Record<InPlanChoice, string> = {
  [InPlanChoice.ANY]: "In the plan or not",
  [InPlanChoice.IN_PLAN]: "Only calls in the plan",
  [InPlanChoice.OFF_PLAN]: "Only calls not in the plan",
};

const ANY_ROLE = "";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function compactMatch(match: Match): Match {
  return Object.fromEntries(Object.entries(match).filter(([, v]) => v !== undefined)) as Match;
}

export function MatchFields({
  match,
  onChange,
  readOnly,
  idPrefix,
}: {
  match: Match;
  onChange: (match: Match) => void;
  readOnly: boolean;
  idPrefix: string;
}) {
  const rows = argRows(match.args);
  const set = (patch: Partial<Match>) => onChange(compactMatch({ ...match, ...patch }));
  const setUser = (patch: NonNullable<Match["user"]>) => {
    const user = Object.fromEntries(
      Object.entries({ ...match.user, ...patch }).filter(([, v]) => v !== undefined && v !== ""),
    );
    set({ user: Object.keys(user).length > 0 ? user : undefined });
  };
  const setRows = (next: ArgRow[]) => set({ args: argsFromRows(next) });
  const setRow = (i: number, patch: Partial<ArgRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tools (comma separated, empty = any tool)">
          <LooseInput
            value={toolsOf(match)}
            toText={joinList}
            fromText={splitList}
            onValue={(tools) => set({ tool: toolFromList(tools) })}
            placeholder="any tool"
            disabled={readOnly}
            className="h-8 font-mono text-xs"
          />
        </Field>
        <Field label="Plan">
          <NativeSelect
            value={inPlanChoice(match)}
            onChange={(e) => set({ inPlan: inPlanValue(e.target.value as InPlanChoice) })}
            disabled={readOnly}
            className="w-full"
          >
            {Object.values(InPlanChoice).map((c) => (
              <option key={c} value={c}>
                {IN_PLAN_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="User email (glob)">
          <Input
            value={match.user?.email ?? ""}
            onChange={(e) => setUser({ email: e.target.value })}
            placeholder="any"
            disabled={readOnly}
            className="h-8"
          />
        </Field>
        <Field label="User role">
          <NativeSelect
            value={match.user?.role ?? ANY_ROLE}
            onChange={(e) =>
              setUser({ role: e.target.value === ANY_ROLE ? undefined : (e.target.value as Role) })
            }
            disabled={readOnly}
            className="w-full"
          >
            <option value={ANY_ROLE}>Any role</option>
            {Role.options.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="User group">
          <Input
            value={match.user?.group ?? ""}
            onChange={(e) => setUser({ group: e.target.value })}
            placeholder="any"
            disabled={readOnly}
            className="h-8"
          />
        </Field>
      </div>
      <div className="grid gap-2">
        <span className="text-xs text-muted-foreground">Arguments</span>
        {rows.map((row, i) => (
          <div
            key={`${idPrefix}-arg-${i}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_minmax(0,1.4fr)_auto]"
          >
            <Input
              aria-label="Argument name"
              value={row.name}
              onChange={(e) => setRow(i, { name: e.target.value })}
              placeholder="repo"
              disabled={readOnly}
              className="h-8 font-mono text-xs"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove argument condition"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              disabled={readOnly}
              className="sm:order-last"
            >
              <X />
            </Button>
            <NativeSelect
              aria-label="Condition"
              value={row.op}
              onChange={(e) => {
                const op = e.target.value as ArgOp;
                setRow(i, { op, value: valueFromText(op, textFromValue(row.op, row.value)) });
              }}
              disabled={readOnly}
              className="col-span-2 w-full sm:col-span-1"
            >
              {Object.values(ArgOp).map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </NativeSelect>
            <LooseInput
              aria-label="Value"
              key={row.op}
              value={row.value}
              toText={(v) => textFromValue(row.op, v)}
              fromText={(t) => valueFromText(row.op, t)}
              onValue={(value) => setRow(i, { value })}
              type={row.op === ArgOp.LTE || row.op === ArgOp.GTE ? "number" : "text"}
              placeholder={row.op === ArgOp.IN || row.op === ArgOp.NOT_IN ? "a, b, c" : "value"}
              disabled={readOnly}
              className="col-span-2 h-8 font-mono text-xs sm:col-span-1"
            />
          </div>
        ))}
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setRows([...rows, { name: "", op: ArgOp.EQ, value: "" }])}
          >
            <Plus /> Argument condition
          </Button>
        )}
      </div>
    </div>
  );
}
