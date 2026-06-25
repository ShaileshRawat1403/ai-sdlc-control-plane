export function generateEvidenceGapId(issueNumber: string | number, missingItem: string): string {
  const normalizedItem = missingItem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  return `evidence-gap-issue-${issueNumber}-${normalizedItem}`;
}

export function generateDecisionGapId(prNumber: string | number, filePath: string): string {
  const basename = filePath.split('/').pop() || 'file';
  const normalizedFile = basename.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  return `decision-gap-pr-${prNumber}-${normalizedFile}`;
}
