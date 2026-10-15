import { VerifyButton } from "@/components/audit/verify-button";
import { PageHeader } from "@/components/page-header";

export default function AuditPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Audit"
        description="Every decision, approval and admin change is appended to one hash chain. Verify it here, or export it and verify offline with the CLI."
      />
      <VerifyButton />
    </div>
  );
}
