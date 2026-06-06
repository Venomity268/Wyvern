export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDb, createPersonalWorkspace, listWorkspacesForUser } from "@/lib/db/index";
import { getQuickSession } from "@/lib/quick-connect";
import { QuickSessionShell } from "@/components/QuickSessionShell";
import { SshSessionViewer, GuacamoleViewer } from "@/components/SessionViewerWrapper";
import { isGuacProtocol, type GuacProtocol } from "@/lib/protocols";

interface PageProps {
  params: Promise<{ quickId: string }>;
}

export default async function QuickConnectSessionPage({ params }: PageProps) {
  const { quickId } = await params;
  const session = await getSession();
  if (!session.user) notFound();

  const db = getDb();
  const quick = getQuickSession(db, session.user.id, quickId);
  if (!quick) notFound();

  createPersonalWorkspace(db, session.user.id);
  const workspaces = listWorkspacesForUser(db, session.user.id).map((ws) => ({
    id: ws.id,
    name: ws.name,
  }));

  const subtitle = `${quick.protocol.toUpperCase()} → ${quick.hostname}:${quick.port} · Quick session`;

  if (isGuacProtocol(quick.protocol)) {
    return (
      <QuickSessionShell
        title={quick.label}
        subtitle={subtitle}
        quickSessionId={quick.id}
        hostname={quick.hostname}
        protocol={quick.protocol}
        workspaces={workspaces}
      >
        <GuacamoleViewer
          quickSessionId={quick.id}
          connectionName={quick.label}
          hostname={quick.hostname}
          port={quick.port}
          protocol={quick.protocol as GuacProtocol}
          defaultUsername={quick.username}
          hasStoredCredential
          hasSshAccess={false}
          chromeless
        />
      </QuickSessionShell>
    );
  }

  return (
    <QuickSessionShell
      title={quick.label}
      subtitle={subtitle}
      quickSessionId={quick.id}
      hostname={quick.hostname}
      protocol={quick.protocol}
      workspaces={workspaces}
    >
      <SshSessionViewer
        quickSessionId={quick.id}
        connectionName={quick.label}
        hostname={quick.hostname}
        defaultUsername={quick.username}
        hasStoredCredential
        chromeless
      />
    </QuickSessionShell>
  );
}
