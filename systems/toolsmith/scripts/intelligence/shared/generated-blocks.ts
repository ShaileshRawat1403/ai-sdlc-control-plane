import * as fs from 'fs';
import * as path from 'path';

export function updateGeneratedBlock(
  filePath: string,
  generatedContent: string,
  blockName: string = '',
  fallbackTemplate: string = ''
): void {
  const suffix = blockName ? `:${blockName}` : '';
  const startMarker = `<!-- brainbench:generated${suffix}:start -->`;
  const endMarker = `<!-- brainbench:generated${suffix}:end -->`;

  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  } else {
    content = fallbackTemplate || `${startMarker}\n${endMarker}`;
  }

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    console.warn(`Generated block markers missing or malformed for block "${blockName}" in ${path.basename(filePath)}. Appending markers.`);
    content = content.trim() + `\n\n${startMarker}\n\n${generatedContent.trim()}\n\n${endMarker}\n`;
  } else {
    content = content.slice(0, startIndex + startMarker.length) +
              '\n\n' + generatedContent.trim() + '\n\n' +
              content.slice(endIndex);
  }

  fs.writeFileSync(filePath, content, 'utf-8');
}
export function getGeneratedBlockContent(filePath: string, blockName: string = ''): string {
  const suffix = blockName ? `:${blockName}` : '';
  const startMarker = `<!-- brainbench:generated${suffix}:start -->`;
  const endMarker = `<!-- brainbench:generated${suffix}:end -->`;

  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath, 'utf-8');
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) return '';
  return content.slice(startIndex + startMarker.length, endIndex).trim();
}
