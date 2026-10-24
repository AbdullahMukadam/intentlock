import { Document, isAlias, isMap, isNode, parseDocument, visit } from "yaml";
import type { z } from "zod";

import type { PolicySet } from "../schemas/policy.js";

export type PolicyDraft = z.input<typeof PolicySet>;
type RuleDraft = PolicyDraft["rules"][number];

const FLOW_KEYS = ["match", "except", "approvers"];

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function approversOf(rule: RuleDraft) {
  if (!("approvers" in rule) || !rule.approvers) return undefined;
  const { roles, emails, self } = rule.approvers;
  return compact({
    roles: roles?.length ? roles : undefined,
    emails: emails?.length ? emails : undefined,
    self: self ? true : undefined,
  });
}

function orderRule(rule: RuleDraft) {
  return compact({
    id: rule.id,
    match: compact(rule.match),
    except: rule.except ? compact(rule.except) : undefined,
    decision: rule.decision,
    approvers: approversOf(rule),
    timeoutSeconds: "timeoutSeconds" in rule ? rule.timeoutSeconds : undefined,
    reason: rule.reason,
  });
}

export function policyToYaml(policy: PolicyDraft): string {
  const doc = new Document({
    version: policy.version,
    default: policy.default,
    rules: policy.rules.map(orderRule),
  });
  visit(doc, {
    Pair(_, pair) {
      if (isNode(pair.key) && FLOW_KEYS.includes(String(pair.key.toJSON())) && isMap(pair.value)) {
        pair.value.flow = true;
      }
    },
  });
  return doc.toString({ lineWidth: 0 });
}

export interface YamlExtras {
  comments: boolean;
  anchors: boolean;
}

export function yamlExtras(source: string): YamlExtras {
  const doc = parseDocument(source);
  let comments = Boolean(doc.commentBefore || doc.comment);
  let anchors = false;
  visit(doc, (_, node) => {
    if (isAlias(node)) anchors = true;
    else if (isNode(node)) {
      if (node.anchor) anchors = true;
      if (node.comment || node.commentBefore) comments = true;
    }
  });
  return { comments, anchors };
}
