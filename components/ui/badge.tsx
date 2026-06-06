import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-accent text-accent-foreground",
        secondary: "border-transparent bg-muted/20 text-muted-foreground",
        success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
        destructive: "border-red-500/20 bg-red-500/10 text-red-400",
        outline: "border-border text-muted-foreground",
        ssh: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        vnc: "border-sky-500/20 bg-sky-500/10 text-sky-400",
        rdp: "border-violet-500/20 bg-violet-500/10 text-violet-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
