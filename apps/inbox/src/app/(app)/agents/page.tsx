import { AgentList } from "@/components/agents/agent-list";

export default function AgentsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Agents</h1>
      <AgentList />
    </div>
  );
}
