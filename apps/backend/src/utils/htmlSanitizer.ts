export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code >= 0
        ? String.fromCharCode(code)
        : '';
    })
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0
        ? String.fromCharCode(code)
        : '';
    })
    .replaceAll(/&nbsp;/g, ' ')
    .replaceAll(/&amp;/g, '&')
    .replaceAll(/&lt;/g, '<')
    .replaceAll(/&gt;/g, '>')
    .replaceAll(/&quot;/g, '"')
    .replaceAll(/&#39;/g, "'")
    .replaceAll(/&apos;/g, "'")
    .replaceAll(/&mdash;/g, '—')
    .replaceAll(/&ndash;/g, '–')
    .replaceAll(/&hellip;/g, '…')
    .replaceAll(/&bull;/g, '•')
    .replaceAll(/\s+/g, ' ')
    .trim();
}
