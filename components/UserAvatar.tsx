"use client";

import { cn } from "@/lib/utils";
import { userInitials } from "@/lib/user-display";

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-xl",
} as const;

interface UserAvatarProps {
  displayName?: string | null;
  email: string;
  avatarUrl?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
}

export function UserAvatar({
  displayName,
  email,
  avatarUrl,
  size = "sm",
  className,
}: UserAvatarProps) {
  const initials = userInitials(displayName, email);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-primary/15 font-semibold text-primary",
        sizeClasses[size],
        className,
      )}
      aria-hidden={!!avatarUrl}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">{initials}</span>
      )}
    </div>
  );
}
