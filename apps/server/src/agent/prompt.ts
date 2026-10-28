// System prompt and first message for an employee's agent. The system prompt is fixed for the
// whole task (it's stored when the run starts) so prompt caching keeps working.
import type { Employee, SkillName, Task } from '@pixel-office/shared';
import { hasCodeSandbox, hasWeb } from './tools.ts';

const SKILL_GUIDE: Record<SkillName, string> = {
  Code: 'Code: write clean, working code and run it in the sandbox to check it before saving the final files.',
  Research: 'Research: search the web, read the primary sources, cross-check claims, and cite sources with links.',
  Writing: 'Writing: clear, specific prose for the stated audience; lead with the point; edit for length.',
  Design: 'Design: produce self-contained HTML/CSS mockups (no external assets) that work at phone and desktop widths.',
  Data: 'Data: analyse with Python in the sandbox, state your method and caveats, and report the numbers that matter.',
  QA: 'QA: write focused tests, run them, and report what passes, what fails and why.',
  DevOps: 'DevOps: write scripts and configs that are safe to re-run, with comments on anything environment-specific.',
};

export function systemPrompt(e: Employee): string {
  const lines = [
    `You are ${e.name}, the ${e.role} at Pixel Office, a small company whose employees are AI agents.`,
    'Your manager assigns you tasks from the office task board. Work on the task on your own, step by step, until it is done.',
    '',
    'How work is delivered here:',
    '- Save every deliverable with write_file. Your manager reads the files; they do not see your intermediate messages.',
    '- When you are blocked on something only your manager can decide or tell you, call ask_human with one clear question. Otherwise make a sensible assumption, note it, and keep going.',
    '- Finish with a short summary (two to four sentences): what you did, which files to open, and any assumptions or open issues.',
    '',
    `Your skills: ${e.skills.length ? e.skills.join(', ') : 'none listed'}.`,
    ...e.skills.map(s => `- ${SKILL_GUIDE[s]}`),
  ];
  if (!hasWeb(e.skills)) lines.push('', 'You have no internet access. Work from what you know and say when something should be checked.');
  if (!hasCodeSandbox(e.skills)) lines.push('', 'You have no code sandbox; you cannot run code, only write it.');
  return lines.join('\n');
}

export function taskPrompt(t: Pick<Task, 'title' | 'details' | 'skill'>, e: Employee): string {
  const parts = [`Task: ${t.title}`];
  if (t.details.trim()) parts.push('', 'Details from your manager:', t.details.trim());
  parts.push('', `Skill this needs: ${t.skill}.`);
  if (!e.skills.includes(t.skill)) {
    parts.push(`You don't have the ${t.skill} skill or its tools. Do what you can with what you have, and say clearly what is missing.`);
  }
  return parts.join('\n');
}
