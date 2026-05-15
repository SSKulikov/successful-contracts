export function resolveSameAppApiUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.hostname === window.location.hostname && parsed.pathname.startsWith("/api/")) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function openSameAppApiUrl(url: string): void {
  window.open(resolveSameAppApiUrl(url), "_blank", "noopener,noreferrer");
}
