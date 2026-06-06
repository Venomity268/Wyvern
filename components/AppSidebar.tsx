"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  Plus,
  Settings,
  X,
  Zap,
} from "lucide-react";
import type { WorkspaceWithRole } from "@/lib/db/workspaces";
import { UserAvatar } from "@/components/UserAvatar";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

interface AppSidebarProps {
  user: {
    email: string;
    role: "user" | "admin";
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  workspaces: WorkspaceWithRole[];
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "touch-target-inline flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function NavSectionHeader({
  label,
  collapsed,
  action,
}: {
  label: string;
  collapsed: boolean;
  action?: React.ReactNode;
}) {
  if (collapsed) return null;

  return (
    <div className="mb-1 mt-4 flex items-center justify-between gap-2 px-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      {action}
    </div>
  );
}

export function AppSidebar({ user, workspaces }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const closeMobile = () => setMobileOpen(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const newWorkspaceActive = pathname === "/workspaces/new";

  function SidebarPanel({
    menuCollapsed,
    showMobileClose,
  }: {
    menuCollapsed: boolean;
    showMobileClose?: boolean;
  }) {
    return (
      <>
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-sidebar-border",
            menuCollapsed ? "justify-center px-2" : "justify-between px-3",
          )}
        >
          <Link
            href="/"
            onClick={closeMobile}
            className={cn(
              "flex items-center gap-2 font-semibold text-sidebar-foreground",
              menuCollapsed && "justify-center",
            )}
            title={APP_NAME}
          >
            {menuCollapsed ?
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                W
              </span>
            : <span className="text-lg tracking-tight">{APP_NAME}</span>}
          </Link>
          {showMobileClose ?
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={closeMobile}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </Button>
          : !menuCollapsed ?
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 text-muted-foreground lg:flex"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          : null}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <NavLink
            href="/"
            icon={Home}
            label="Home"
            active={pathname === "/"}
            collapsed={menuCollapsed}
            onClick={closeMobile}
          />

          <NavSectionHeader
            label="Workspaces"
            collapsed={menuCollapsed}
            action={
              <Link
                href="/workspaces/new"
                onClick={closeMobile}
                title="New workspace"
                aria-label="New workspace"
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  newWorkspaceActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {workspaces.map((ws) => (
            <NavLink
              key={ws.id}
              href={`/workspace/${ws.id}`}
              icon={FolderOpen}
              label={ws.name}
              active={pathname === `/workspace/${ws.id}`}
              collapsed={menuCollapsed}
              onClick={closeMobile}
            />
          ))}
          {menuCollapsed && (
            <NavLink
              href="/workspaces/new"
              icon={Plus}
              label="New workspace"
              active={newWorkspaceActive}
              collapsed={menuCollapsed}
              onClick={closeMobile}
            />
          )}

          <div className="mt-auto" />
          <NavLink
            href="/connect"
            icon={Zap}
            label="Quick connect"
            active={pathname === "/connect"}
            collapsed={menuCollapsed}
            onClick={closeMobile}
          />
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-2">
          {menuCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="mb-1 hidden h-8 w-8 text-muted-foreground lg:flex"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {!menuCollapsed && (
            <div className="mb-2 flex items-center gap-2 px-1">
              <UserAvatar
                displayName={user.displayName}
                email={user.email}
                avatarUrl={user.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {user.displayName || user.email}
                </p>
                {user.role === "admin" && (
                  <span className="inline-flex rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                    Admin
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-sidebar-foreground"
                onClick={() => {
                  closeMobile();
                  void logout();
                }}
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
          {menuCollapsed && (
            <div className="mb-2 hidden flex-col items-center gap-1 px-1 lg:flex">
              <UserAvatar
                displayName={user.displayName}
                email={user.email}
                avatarUrl={user.avatarUrl}
                size="sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground"
                onClick={() => {
                  closeMobile();
                  void logout();
                }}
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
          <NavLink
            href="/settings"
            icon={Settings}
            label="Settings"
            active={pathname === "/settings"}
            collapsed={menuCollapsed}
            onClick={closeMobile}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/" className="text-lg font-semibold text-foreground">
          {APP_NAME}
        </Link>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close navigation"
            onClick={closeMobile}
          />
          <aside className="relative flex h-full w-[min(100vw-3rem,18rem)] max-w-[85vw] flex-col bg-sidebar shadow-xl">
            <SidebarPanel menuCollapsed={false} showMobileClose />
          </aside>
        </div>
      )}

      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <SidebarPanel menuCollapsed={collapsed} />
      </aside>
    </>
  );
}
