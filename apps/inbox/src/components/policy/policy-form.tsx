"use client";

import { parsePolicy, policyToYaml, Verdict, yamlExtras } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RuleCard } from "@/components/policy/rule-card";
import {
  type FormPolicy,
  type FormRule,
  moveItem,
  newRuleId,
  toFormPolicy,
  toPolicyDraft,
} from "@/lib/policy-form";

export function PolicyForm({
  source,
  onChange,
  readOnly,
  onOpenYaml,
}: {
  source: string;
  onChange: (source: string) => void;
  readOnly: boolean;
  onOpenYaml: () => void;
}) {
  const [own, setOwn] = useState<{ yaml: string; policy: FormPolicy } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [confirmRewrite, setConfirmRewrite] = useState(false);

  const parsed = useMemo(() => (own?.yaml === source ? null : parsePolicy(source)), [own, source]);
  const policy =
    own?.yaml === source ? own.policy : parsed?.ok ? toFormPolicy(parsed.policy) : null;
  const extras = useMemo(() => yamlExtras(source), [source]);
  const hasExtras = extras.comments || extras.anchors;

  if (!policy) {
    return (
      <div className="grid justify-items-start gap-2 rounded-lg border border-dashed p-4 text-sm">
        <p>The YAML has errors, so the form can&apos;t show it. Fix the YAML first.</p>
        <Button variant="outline" size="sm" onClick={onOpenYaml}>
          Open YAML
        </Button>
      </div>
    );
  }

  const locked = readOnly || hasExtras;

  function commit(next: FormPolicy) {
    const yaml = policyToYaml(toPolicyDraft(next));
    setOwn({ yaml, policy: next });
    onChange(yaml);
  }

  const current = policy;
  const setRules = (rules: FormRule[]) => commit({ ...current, rules });
  const setRule = (i: number, rule: FormRule) =>
    setRules(current.rules.map((r, j) => (j === i ? rule : r)));

  function drop(to: number) {
    if (dragFrom !== null) setRules(moveItem(current.rules, dragFrom, to));
    setDragFrom(null);
    setDragOver(null);
  }

  return (
    <div className="grid min-w-0 gap-3">
      {hasExtras && !readOnly && (
        <div
          role="status"
          className="grid justify-items-start gap-2 rounded-lg border border-warning/40 bg-warning/8 p-3 text-sm"
        >
          <p>
            This policy uses YAML {extras.comments ? "comments" : ""}
            {extras.comments && extras.anchors ? " and " : ""}
            {extras.anchors ? "anchors" : ""}, which the form can&apos;t keep. Edit it in YAML, or
            let the form rewrite it without them.
          </p>
          <Button variant="outline" size="sm" onClick={() => setConfirmRewrite(true)}>
            Edit in form
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Rules are checked from the top; the first one that matches decides. Anything no rule matches
        is blocked.
      </p>
      {current.rules.map((rule, i) => (
        <RuleCard
          key={i}
          rule={rule}
          index={i}
          count={current.rules.length}
          readOnly={locked}
          dropTarget={dragOver === i && dragFrom !== null && dragFrom !== i}
          onChange={(next) => setRule(i, next)}
          onMove={(to) => setRules(moveItem(current.rules, i, to))}
          onRemove={() => setRules(current.rules.filter((_, j) => j !== i))}
          onDragStart={() => setDragFrom(i)}
          onDragOver={() => setDragOver(i)}
          onDrop={() => drop(i)}
        />
      ))}
      {!locked && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() =>
            setRules([
              ...current.rules,
              { id: newRuleId(current.rules), match: {}, decision: Verdict.BLOCK },
            ])
          }
        >
          <Plus /> Add rule
        </Button>
      )}
      <ConfirmDialog
        open={confirmRewrite}
        onOpenChange={setConfirmRewrite}
        title="Rewrite the YAML?"
        description="The form writes the policy in the standard layout. Comments and anchors are removed; the rules themselves stay the same. Nothing is published until you publish."
        confirmLabel="Rewrite and edit"
        destructive={false}
        onConfirm={async () => commit(current)}
      />
    </div>
  );
}
