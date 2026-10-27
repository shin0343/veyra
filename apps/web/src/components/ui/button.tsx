import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

// shadcn/ui Button composition, styled with Veyra's own CSS tokens rather than a theme preset.
const buttonVariants = cva("button", {
  variants: {
    variant: {
      primary: "button-primary",
      secondary: "button-secondary",
      ghost: "button-ghost",
      danger: "button-danger",
    },
    size: { default: "", sm: "button-sm", icon: "button-icon" },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

export function Button({
  asChild = false,
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      {...(!asChild ? { type } : {})}
      className={clsx(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
