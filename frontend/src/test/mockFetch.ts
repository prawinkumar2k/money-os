import { vi } from "vitest";

export interface MockRoute {
  match: (url: string, init?: RequestInit) => boolean;
  respond: (url: string, init?: RequestInit) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;
}

/** Installs a fetch mock that dispatches to the first matching route, in order. */
export function installMockFetch(routes: MockRoute[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const route = routes.find((r) => r.match(url, init));
    if (!route) {
      throw new Error(`No mock route for ${init?.method ?? "GET"} ${url}`);
    }
    const { status, body } = await route.respond(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body ?? {},
      text: async () => JSON.stringify(body ?? {}),
      blob: async () => new Blob([JSON.stringify(body ?? {})]),
    } as unknown as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function jsonRoute(
  urlIncludes: string,
  method: string,
  status: number,
  body: unknown
): MockRoute {
  return {
    match: (url, init) => url.includes(urlIncludes) && (init?.method ?? "GET") === method,
    respond: () => ({ status, body }),
  };
}
