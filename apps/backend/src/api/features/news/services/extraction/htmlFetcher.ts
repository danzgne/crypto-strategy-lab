const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchSourceHtml(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `Fetch failed for ${url}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}
