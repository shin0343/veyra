/** Search words stay in this tab. The URL carries only an opaque local reference. */
const PREFIX = "veyra.search-session.v1.";
type SearchSession = { query: string; submit: boolean; created: number };

export function prepareSearch(query: string, submit = false) {
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(
      PREFIX + id,
      JSON.stringify({
        query: query.trim().slice(0, 2000),
        submit,
        created: Date.now(),
      }),
    );
  } catch {
    // Storage unavailable: open the editable search, without spending a request.
    return "/explore";
  }
  return `/explore?search=${id}`;
}

export function consumeSearch(id: string | null): SearchSession | null {
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(PREFIX + id) ?? "null");
    if (
      !value ||
      typeof value.query !== "string" ||
      Date.now() - value.created > 86400000
    )
      return null;
    // Submission is a one-use handover from a deliberate, cost-labelled click.
    sessionStorage.setItem(
      PREFIX + id,
      JSON.stringify({ ...value, submit: false }),
    );
    return value;
  } catch {
    return null;
  }
}
