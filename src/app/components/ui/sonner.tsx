"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast glass-popover !rounded-xl !border-0 !shadow-lg !text-foreground",
          title: "!text-foreground !font-semibold",
          description: "!text-muted-foreground",
          actionButton:
            "!bg-primary !text-primary-foreground !rounded-lg !font-medium",
          cancelButton:
            "!bg-muted !text-muted-foreground !rounded-lg !font-medium",
          success:
            "!border-l-4 !border-l-emerald-500 !bg-emerald-50/80 dark:!bg-emerald-950/40 !text-emerald-900 dark:!text-emerald-100 [&>[data-icon]]:!text-emerald-500",
          error:
            "!border-l-4 !border-l-red-500 !bg-red-50/80 dark:!bg-red-950/40 !text-red-900 dark:!text-red-100 [&>[data-icon]]:!text-red-500",
          warning:
            "!border-l-4 !border-l-amber-500 !bg-amber-50/80 dark:!bg-amber-950/40 !text-amber-900 dark:!text-amber-100 [&>[data-icon]]:!text-amber-500",
          info: "!border-l-4 !border-l-blue-500 !bg-blue-50/80 dark:!bg-blue-950/40 !text-blue-900 dark:!text-blue-100 [&>[data-icon]]:!text-blue-500",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
