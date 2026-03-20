const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export async function apiFetch<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  const isAbsolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(API_BASE);

  let target: URL;
  if (!API_BASE) {
    target = new URL(trimmedPath, window.location.origin);
  } else if (isAbsolute) {
    target = new URL(trimmedPath, API_BASE);
  } else {
    let basePath = API_BASE.trim().replace(/\/+$/, "");
    if (!basePath.startsWith("/")) {
      basePath = `/${basePath}`;
    }

    let normalizedPath = trimmedPath;
    if (normalizedPath === basePath) {
      normalizedPath = "/";
    } else if (normalizedPath.startsWith(`${basePath}/`)) {
      normalizedPath = normalizedPath.slice(basePath.length);
      if (!normalizedPath.startsWith("/")) {
        normalizedPath = `/${normalizedPath}`;
      }
    }

    target = new URL(`${basePath}${normalizedPath}`, window.location.origin);
  }

  const url = target;
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
