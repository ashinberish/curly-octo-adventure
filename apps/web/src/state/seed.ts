import type { Employee, Task } from '@pixel-office/shared';
import { RESULTS, SCRIPTS, createTask } from './sim.ts';

export const SEED_EMPLOYEES: Employee[] = [
  { id: 'ada',   name: 'Ada',   role: 'Backend Engineer', skills: ['Code', 'DevOps'],               look: { hair: '#2b1d14', style: 'bun',   skin: '#f1c27d', shirt: '#5b7fd6', pants: '#3b3a4a' }, deskId: 'eng-1' },
  { id: 'linus', name: 'Linus', role: 'QA Engineer',      skills: ['QA', 'Code'],                   look: { hair: '#e3c86a', style: 'short', skin: '#e8b58a', shirt: '#e0884f', pants: '#3b3a4a' }, deskId: 'eng-2' },
  { id: 'kenji', name: 'Kenji', role: 'DevOps Engineer',  skills: ['DevOps', 'Code'],               look: { hair: '#1c1c22', style: 'short', skin: '#f0c8a0', shirt: '#4fa6a0', pants: '#2f3b4a' }, deskId: 'eng-3' },
  { id: 'grace', name: 'Grace', role: 'Data Analyst',     skills: ['Data', 'Research'],             look: { hair: '#b8402e', style: 'long',  skin: '#ffdbac', shirt: '#5aa86a', pants: '#3d3d5c' }, deskId: 'eng-5' },
  { id: 'sam',   name: 'Sam',   role: 'Researcher',       skills: ['Research', 'Writing'],          look: { hair: '#6b4226', style: 'short', skin: '#c68642', shirt: '#9b78f0', pants: '#3b3a4a' }, deskId: 'eng-6' },
  { id: 'maya',  name: 'Maya',  role: 'Product Designer', skills: ['Design', 'Writing'],            look: { hair: '#141414', style: 'long',  skin: '#8d5524', shirt: '#e07aa8', pants: '#40355e' }, deskId: 'studio-1' },
  { id: 'priya', name: 'Priya', role: 'Content Writer',   skills: ['Writing', 'Research'],          look: { hair: '#2a1a12', style: 'bun',   skin: '#b97a50', shirt: '#e9c24f', pants: '#3b3a4a' }, deskId: 'studio-2' },
  { id: 'omar',  name: 'Omar',  role: 'Head of Product',  skills: ['Writing', 'Research', 'Design'], look: { hair: '#d9cfc0', style: 'bald',  skin: '#e0ac69', shirt: '#5874a8', pants: '#2b2d42' }, deskId: 'focus-1' },
];

/** Who starts the day away from their desk, where, and what they're saying. */
export const SEED_AWAY: Record<string, { poi: string; says?: string }> = {
  linus: { poi: 'coffee', says: 'did you miss me?' },
  maya: { poi: 'couch-1', says: 'pretending to read my notes' },
  kenji: { poi: 'table-west' },
};

export function seedTasks(): Task[] {
  const done = createTask(5, 'sam', 'Competitor pricing scan', '', 'Research');
  return [
    createTask(1, 'grace', 'Analyze Q3 signup funnel', '', 'Data'),
    createTask(2, 'ada', 'Add rate limiting to /api/login', '', 'Code'),
    createTask(3, 'ada', 'Speed up CI pipeline', '', 'DevOps'),
    createTask(4, 'priya', 'Write launch blog post', '', 'Writing'),
    {
      ...done, status: 'done', progress: 1,
      log: [...done.log, ...SCRIPTS.Research.map(text => ({ kind: text.startsWith('→') ? 'tool' as const : 'text' as const, text })), { kind: 'done', text: RESULTS.Research }],
    },
  ];
}
