import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

const REPO_ROOT = path.resolve(__dirname, '../../../../../');
const RULES_PATH = path.join(REPO_ROOT, 'state/intelligence-rules.yml');

export interface AgentRules {
  can_write?: string[];
  can_update_generated_sections?: string[];
  cannot_overwrite?: string[];
  can_create_drafts?: string[];
  cannot_mark_accepted?: boolean;
}

export function loadRulesForAgent(agentKey: string): AgentRules {
  if (!fs.existsSync(RULES_PATH)) {
    throw new Error(`Rules config not found at ${RULES_PATH}`);
  }
  try {
    const rules = parse(fs.readFileSync(RULES_PATH, 'utf-8'));
    return rules[agentKey] || {};
  } catch (e) {
    console.error(`Failed to parse rules for agent ${agentKey}:`, e);
    return {};
  }
}

export function verifyWritePermission(agentKey: string, targetFilePath: string): void {
  const relativePath = path.relative(REPO_ROOT, targetFilePath);
  const rules = loadRulesForAgent(agentKey);
  
  const allowedPaths = [
    ...(rules.can_write || []),
    ...(rules.can_update_generated_sections || []),
    ...(rules.can_create_drafts || [])
  ];

  const isAllowed = allowedPaths.some(allowed => {
    return relativePath.startsWith(allowed) || allowed.startsWith(relativePath);
  });

  if (!isAllowed) {
    throw new Error(`Permission Denied: Agent ${agentKey} is not allowed to write to ${relativePath}. Check state/intelligence-rules.yml`);
  }
}
