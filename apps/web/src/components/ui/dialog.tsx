"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";

// shadcn/ui's Radix Dialog structure; focus trap, Escape, and restoration stay with Radix.
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  const content = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (
      open &&
      active instanceof HTMLElement &&
      active !== document.body &&
      !active.closest('[role="dialog"]')
    )
      previousFocus.current = active;
  }, [open]);
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target !== document.body &&
        !event.target.closest('[role="dialog"]')
      )
        previousFocus.current = event.target;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          ref={content}
          className={`dialog-content ${className}`}
          onOpenAutoFocus={(event) => {
            const field = content.current?.querySelector<HTMLInputElement>(
              "input:not([type=checkbox]), textarea",
            );
            if (field) {
              event.preventDefault();
              field.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = previousFocus.current?.isConnected
              ? previousFocus.current
              : document.querySelector<HTMLElement>(".topbar-command");
            target?.focus();
          }}
        >
          <div className="dialog-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description>
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X size={19} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
