export interface ResolvedItemUrl {
  url: string;
  malformed: boolean;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function resolveItemUrl(
  raw: string,
  sourceUrl: string,
): ResolvedItemUrl {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { url: '', malformed: true };
  }

  try {
    const resolved = new URL(trimmed, sourceUrl);
    if (!ALLOWED_PROTOCOLS.has(resolved.protocol)) {
      return { url: resolved.href, malformed: true };
    }
    return { url: resolved.href, malformed: false };
  } catch {
    return { url: '', malformed: true };
  }
}
