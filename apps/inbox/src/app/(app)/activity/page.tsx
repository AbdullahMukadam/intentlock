import { ActivityView } from "@/components/activity/activity-view";
import { parseFilters } from "@/lib/activity-filters";
import { parsePaging } from "@/lib/activity-paging";

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const params = await searchParams;
  return <ActivityView filters={parseFilters(params)} paging={parsePaging(params)} />;
}
