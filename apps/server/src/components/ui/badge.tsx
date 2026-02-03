import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/app/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary/15 text-primary border border-primary/20",
        secondary:
          "bg-secondary text-secondary-foreground border border-border",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/20",
        outline:
          "text-foreground border border-border",
        success:
          "bg-green-500/15 text-green-400 border border-green-500/20",
        warning:
          "bg-amber-500/15 text-amber-400 border border-amber-500/20",
        online:
          "bg-green-500/15 text-green-400 border border-green-500/20",
        offline:
          "bg-muted text-muted-foreground border border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
