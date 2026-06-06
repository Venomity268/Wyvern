import { QuickConnectForm } from "@/components/QuickConnectForm";

export default function QuickConnectPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Quick connect</h1>
        <p className="mt-1 text-sm text-muted">
          Jump into a session now. Save it as a workspace connection anytime from the session toolbar.
        </p>
      </div>
      <QuickConnectForm />
    </div>
  );
}
