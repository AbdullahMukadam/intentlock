import { AgentDetail } from "@/components/agents/agent-detail";
import { AgentTab } from "@/lib/enums/agent-tab.enum";

const TABS = new Set<string>(Object.values(AgentTab));

export default async function AgentPage({ params, searchParams }: PageProps<"/agents/[id]">) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const selected = typeof tab === "string" && TABS.has(tab) ? (tab as AgentTab) : AgentTab.OVERVIEW;
  return <AgentDetail agentId={id} tab={selected} />;
}
