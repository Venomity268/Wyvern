import { QuickConnectForm } from "@/components/QuickConnectForm";
import { PageHeader } from "@/components/layout/PageHeader";

export default function QuickConnectPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Quick connect"
        description="Jump into a session now. Save it as a workspace connection anytime from the session toolbar."
      />
      <QuickConnectForm />
    </div>
  );
}
