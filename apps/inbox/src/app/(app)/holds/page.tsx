import { HoldList } from "@/components/holds/hold-list";
import { PageHeader } from "@/components/page-header";

export default function HoldsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Holds"
        description="Tool calls a policy paused for a person to approve. Agents wait here until someone approves, rejects, or the hold times out."
      />
      <HoldList />
    </div>
  );
}
