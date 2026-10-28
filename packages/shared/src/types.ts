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

export type TaskStatus = 'queued' | 'running' | 'needs_input' | 'done';

export type LogKind = 'sys' | 'text' | 'tool' | 'perm' | 'done' | 'deny';

export interface LogLine {
  kind: LogKind;
  text: string;
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
  log: LogLine[];
  /** Tool call waiting for the user's approval, when status is needs_input. */
  awaiting: string | null;
}

/** What an employee is doing right now, as shown in the office. */
export type EmployeeStatus = 'idle' | 'away' | 'running' | 'needs_input' | 'done';

/** Where an employee's body is, as reported by the game world. */
export type Presence = 'seated' | 'walking' | 'away';
