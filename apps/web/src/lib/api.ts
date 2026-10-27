import "server-only";
import type { components } from "@veyra/contracts";

export type Health = components["schemas"]["Health"];
export type Feature = components["schemas"]["Feature"];
export type NavigationAction = components["schemas"]["NavigationAction"];
export type ActionResult =
  components["schemas"]["AgentResponse"]["actions"][number];

// Server components/route handlers only. The browser must never receive the service token.
export async function readHealth(): Promise<Health | null> {
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000"}/health/live`,
      { cache: "no-store", signal: AbortSignal.timeout(2000) },
    );
    if (!response.ok) return null;
    return (await response.json()) as Health;
  } catch {
    return null;
  }
}
