import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-lg border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-red-100/80 text-red-700 dark:bg-red-900/30 dark:text-red-300 [a&]:hover:bg-red-200/80 dark:[a&]:hover:bg-red-900/40",
        warning:
          "border-transparent bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 [a&]:hover:bg-amber-200/80 dark:[a&]:hover:bg-amber-900/40",
        success:
          "border-transparent bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 [a&]:hover:bg-emerald-200/80 dark:[a&]:hover:bg-emerald-900/40",
        info:
          "border-transparent bg-blue-100/80 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 [a&]:hover:bg-blue-200/80 dark:[a&]:hover:bg-blue-900/40",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
