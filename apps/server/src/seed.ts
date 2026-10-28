import type { Employee, LogKind, SkillName, TaskStatus } from '@pixel-office/shared';
import { RESULTS, SCRIPTS } from './sim.ts';

export const SEED_EMPLOYEES: Employee[] = [
  { id: 'ada',   name: 'Ada',   role: 'Backend Engineer', skills: ['Code', 'DevOps'],                look: { hair: '#2b1d14', style: 'bun',   skin: '#f1c27d', shirt: '#5b7fd6', pants: '#3b3a4a' }, deskId: 'eng-1' },
  { id: 'linus', name: 'Linus', role: 'QA Engineer',      skills: ['QA', 'Code'],                    look: { hair: '#e3c86a', style: 'short', skin: '#e8b58a', shirt: '#e0884f', pants: '#3b3a4a' }, deskId: 'eng-2' },
  { id: 'kenji', name: 'Kenji', role: 'DevOps Engineer',  skills: ['DevOps', 'Code'],                look: { hair: '#1c1c22', style: 'short', skin: '#f0c8a0', shirt: '#4fa6a0', pants: '#2f3b4a' }, deskId: 'eng-3' },
  { id: 'grace', name: 'Grace', role: 'Data Analyst',     skills: ['Data', 'Research'],              look: { hair: '#b8402e', style: 'long',  skin: '#ffdbac', shirt: '#5aa86a', pants: '#3d3d5c' }, deskId: 'eng-5' },
  { id: 'sam',   name: 'Sam',   role: 'Researcher',       skills: ['Research', 'Writing'],           look: { hair: '#6b4226', style: 'short', skin: '#c68642', shirt: '#9b78f0', pants: '#3b3a4a' }, deskId: 'eng-6' },
  { id: 'maya',  name: 'Maya',  role: 'Product Designer', skills: ['Design', 'Writing'],             look: { hair: '#141414', style: 'long',  skin: '#8d5524', shirt: '#e07aa8', pants: '#40355e' }, deskId: 'studio-1' },
  { id: 'priya', name: 'Priya', role: 'Content Writer',   skills: ['Writing', 'Research'],           look: { hair: '#2a1a12', style: 'bun',   skin: '#b97a50', shirt: '#e9c24f', pants: '#3b3a4a' }, deskId: 'studio-2' },
  { id: 'omar',  name: 'Omar',  role: 'Head of Product',  skills: ['Writing', 'Research', 'Design'], look: { hair: '#d9cfc0', style: 'bald',  skin: '#e0ac69', shirt: '#5874a8', pants: '#2b2d42' }, deskId: 'focus-1' },
];

interface SeedTask {
  assigneeId: string;
  title: string;
  skill: SkillName;
  status: TaskStatus;
  progress: number;
  step: number;
  startedAt: number | null;
  finishedAt: number | null;
  log: Array<{ kind: LogKind; text: string; at: number }>;
}

export function seedTasks(now: number): SeedTask[] {
  const queued = (assigneeId: string, title: string, skill: SkillName): SeedTask =>
    ({ assigneeId, title, skill, status: 'queued', progress: 0, step: 0, startedAt: null, finishedAt: null, log: [{ kind: 'sys', text: `Queued: “${title}” [${skill}]`, at: now }] });
  const research = SCRIPTS.Research;
  const done: SeedTask = {
    ...queued('sam', 'Competitor pricing scan', 'Research'),
    status: 'done', progress: 1, step: research.length, startedAt: now - 60_000, finishedAt: now - 30_000,
  };
  done.log = [
    { kind: 'sys', text: 'Queued: “Competitor pricing scan” [Research]', at: now - 60_000 },
    ...research.map((text, i) => ({ kind: (text.startsWith('→') ? 'tool' : 'text') as LogKind, text, at: now - 55_000 + i * 4000 })),
    { kind: 'done', text: RESULTS.Research, at: now - 30_000 },
  ];
  return [
    queued('grace', 'Analyze Q3 signup funnel', 'Data'),
    queued('ada', 'Add rate limiting to /api/login', 'Code'),
    queued('ada', 'Speed up CI pipeline', 'DevOps'),
    queued('priya', 'Write launch blog post', 'Writing'),
    done,
  ];
}
