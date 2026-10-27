"use client";
import { useRef } from "react";

/** Retries reuse a key; editing the action creates a new request identity. */
export function useRequestKey() {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);
  return (body: unknown) => {
    const fingerprint = JSON.stringify(body);
    if (current.current?.fingerprint !== fingerprint) {
      current.current = { fingerprint, key: crypto.randomUUID() };
    }
    return current.current.key;
  };
}
