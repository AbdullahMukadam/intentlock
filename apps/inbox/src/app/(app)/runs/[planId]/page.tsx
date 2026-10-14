import { RunTimeline } from "@/components/runs/run-timeline";

export default async function RunPage({ params }: PageProps<"/runs/[planId]">) {
  const { planId } = await params;
  return <RunTimeline planId={planId} />;
}
