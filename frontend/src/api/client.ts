const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export async function apiFetch<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(path, API_BASE || window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}
