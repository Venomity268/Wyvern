import { getSession } from "@/lib/auth/session";
import { AppSidebar } from "@/components/AppSidebar";
import { avatarUrlForUser } from "@/lib/auth/avatar";
import { getDb, createPersonalWorkspace, listWorkspacesForUser } from "@/lib/db/index";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.user) return <>{children}</>;

  createPersonalWorkspace(getDb(), session.user.id);
  const workspaces = listWorkspacesForUser(getDb(), session.user.id);

  const profile = getDb()
    .prepare("SELECT avatar_updated_at FROM users WHERE id = ?")
    .get(session.user.id) as { avatar_updated_at: string | null } | undefined;

  const user = {
    ...session.user,
    avatarUrl: avatarUrlForUser(session.user.id, profile?.avatar_updated_at),
  };

  return (
    <div className="flex min-h-dvh flex-col lg:min-h-screen lg:flex-row">
      <AppSidebar user={user} workspaces={workspaces} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
