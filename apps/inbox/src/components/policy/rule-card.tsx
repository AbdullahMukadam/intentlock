"use client";

import { Role, Verdict } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Checkbox } from "@intentlock/ui/components/checkbox";
import { Input } from "@intentlock/ui/components/input";
import { cn } from "@intentlock/ui/lib/utils";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";

import { NativeSelect } from "@/components/native-select";
import { LooseInput } from "@/components/policy/loose-input";
import { MatchFields } from "@/components/policy/match-fields";
import {
  DEFAULT_HOLD_TIMEOUT,
  type FormRule,
  joinList,
  ruleFitsForm,
  splitList,
} from "@/lib/policy-form";

const DECISION_LABELS: Record<Verdict, string> = {
  [Verdict.ALLOW]: "Allow",
  [Verdict.BLOCK]: "Block",
  [Verdict.HOLD]: "Hold for approval",
};

function withDecision(rule: FormRule, decision: Verdict): FormRule {
  const { approvers, timeoutSeconds, ...rest } = rule;
  if (decision !== Verdict.HOLD) return { ...rest, decision };
  return {
    ...rest,
    decision,
    approvers: approvers ?? { roles: [Role.enum.approver] },
    timeoutSeconds: timeoutSeconds ?? DEFAULT_HOLD_TIMEOUT,
  };
}

function optional(value: string): string | undefined {
  return value === "" ? undefined : value;
}

export function RuleCard({
  rule,
  index,
  count,
  readOnly,
  dropTarget,
  onChange,
  onMove,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  rule: FormRule;
  index: number;
  count: number;
  readOnly: boolean;
  dropTarget: boolean;
  onChange: (rule: FormRule) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const fits = ruleFitsForm(rule);
  const locked = readOnly || !fits;
  const approvers = rule.approvers ?? {};
  const setApprovers = (patch: Partial<typeof approvers>) =>
    onChange({ ...rule, approvers: { ...approvers, ...patch } });

  return (
    <article
      aria-label={`Rule ${index + 1}: ${rule.id}`}
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "grid min-w-0 gap-3 rounded-lg border bg-card p-3",
        dropTarget && "border-ring ring-2 ring-ring/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(index));
              onDragStart();
            }}
            role="img"
            aria-label="Drag to reorder"
            className="cursor-grab text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </span>
        )}
        <span className="w-5 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
        <Input
          aria-label="Rule id"
          value={rule.id}
          onChange={(e) => onChange({ ...rule, id: e.target.value })}
          disabled={locked}
          className="h-8 min-w-0 flex-1 basis-40 font-mono text-xs"
        />
        <NativeSelect
          aria-label="Decision"
          value={rule.decision}
          onChange={(e) => onChange(withDecision(rule, e.target.value as Verdict))}
          disabled={locked}
          className="basis-40"
        >
          {Object.values(Verdict).map((v) => (
            <option key={v} value={v}>
              {DECISION_LABELS[v]}
            </option>
          ))}
        </NativeSelect>
        {!readOnly && (
          <div className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => onMove(index - 1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move down"
              disabled={index === count - 1}
              onClick={() => onMove(index + 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete rule"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {!fits ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          This rule uses argument values the form can&apos;t show without changing them (lists or
          objects inside <code>eq</code>, quoted numbers). Edit it in YAML; it is kept as it is.
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            <span className="text-xs font-medium">When a call matches</span>
            <MatchFields
              match={rule.match}
              onChange={(match) => onChange({ ...rule, match })}
              readOnly={locked}
              idPrefix={`${rule.id}-match`}
            />
          </div>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox
                checked={rule.except !== undefined}
                onCheckedChange={(on) => {
                  const { except: _drop, ...rest } = rule;
                  onChange(on ? { ...rest, except: {} } : rest);
                }}
                disabled={locked}
              />
              Except when
            </label>
            {rule.except && (
              <div className="border-l-2 pl-3">
                <MatchFields
                  match={rule.except}
                  onChange={(except) => onChange({ ...rule, except })}
                  readOnly={locked}
                  idPrefix={`${rule.id}-except`}
                />
              </div>
            )}
          </div>
          {rule.decision === Verdict.HOLD && (
            <div className="grid gap-3 rounded-md border border-dashed p-3">
              <span className="text-xs font-medium">Who may approve</span>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                {Role.options.map((role) => (
                  <label key={role} className="flex items-center gap-1.5">
                    <Checkbox
                      checked={approvers.roles?.includes(role) ?? false}
                      onCheckedChange={(on) =>
                        setApprovers({
                          roles: on
                            ? [...(approvers.roles ?? []), role]
                            : (approvers.roles ?? []).filter((r) => r !== role),
                        })
                      }
                      disabled={locked}
                    />
                    {role}
                  </label>
                ))}
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={approvers.self ?? false}
                    onCheckedChange={(on) => setApprovers({ self: on === true })}
                    disabled={locked}
                  />
                  the person the agent acts for
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <label className="grid min-w-0 gap-1 text-xs">
                  <span className="text-muted-foreground">Approver emails (comma separated)</span>
                  <LooseInput
                    value={approvers.emails ?? []}
                    toText={joinList}
                    fromText={splitList}
                    onValue={(emails) => setApprovers({ emails })}
                    placeholder="none"
                    disabled={locked}
                    className="h-8"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="text-muted-foreground">Timeout (seconds)</span>
                  <LooseInput
                    value={rule.timeoutSeconds ?? DEFAULT_HOLD_TIMEOUT}
                    toText={String}
                    fromText={Number}
                    onValue={(timeoutSeconds) => onChange({ ...rule, timeoutSeconds })}
                    type="number"
                    min={1}
                    max={86400}
                    disabled={locked}
                    className="h-8"
                  />
                </label>
              </div>
            </div>
          )}
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Reason (optional)</span>
            <Input
              value={rule.reason ?? ""}
              onChange={(e) => {
                const { reason: _drop, ...rest } = rule;
                const reason = optional(e.target.value);
                onChange(reason === undefined ? rest : { ...rest, reason });
              }}
              disabled={locked}
              className="h-8"
            />
          </label>
        </>
      )}
    </article>
  );
}
