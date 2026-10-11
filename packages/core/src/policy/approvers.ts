import type { ApproverSpec, Role } from "../schemas/policy.js";

export interface Approver {
  email: string;
  role: Role;
}

// Separation of duties: the requester may approve only when the spec says self: true.
export function canApprove(
  spec: ApproverSpec,
  approver: Approver,
  requesterEmail: string,
): boolean {
  const email = approver.email.toLowerCase();
  if (email === requesterEmail.toLowerCase()) return spec.self;
  return spec.roles.includes(approver.role) || spec.emails.some((e) => e.toLowerCase() === email);
}
