import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";

// Frontend same-origin adapter only. Mirrors the Phase 05 runtime API without widening it.
const uuid = "[0-9a-fA-F-]{36}";
const readRoutes = [
  /^cameras$/,
  /^camera-sources$/,
  /^layouts$/,
  /^recordings$/,
  /^events$/,
  /^features$/,
  /^agent\/capabilities$/,
  /^analysis-usage$/,
  /^index-coverage$/,
  new RegExp(`^(cameras|layouts|recordings|analysis-jobs)/${uuid}$`),
  new RegExp(`^recordings/${uuid}/(segments|index)$`),
  new RegExp(`^cameras/${uuid}/activity$`),
  new RegExp(`^cameras/${uuid}/thumbnail$`),
  new RegExp(`^recordings/${uuid}/frame$`),
  new RegExp(`^media/sessions/${uuid}/[a-zA-Z0-9_-]+\.(m3u8|mp4|m4s|ts)$`),
];
const cameraCell = z
  .object({ camera_id: z.uuid(), position: z.number().int().min(0).max(8) })
  .strict();
const layout = z
  .object({
    name: z.string().trim().min(1).max(100),
    columns: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    cells: z.array(cameraCell).min(1).max(9),
  })
  .strict();
const label = z.string().trim().min(1).max(100);
const interpretation = z
  .object({
    curated_only: z.boolean().optional(),
    camera_names: z.array(label).max(16),
    camera_ids: z.array(z.uuid()).max(16).optional(),
    start: z.iso.datetime({ offset: true }).nullable(),
    end: z.iso.datetime({ offset: true }).nullable(),
    objects: z
      .array(
        z
          .object({
            category: z.string().min(1).max(30),
            attributes: z.array(z.string().min(1).max(30)).max(12),
            apparel: z
              .array(
                z
                  .object({
                    kind: z.string().min(1).max(30),
                    colors: z.array(z.string().min(1).max(30)).max(11),
                  })
                  .strict(),
              )
              .max(8)
              .optional(),
          })
          .strict(),
      )
      .max(8),
    event_types: z.array(z.string().min(1).max(30)).max(8),
    keywords: z.array(z.string().min(1).max(100)).max(12),
    motion_only: z.boolean(),
    unsupported_reason: z.string().max(50).nullable(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
const postRoutes: [RegExp, z.ZodType][] = [
  [
    /^activity-query$/,
    z
      .object({
        camera_ids: z.array(z.uuid()).min(1).max(16),
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
        bucket_seconds: z.number().int().min(10).max(3600),
      })
      .strict(),
  ],
  [
    /^cameras$/,
    z
      .object({
        name: label,
        source_id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
        cloud_analysis_allowed: z.boolean(),
        group_name: label.nullable().optional(),
        location: label.nullable().optional(),
      })
      .strict(),
  ],
  [/^layouts$/, layout],
  [
    /^search$/,
    z
      .object({
        curated_only: z.boolean().optional(),
        query: z.string().trim().min(1).max(2000),
        camera_ids: z.array(z.uuid()).max(16).optional(),
        start: z.iso.datetime({ offset: true }).nullable().optional(),
        end: z.iso.datetime({ offset: true }).nullable().optional(),
        limit: z.number().int().min(1).max(50),
        timezone: z.string().min(1).max(80).optional(),
      })
      .strict(),
  ],
  [
    /^index-query$/,
    z
      .object({
        camera_ids: z.array(z.uuid()).max(16).optional(),
        start: z.iso.datetime({ offset: true }).nullable().optional(),
        end: z.iso.datetime({ offset: true }).nullable().optional(),
        categories: z
          .array(z.string().regex(/^[a-z]{2,20}$/))
          .max(4)
          .optional(),
        event_types: z
          .array(z.string().regex(/^[a-z_]{2,30}$/))
          .max(4)
          .optional(),
        keywords: z.array(z.string().min(2).max(40)).max(6).optional(),
        motion_only: z.boolean().optional(),
        interpretation: interpretation.optional(),
        curated_only: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .strict(),
  ],
  [
    /^agent\/messages$/,
    z
      .object({
        message: z.string().trim().min(1).max(4000),
        conversation_id: z.uuid().nullable().optional(),
      })
      .strict(),
  ],
  [
    new RegExp(`^agent/confirmations/${uuid}$`),
    z.object({ approved: z.boolean() }).strict(),
  ],
  [new RegExp(`^cameras/${uuid}/live-session$`), z.undefined()],
  [
    /^playback-sessions$/,
    z
      .object({
        recording_id: z.uuid(),
        offset_ms: z.number().int().nonnegative(),
        duration_ms: z.number().int().min(1000).max(300000),
        segment_id: z.uuid().nullable().optional(),
      })
      .strict(),
  ],
  [
    /^analysis-jobs$/,
    z
      .object({
        recording_id: z.uuid(),
        allow_cloud_upload: z.literal(true),
        max_segments: z.number().int().min(1).max(30).optional(),
      })
      .strict(),
  ],
];
// Muse runs have a 60s server budget; media export and NL search parsing also call out.
function upstreamTimeout(path: string) {
  if (/^agent\//.test(path)) return 70000;
  if (path === "search") return 60000;
  if (path === "playback-sessions" || path.startsWith("media/")) return 30000;
  return 15000;
}
const queryKeys = new Set([
  "query",
  "camera_id",
  "start",
  "end",
  "cursor",
  "limit",
  "bucket_seconds",
  "offset_ms",
  "segment_id",
  "curated_only",
  "kind",
]);

function failure(status: number, code: string, message: string) {
  const requestId = crypto.randomUUID();
  return Response.json(
    {
      request_id: requestId,
      error: { code, message, retryable: status >= 503, fields: [] },
    },
    {
      status,
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
    },
  );
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const allowed = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  if (process.env.WEB_ORIGIN) allowed.add(process.env.WEB_ORIGIN);
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  // Next's internal URL may normalize loopback to localhost; validate the actual Host
  // against the explicit approved origins, then require an exact browser-origin match.
  const requestOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") ?? ""}`;
  if (
    !allowed.has(requestOrigin) ||
    (origin ? origin !== requestOrigin : site !== "same-origin")
  )
    return failure(
      403,
      "FORBIDDEN",
      "Open this request from your Veyra workspace.",
    );
  const path = (await context.params).path.join("/");
  let schema: z.ZodType | undefined;
  if (request.method === "GET") {
    if (!readRoutes.some((pattern) => pattern.test(path)))
      return failure(
        404,
        "NOT_FOUND",
        "This workspace resource isn’t available.",
      );
  } else if (request.method === "POST") {
    const matched = postRoutes.find(([pattern]) => pattern.test(path));
    if (!matched)
      return failure(
        404,
        "NOT_FOUND",
        "This workspace action isn’t available.",
      );
    schema = matched[1];
  } else if (
    request.method === "PATCH" &&
    new RegExp(`^cameras/${uuid}$`).test(path)
  ) {
    schema = z
      .object({
        name: label.optional(),
        enabled: z.boolean().optional(),
        cloud_analysis_allowed: z.boolean().optional(),
        group_name: label.nullable().optional(),
        location: label.nullable().optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0);
  } else if (
    request.method === "PUT" &&
    new RegExp(`^layouts/${uuid}$`).test(path)
  ) {
    schema = layout.extend({ expected_version: z.number().int().min(1) });
  } else if (
    request.method === "DELETE" &&
    new RegExp(`^cameras/${uuid}$`).test(path)
  ) {
    if (!request.headers.get("idempotency-key"))
      return failure(
        422,
        "VALIDATION_ERROR",
        "This change needs a request key.",
      );
  } else
    return failure(404, "NOT_FOUND", "This workspace action isn’t available.");
  if (
    [...request.nextUrl.searchParams].some(
      ([key, value]) => !queryKeys.has(key) || value.length > 2000,
    )
  )
    return failure(422, "VALIDATION_ERROR", "Check the requested filters.");
  const token = process.env.VEYRA_DEV_TOKEN;
  if (!token || token === "replace-with-a-long-random-local-token")
    return failure(
      503,
      "AUTH_NOT_CONFIGURED",
      "Your local workspace service hasn’t been connected yet.",
    );
  let body: string | undefined;
  if (schema) {
    if (Number(request.headers.get("content-length") ?? 0) > 16384)
      return failure(413, "REQUEST_TOO_LARGE", "This request is too large.");
    const text = await request.text();
    if (text.length > 16384)
      return failure(413, "REQUEST_TOO_LARGE", "This request is too large.");
    try {
      const parsed = schema.parse(text ? JSON.parse(text) : undefined);
      body = parsed === undefined ? undefined : JSON.stringify(parsed);
    } catch {
      return failure(
        422,
        "VALIDATION_ERROR",
        "Check the requested action and try again.",
      );
    }
  }
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (body) headers.set("Content-Type", "application/json");
  const key = request.headers.get("idempotency-key");
  if (key && key.length >= 8 && key.length <= 128)
    headers.set("Idempotency-Key", key);
  const range = request.headers.get("range");
  if (range) {
    if (!/^bytes=\d*-\d*$/.test(range))
      return failure(
        416,
        "INVALID_RANGE",
        "This playback range isn’t available.",
      );
    headers.set("Range", range);
  }
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000"}/api/v1/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(upstreamTimeout(path)),
      },
    );
    if (response.status >= 300 && response.status < 400)
      return failure(
        502,
        "INVALID_RESPONSE",
        "The workspace returned an unexpected destination.",
      );
    // A decoded evidence frame is immutable for its segment and position.
    const frame = /\/frame$/.test(path) && response.ok;
    const outputHeaders = new Headers({
      "Cache-Control": frame ? "private, max-age=600" : "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "x-request-id",
    ]) {
      const value = response.headers.get(name);
      if (value) outputHeaders.set(name, value);
    }
    return new Response(response.status === 204 ? null : response.body, {
      status: response.status,
      headers: outputHeaders,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      return failure(
        504,
        "UPSTREAM_TIMEOUT",
        "The workspace service took too long to answer. Nothing was assumed to have changed.",
      );
    return failure(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Your workspace service couldn’t be reached. Try again when it’s connected.",
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
