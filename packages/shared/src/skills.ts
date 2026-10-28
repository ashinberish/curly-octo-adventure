import type { SkillDef, SkillName } from './types.ts';

// `tools` is what the skill lets an agent use, as shown in the UI; apps/server/src/agent/tools.ts
// turns skills into the actual API tool definitions.
export const SKILLS: Record<SkillName, SkillDef> = {
  Code:     { name: 'Code',     description: 'Write, run and debug code',          color: '#8fb2ff', tools: ['Code sandbox', 'Files'] },
  Research: { name: 'Research', description: 'Search the web and summarise',       color: '#c9b2ff', tools: ['Web search', 'Web fetch'] },
  Writing:  { name: 'Writing',  description: 'Docs, copy and emails',              color: '#ffe08a', tools: ['Files'] },
  Design:   { name: 'Design',   description: 'UI mockups in HTML/CSS',             color: '#ffb3d1', tools: ['Files (HTML)'] },
  Data:     { name: 'Data',     description: 'Analysis, SQL, Python and charts',   color: '#a9dca3', tools: ['Code sandbox', 'Files'] },
  QA:       { name: 'QA',       description: 'Write and run tests, find bugs',     color: '#ffc499', tools: ['Code sandbox', 'Files'] },
  DevOps:   { name: 'DevOps',   description: 'Scripts, CI configs, infrastructure', color: '#9fe0dc', tools: ['Code sandbox', 'Files'] },
};

export const SKILL_NAMES = Object.keys(SKILLS) as SkillName[];

/** Union of the tools granted by a set of skills, in catalog order, without duplicates. */
export function toolsFor(skills: readonly SkillName[]): string[] {
  return [...new Set(skills.flatMap(s => SKILLS[s].tools))];
}
