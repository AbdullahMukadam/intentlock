/** Policy v1 of every new agent (ARCHITECTURE §5.8): default block, allow in-plan calls. */
export const STARTER_POLICY = `version: 1
default: block
rules:
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;
