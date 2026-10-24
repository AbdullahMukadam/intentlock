"use client";

import { Role, Verdict } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Checkbox } from "@intentlock/ui/components/checkbox";
import { Input } from "@intentlock/ui/components/input";
import { cn } from "@intentlock/ui/lib/utils";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from "lucide-react";

import { LooseInput } from "@/components/policy/loose-input";
import { Field, MatchFields } from "@/components/policy/match-fields";
import {
  DEFAULT_HOLD_TIMEOUT,
  type FormRule,
  joinList,
  ruleFitsForm,
  splitList,
} from "@/lib/policy-form";

const DECISIONS: Record<Verdict, { label: string; dot: string }> = {
  [Verdict.ALLOW]: { label: "Allow", dot: "bg-success" },
  [Verdict.BLOCK]: { label: "Block", dot: "bg-destructive" },
  [Verdict.HOLD]: { label: "Hold", dot: "bg-warning" },
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

function DecisionPicker({
  value,
  onChange,
  disabled,
}: {
  value: Verdict;
  onChange: (decision: Verdict) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Decision"
      className="inline-flex rounded-lg bg-muted p-[3px]"
    >
      {Object.values(Verdict).map((v) => {
        const selected = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none",
              selected && "bg-background text-foreground shadow-sm",
              disabled && !selected && "opacity-50",
            )}
          >
            <span className={cn("size-1.5 rounded-full", DECISIONS[v].dot)} />
            {DECISIONS[v].label}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  label,
  description,
  onRemove,
  removeLabel,
  children,
}: {
  label: string;
  description?: string;
  onRemove?: () => void;
  removeLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-6">
      <div className="flex items-start justify-between gap-2 sm:block">
        <div>
          <div className="text-[13px] font-medium">{label}</div>
          {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
        </div>
        {onRemove && (
          <Button
            variant="ghost"
            size="xs"
            aria-label={removeLabel}
            onClick={onRemove}
            className="-ml-2 text-muted-foreground sm:mt-1"
          >
            <X /> Remove
          </Button>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
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
        "min-w-0 rounded-xl border bg-card shadow-xs",
        dropTarget && "border-ring ring-2 ring-ring/30",
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
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
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground tabular-nums">
          {index + 1}
        </span>
        <Input
          aria-label="Rule name"
          value={rule.id}
          onChange={(e) => onChange({ ...rule, id: e.target.value })}
          disabled={locked}
          className="h-8 min-w-0 flex-1 basis-40 font-mono text-[13px] font-medium"
        />
        <DecisionPicker
          value={rule.decision}
          onChange={(decision) => onChange(withDecision(rule, decision))}
          disabled={locked}
        />
        {!readOnly && (
          <div className="ml-auto flex">
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
              className="text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </header>

      {!fits ? (
        <p className="m-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          This rule uses argument values the form can&apos;t show without changing them (lists or
          objects inside <code>eq</code>, quoted numbers). Edit it in YAML; it is kept as it is.
        </p>
      ) : (
        <div className="divide-y divide-dashed">
          <Section label="When" description="The call matches all of these.">
            <MatchFields
              match={rule.match}
              onChange={(match) => onChange({ ...rule, match })}
              readOnly={locked}
              idPrefix={`${rule.id}-match`}
              actions={
                rule.except === undefined && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onChange({ ...rule, except: {} })}
                  >
                    <Plus /> Exception
                  </Button>
                )
              }
            />
          </Section>
          {rule.except && (
            <Section
              label="Except when"
              description="The rule is skipped if these match."
              removeLabel="Remove exception"
              onRemove={
                locked
                  ? undefined
                  : () => {
                      const { except: _drop, ...rest } = rule;
                      onChange(rest);
                    }
              }
            >
              <MatchFields
                match={rule.except}
                onChange={(except) => onChange({ ...rule, except })}
                readOnly={locked}
                idPrefix={`${rule.id}-except`}
              />
            </Section>
          )}
          {rule.decision === Verdict.HOLD && (
            <Section label="Approval" description="Who can approve, and how long to wait.">
              <div className="grid gap-4">
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
                  {Role.options.map((role) => (
                    <label key={role} className="flex items-center gap-2 capitalize">
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
                      {role}s
                    </label>
                  ))}
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={approvers.self ?? false}
                      onCheckedChange={(on) => setApprovers({ self: on === true })}
                      disabled={locked}
                    />
                    The person the agent acts for
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <Field label="Approver emails" hint="Comma separated, on top of the roles above.">
                    <LooseInput
                      value={approvers.emails ?? []}
                      toText={joinList}
                      fromText={splitList}
                      onValue={(emails) => setApprovers({ emails })}
                      placeholder="None"
                      disabled={locked}
                      className="h-8"
                    />
                  </Field>
                  <Field label="Timeout (seconds)">
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
                  </Field>
                </div>
              </div>
            </Section>
          )}
          <Section label="Reason" description="Optional. Shown with the decision.">
            <Input
              aria-label="Reason"
              value={rule.reason ?? ""}
              onChange={(e) => {
                const { reason: _drop, ...rest } = rule;
                const reason = optional(e.target.value);
                onChange(reason === undefined ? rest : { ...rest, reason });
              }}
              placeholder="e.g. Deleting a repo needs a human"
              disabled={locked}
              className="h-8"
            />
          </Section>
        </div>
      )}
    </article>
  );
}
