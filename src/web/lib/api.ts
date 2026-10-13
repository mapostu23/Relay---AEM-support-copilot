export async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      `${data.error?.message || "Request failed"} (${data.error?.code || response.status}; reference ${data.error?.requestId || "unavailable"})`,
    );
  return data;
}
