import { HoldList } from "@/components/holds/hold-list";
import { PageHeader } from "@/components/page-header";
import { parseHoldFilters } from "@/lib/hold-filters";

export default async function HoldsPage({ searchParams }: PageProps<"/holds">) {
  const filters = parseHoldFilters(await searchParams);
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Holds"
        description="Tool calls a policy paused for a person to approve. Agents wait here until someone approves, rejects, or the hold times out."
      />
      <HoldList key={JSON.stringify(filters)} filters={filters} />
    </div>
  );
}
