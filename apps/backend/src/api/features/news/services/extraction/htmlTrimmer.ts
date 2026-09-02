const STRIPPED_TAGS = ['script', 'style', 'noscript', 'svg'];
const MAX_MODEL_HTML_CHARS = 150_000;

function stripTag(html: string, tag: string): string {
  const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return html.replace(pattern, ' ');
}

/**
 * Prepares HTML for an LLM prompt: strips script/style/noscript/svg and comments,
 * collapses whitespace, and caps the result at roughly 150KB. Used identically for
 * v1 template generation and for a drift-triggered replacement proposal.
 */
export function trimHtmlForModel(html: string): string {
  let stripped = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of STRIPPED_TAGS) {
    stripped = stripTag(stripped, tag);
  }

  const collapsed = stripped.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_MODEL_HTML_CHARS
    ? collapsed.slice(0, MAX_MODEL_HTML_CHARS)
    : collapsed;
}
