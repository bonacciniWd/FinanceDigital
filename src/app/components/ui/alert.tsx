import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const alertVariants = cva(
  "relative w-full rounded-xl border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current backdrop-blur-sm",
  {
    variants: {
      variant: {
        default: "bg-card/80 text-card-foreground border-border",
        destructive:
          "bg-red-50/80 dark:bg-red-950/30 text-red-900 dark:text-red-100 border-red-200 dark:border-red-800/50 [&>svg]:text-red-500 *:data-[slot=alert-description]:text-red-800/90 dark:*:data-[slot=alert-description]:text-red-200/90",
        warning:
          "bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800/50 [&>svg]:text-amber-500 *:data-[slot=alert-description]:text-amber-800/90 dark:*:data-[slot=alert-description]:text-amber-200/90",
        success:
          "bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800/50 [&>svg]:text-emerald-500 *:data-[slot=alert-description]:text-emerald-800/90 dark:*:data-[slot=alert-description]:text-emerald-200/90",
        info:
          "bg-blue-50/80 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800/50 [&>svg]:text-blue-500 *:data-[slot=alert-description]:text-blue-800/90 dark:*:data-[slot=alert-description]:text-blue-200/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
