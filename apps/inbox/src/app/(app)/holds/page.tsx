import { HoldList } from "@/components/holds/hold-list";

export default function HoldsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Holds</h1>
      <HoldList />
    </div>
  );
}
