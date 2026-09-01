import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

import { stripHtml } from '@/utils/htmlSanitizer';

import { assertSafeUrl, type AssertSafeUrlDependencies } from './urlSafety';

export class LinkExtractionError extends Error {}

const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface LinkExtractorDependencies extends AssertSafeUrlDependencies {
  fetchImplementation?: typeof globalThis.fetch;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

export function extractTextFromHtml(html: string, url: string): string {
  const readable = extractReadableText(html, url);
  return readable ?? stripHtml(html);
}

export async function extractTextFromUrl(
  rawUrl: string,
  deps: LinkExtractorDependencies = {},
): Promise<string> {
  const {
    fetchImplementation = globalThis.fetch,
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    lookup,
  } = deps;

  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new LinkExtractionError(`"${rawUrl}" is not a valid URL`);
  }

  for (let hop = 0; ; hop += 1) {
    try {
      await assertSafeUrl(currentUrl, { lookup });
    } catch (error) {
      throw new LinkExtractionError((error as Error).message);
    }

    let response: Response;
    try {
      response = await fetchImplementation(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'text/html' },
      });
    } catch (error) {
      throw new LinkExtractionError(
        `Fetching "${currentUrl.href}" failed: ${(error as Error).message}`,
      );
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (location === null || location.length === 0) {
        throw new LinkExtractionError(
          `Redirect from "${currentUrl.href}" carried no Location header`,
        );
      }
      if (hop >= maxRedirects) {
        throw new LinkExtractionError(
          `Exceeded the maximum of ${maxRedirects} redirects`,
        );
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new LinkExtractionError(
        `Fetching "${currentUrl.href}" failed with HTTP ${response.status}`,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      throw new LinkExtractionError(
        `Refusing to extract non-HTML content type "${contentType}"`,
      );
    }

    const html = await readBoundedText(response, maxBytes);
    const text = extractTextFromHtml(html, currentUrl.href);
    if (text.trim().length === 0) {
      throw new LinkExtractionError(
        `No extractable text content was found at "${currentUrl.href}"`,
      );
    }
    return text;
  }
}

function extractReadableText(html: string, url: string): string | null {
  try {
    const { document } = parseHTML(html, { location: { href: url } });
    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();
    const text = article?.textContent?.trim();
    return text !== undefined && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      chunks.push(value);
      if (received >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    .subarray(0, maxBytes)
    .toString('utf-8');
}
