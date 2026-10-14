import { ActivityView } from "@/components/activity/activity-view";
import { parseFilters } from "@/lib/activity-filters";

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  return <ActivityView filters={parseFilters(await searchParams)} />;
}
