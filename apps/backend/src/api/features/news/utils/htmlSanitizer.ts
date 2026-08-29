export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/&nbsp;/g, ' ')
    .replaceAll(/&amp;/g, '&')
    .replaceAll(/&lt;/g, '<')
    .replaceAll(/&gt;/g, '>')
    .replaceAll(/&quot;/g, '"')
    .replaceAll(/&#39;/g, "'")
    .replaceAll(/\s+/g, ' ')
    .trim();
}
