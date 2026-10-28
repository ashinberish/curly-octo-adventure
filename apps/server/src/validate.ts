// Hand-rolled request validation: the payloads are small and this keeps the function bundle lean.
import { SKILL_NAMES, type EmployeePatch, type HairStyle, type Look, type NewEmployee, type NewTask, type SkillName, type TaskPatch } from '@pixel-office/shared';
import { HttpError } from './errors.ts';

type Obj = Record<string, unknown>;

function object(body: unknown): Obj {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object');
  return body as Obj;
}

function text(o: Obj, key: string, max: number, opts: { min?: number; optional?: boolean } = {}): string | undefined {
  const v = o[key];
  if (v === undefined && opts.optional) return undefined;
  if (typeof v !== 'string') throw new HttpError(400, `${key} must be a string`);
  const s = v.trim();
  if (s.length < (opts.min ?? 1)) throw new HttpError(400, `${key} is required`);
  if (s.length > max) throw new HttpError(400, `${key} must be at most ${max} characters`);
  return s;
}

function skill(v: unknown, key = 'skill'): SkillName {
  if (!SKILL_NAMES.includes(v as SkillName)) throw new HttpError(400, `${key} must be one of ${SKILL_NAMES.join(', ')}`);
  return v as SkillName;
}

function skills(v: unknown): SkillName[] {
  if (!Array.isArray(v)) throw new HttpError(400, 'skills must be an array');
  return [...new Set(v.map(s => skill(s, 'skills[]')))];
}

const COLOR = /^#[0-9a-f]{6}$/i;
const STYLES: HairStyle[] = ['short', 'long', 'bun', 'bald'];

function look(v: unknown): Look {
  const o = object(v);
  for (const k of ['hair', 'skin', 'shirt', 'pants'] as const) {
    if (typeof o[k] !== 'string' || !COLOR.test(o[k] as string)) throw new HttpError(400, `look.${k} must be a #rrggbb colour`);
  }
  if (!STYLES.includes(o.style as HairStyle)) throw new HttpError(400, `look.style must be one of ${STYLES.join(', ')}`);
  return { hair: o.hair as string, skin: o.skin as string, shirt: o.shirt as string, pants: o.pants as string, style: o.style as HairStyle };
}

export function newEmployee(body: unknown): NewEmployee {
  const o = object(body);
  return {
    name: text(o, 'name', 40)!,
    role: text(o, 'role', 60)!,
    skills: o.skills === undefined ? [] : skills(o.skills),
    look: look(o.look),
    deskId: text(o, 'deskId', 40, { optional: true }),
  };
}

export function employeePatch(body: unknown): EmployeePatch {
  const o = object(body);
  const patch: EmployeePatch = {};
  if (o.name !== undefined) patch.name = text(o, 'name', 40);
  if (o.role !== undefined) patch.role = text(o, 'role', 60);
  if (o.skills !== undefined) patch.skills = skills(o.skills);
  if (o.look !== undefined) patch.look = look(o.look);
  if (o.deskId !== undefined) patch.deskId = text(o, 'deskId', 40);
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to change');
  return patch;
}

export function newTask(body: unknown): NewTask {
  const o = object(body);
  return {
    assigneeId: text(o, 'assigneeId', 60)!,
    title: text(o, 'title', 120)!,
    details: text(o, 'details', 4000, { min: 0, optional: true }) ?? '',
    skill: skill(o.skill),
  };
}

export function taskPatch(body: unknown): TaskPatch {
  const o = object(body);
  const patch: TaskPatch = {};
  if (o.title !== undefined) patch.title = text(o, 'title', 120);
  if (o.details !== undefined) patch.details = text(o, 'details', 4000, { min: 0 });
  if (o.skill !== undefined) patch.skill = skill(o.skill);
  if (o.assigneeId !== undefined) patch.assigneeId = text(o, 'assigneeId', 60);
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to change');
  return patch;
}

export function permission(body: unknown): boolean {
  const o = object(body);
  if (typeof o.allow !== 'boolean') throw new HttpError(400, 'allow must be true or false');
  return o.allow;
}
