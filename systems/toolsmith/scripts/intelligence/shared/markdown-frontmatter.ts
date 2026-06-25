import { parse } from 'yaml';

export interface ParsedMarkdown {
  frontmatter: any;
  body: string;
  humanNotes: string;
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const parts = content.split('---');
  let frontmatter: any = {};
  let body = content;

  if (parts.length >= 3) {
    try {
      frontmatter = parse(parts[1]) || {};
      body = parts.slice(2).join('---').trim();
    } catch (e) {}
  }

  // Parse human notes
  let humanNotes = '';
  const marker = '## Human Notes';
  const idx = body.indexOf(marker);
  if (idx !== -1) {
    humanNotes = body.slice(idx + marker.length).trim();
  }

  return { frontmatter, body, humanNotes };
}
