"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SessionToolButtonProps {
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

export function SessionToolButton({
  active,
  destructive,
  disabled,
  title,
  onClick,
  children,
  className,
}: SessionToolButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      disabled={disabled}
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "h-8 w-8 shrink-0",
        destructive ?
          "text-destructive hover:bg-destructive/10 hover:text-destructive"
        : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </Button>
  );
}

export function SessionToolDivider() {
  return <span aria-hidden className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />;
}
