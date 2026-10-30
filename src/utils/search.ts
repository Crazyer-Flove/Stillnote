export function searchSnippet(content: string, query: string, radius = 65) {
  const index = content.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index < 0 || !query.trim()) return '';
  const start = Math.max(0, index - radius), end = Math.min(content.length, index + query.trim().length + radius);
  return `${start ? '…' : ''}${content.slice(start, end).replace(/\n/g, ' ')}${end < content.length ? '…' : ''}`;
}
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];
  const result: { text: string; match: boolean }[] = [];
  let start = 0, found: number;
  while ((found = text.toLowerCase().indexOf(needle, start)) >= 0) {
    if (found > start) result.push({ text: text.slice(start, found), match: false });
    result.push({ text: text.slice(found, found + needle.length), match: true });
    start = found + needle.length;
  }
  if (start < text.length) result.push({ text: text.slice(start), match: false });
  return result;
}

interface HtmlNode { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HtmlNode[] }
export function rehypeSearch(options: { query: string }) {
  return (tree: HtmlNode) => {
    if (!options.query.trim()) return;
    const walk = (node: HtmlNode) => {
      if (['code', 'pre', 'math', 'svg', 'annotation', 'mark'].includes(node.tagName || '') || String(node.properties?.className || '').includes('katex')) return;
      if (!node.children) return;
      const parts = (text: string) => {
        const protectedTokens = /\[\[[^\]]+\]\]|(?:^|\s)#[a-zA-Z0-9_\u4e00-\u9fa5\/-]+(?=\s|$|[.,!?;:])/g;
        const result: { text: string; match: boolean }[] = [];
        let offset = 0;
        for (const match of text.matchAll(protectedTokens)) {
          result.push(...highlightParts(text.slice(offset, match.index), options.query));
          result.push({ text: match[0], match: false });
          offset = match.index! + match[0].length;
        }
        result.push(...highlightParts(text.slice(offset), options.query));
        return result;
      };
      node.children = node.children.flatMap(child => child.type === 'text' ? parts(child.value || '').map(part => part.match
        ? { type: 'element', tagName: 'mark', properties: { 'data-search-match': true }, children: [{ type: 'text', value: part.text }] }
        : { type: 'text', value: part.text }) : (walk(child), [child]));
    };
    walk(tree);
  };
}
