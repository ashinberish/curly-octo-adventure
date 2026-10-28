export type SkillName = 'Code' | 'Research' | 'Writing' | 'Design' | 'Data' | 'QA' | 'DevOps';

export interface SkillDef {
  name: SkillName;
  description: string;
  /** Chip colour in the UI. */
  color: string;
  /** Tools an agent with this skill is allowed to use. */
  tools: string[];
}

export type HairStyle = 'short' | 'long' | 'bun' | 'bald';

export interface Look {
  hair: string;
  style: HairStyle;
  skin: string;
  shirt: string;
  pants: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  skills: SkillName[];
  look: Look;
  /** Id of a desk object in the office map. */
  deskId: string;
}

export type TaskStatus = 'queued' | 'running' | 'needs_input' | 'done' | 'failed' | 'cancelled';

/** Who does the work: a canned simulation, or a real Claude agent. */
export type Runner = 'sim' | 'claude';

export type LogKind = 'sys' | 'text' | 'tool' | 'perm' | 'done' | 'deny';

/** One line of an agent's run log. */
export interface LogLine {
  id: number;
  taskId: number;
  kind: LogKind;
  text: string;
  /** Epoch ms. */
  at: number;
}

export interface Task {
  id: number;
  assigneeId: string;
  title: string;
  details: string;
  skill: SkillName;
  status: TaskStatus;
  /** 0..1 */
  progress: number;
  /**
   * When status is needs_input: the tool call waiting for approval (simulated runs) or the
   * agent's question for you (Claude runs).
   */
  awaiting: string | null;
  runner: Runner;
  /** The agent's closing summary, once done (or why it failed). */
  result: string | null;
  /** Estimated API spend so far, in US dollars (Claude runs). */
  costUsd: number;
  /** Epoch ms. */
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/** A file an agent saved in its task's workspace. */
export interface TaskFile {
  path: string;
  size: number;
  /** Epoch ms. */
  updatedAt: number;
}

/** Whether real Claude agents are on, and why not when they aren't. */
export type AgentsInfo =
  | { mode: 'claude'; model: string; spentTodayUsd: number; dailyBudgetUsd: number }
  | { mode: 'simulated'; reason: string };

/** What an employee is doing right now, as shown in the office. */
export type EmployeeStatus = 'idle' | 'away' | 'running' | 'needs_input' | 'done';

/** Where an employee's body is, as reported by the game world. */
export type Presence = 'seated' | 'walking' | 'away';

/** GET /api/state */
export interface OfficeSnapshot {
  /** Server clock, epoch ms, so clients can line up "finished 3s ago" with their own clock. */
  serverTime: number;
  employees: Employee[];
  tasks: Task[];
  /** Every desk id in the office map. */
  desks: string[];
  agents: AgentsInfo;
  /** Claude runs are waiting for someone to call POST /api/work. */
  workPending: boolean;
}

export interface NewEmployee {
  name: string;
  role: string;
  skills: SkillName[];
  look: Look;
  /** Omit to take the first free desk. */
  deskId?: string;
}

export type EmployeePatch = Partial<Omit<Employee, 'id'>>;

export interface NewTask {
  /** An employee id, or 'auto' to pick the least busy employee with the skill. */
  assigneeId: string;
  title: string;
  details?: string;
  skill: SkillName;
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'details' | 'skill' | 'assigneeId'>>;
