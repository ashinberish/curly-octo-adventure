import type { SkillDef, SkillName } from './types.ts';

export const SKILLS: Record<SkillName, SkillDef> = {
  Code:     { name: 'Code',     description: 'Read, edit and refactor code',   color: '#8fb2ff', tools: ['Read', 'Edit', 'Bash'] },
  Research: { name: 'Research', description: 'Search the web and summarise',   color: '#c9b2ff', tools: ['WebSearch', 'WebFetch'] },
  Writing:  { name: 'Writing',  description: 'Docs, copy and emails',          color: '#ffe08a', tools: ['Read', 'Write'] },
  Design:   { name: 'Design',   description: 'UI mockups in HTML/CSS',         color: '#ffb3d1', tools: ['Write', 'HTML/CSS preview'] },
  Data:     { name: 'Data',     description: 'SQL, Python and charts',         color: '#a9dca3', tools: ['Bash(python)', 'Read'] },
  QA:       { name: 'QA',       description: 'Write and run tests',            color: '#ffc499', tools: ['Bash(test runner)', 'Read'] },
  DevOps:   { name: 'DevOps',   description: 'CI, containers and deploys',     color: '#9fe0dc', tools: ['Bash', 'Edit', 'GitHub MCP'] },
};

export const SKILL_NAMES = Object.keys(SKILLS) as SkillName[];

/** Union of the tools granted by a set of skills, in catalog order, without duplicates. */
export function toolsFor(skills: readonly SkillName[]): string[] {
  return [...new Set(skills.flatMap(s => SKILLS[s].tools))];
}
