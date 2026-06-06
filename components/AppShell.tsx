import { getSession } from "@/lib/auth/session";
import { AppNav } from "@/components/AppNav";
import { getDb, createPersonalWorkspace, listWorkspacesForUser } from "@/lib/db/index";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.user) return <>{children}</>;

  createPersonalWorkspace(getDb(), session.user.id);
  const workspaces = listWorkspacesForUser(getDb(), session.user.id);

  return (
    <>
      <AppNav user={session.user} workspaces={workspaces} />
      <main className="mx-auto max-w-6xl flex-1 bg-background px-4 py-6">{children}</main>
    </>
  );
}
