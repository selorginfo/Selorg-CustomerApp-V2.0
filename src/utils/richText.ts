/**
 * Turns CMS content (HTML or Markdown) into plain text blocks for <Text>, so
 * legal pages don't show raw tags like `<p>` or `**bold**`.
 */
export interface TextBlock {
  text: string;
  heading?: boolean;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
  copy: '©',
  reg: '®',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

const HEADING_MARK = '\u0001';

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<h[1-6][^>]*>/gi, `\n\n${HEADING_MARK}`)
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|section|ul|ol|li|tr|table|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
}

function markdownToText(md: string): string {
  return md
    .split('\n')
    .map(line => {
      const h = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
      if (h) return `\n${HEADING_MARK}${h[1]}\n`;
      return line.replace(/^\s*[-*+]\s+/, '• ').replace(/^\s*(\d+)\.\s+/, '$1. ');
    })
    .join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=[^*\w]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*(-{3,}|\*{3,})\s*$/gm, '');
}

export function richTextToBlocks(content?: string | null): TextBlock[] {
  if (!content || !content.trim()) return [];
  const isHtml = /<\/?[a-z][\s\S]*?>/i.test(content);
  const text = decodeEntities(isHtml ? htmlToText(content) : markdownToText(content));
  return text
    .split(/\n{2,}/)
    .map(p => p.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim())
    .filter(p => p && p !== HEADING_MARK)
    .map(p =>
      p.startsWith(HEADING_MARK)
        ? { text: p.slice(1).trim(), heading: true }
        : { text: p.split(HEADING_MARK).join('') },
    )
    .filter(b => b.text);
}
