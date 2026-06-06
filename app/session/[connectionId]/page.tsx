export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { canViewConnection } from "@/lib/auth/access";
import { getMethodPort, getMethodsForConnection } from "@/lib/db/connection-methods";
import { findEmbeddedSshTarget } from "@/lib/ssh/embedded-target";
import { SshSessionViewer, GuacamoleViewer } from "@/components/SessionViewerWrapper";
import { isGuacProtocol, type ConnectionProtocol, type GuacProtocol } from "@/lib/protocols";
import { sshAuthInfo, guacAuthInfo } from "@/lib/ssh/auth-info";

interface PageProps {
  params: Promise<{ connectionId: string }>;
  searchParams: Promise<{ via?: string }>;
}

export default async function SessionPage({ params, searchParams }: PageProps) {
  const { connectionId } = await params;
  const { via } = await searchParams;
  const session = await getSession();
  if (!session.user) notFound();

  const db = getDb();
  const connection = db
    .prepare("SELECT * FROM connections WHERE id = ?")
    .get(connectionId) as {
    id: string;
    name: string;
    hostname: string;
    port: number;
    protocol: string;
    username: string | null;
    credential_id: string | null;
    workspace_id: string;
    owner_id: string | null;
  } | undefined;

  if (
    !connection ||
    !canViewConnection(session.user, connection as Parameters<typeof canViewConnection>[1])
  ) {
    notFound();
  }

  const methods = getMethodsForConnection(db, connection.id).map((m) => ({
    protocol: m.protocol,
    port: m.port,
  }));

  const requested = via as ConnectionProtocol | undefined;
  let activeProtocol: ConnectionProtocol;

  if (requested && methods.some((m) => m.protocol === requested)) {
    activeProtocol = requested;
  } else if (methods.some((m) => m.protocol === connection.protocol)) {
    activeProtocol = connection.protocol as ConnectionProtocol;
  } else if (methods.length > 0) {
    activeProtocol = methods[0].protocol;
  } else {
    activeProtocol = connection.protocol as ConnectionProtocol;
  }

  const activePort =
    getMethodPort(db, connection.id, activeProtocol) ??
    methods.find((m) => m.protocol === activeProtocol)?.port ??
    connection.port;

  const sshTarget = findEmbeddedSshTarget(db, session.user.id, connection);
  const sshAuth = sshTarget
    ? sshAuthInfo({
        id: sshTarget.connectionId,
        username: sshTarget.username,
        credential_id: sshTarget.credential_id,
      })
    : { defaultUsername: null, hasStoredCredential: false };
  const hasSshAccess = !!sshTarget;

  if (isGuacProtocol(activeProtocol)) {
    const guacAuth = guacAuthInfo(connection, activeProtocol);

    return (
      <GuacamoleViewer
        connectionId={connection.id}
        sshConnectionId={sshTarget?.connectionId}
        sshConnectionName={sshTarget?.name}
        connectionName={connection.name}
        hostname={connection.hostname}
        port={activePort}
        protocol={activeProtocol as GuacProtocol}
        defaultUsername={guacAuth.defaultUsername}
        hasStoredCredential={guacAuth.hasStoredCredential}
        hasSshAccess={hasSshAccess}
        sshDefaultUsername={sshAuth.defaultUsername}
        sshHasStoredCredential={sshAuth.hasStoredCredential}
      />
    );
  }

  return (
    <SshSessionViewer
      connectionId={connection.id}
      connectionName={connection.name}
      hostname={connection.hostname}
      defaultUsername={sshAuth.defaultUsername}
      hasStoredCredential={sshAuth.hasStoredCredential}
    />
  );
}
