// What an employee's agent can use, decided by their skills.
//
// Server tools (web search, web fetch, code execution) run on Anthropic's side: nothing to
// host. The office tools below run here: a per-task workspace of files stored in Postgres,
// and ask_human, which pauses the task until you answer in the panel.
import type Anthropic from '@anthropic-ai/sdk';
import type { SkillName } from '@pixel-office/shared';

type Tool = Anthropic.Beta.BetaToolUnion;

const CODE_SKILLS: SkillName[] = ['Code', 'Data', 'QA', 'DevOps'];

export const MAX_FILES = 50;
export const MAX_FILE_BYTES = 100_000;

/** Office tools, all streamed eagerly (file bodies can be long) and validated in validateToolInput. */
export const OFFICE_TOOLS: Tool[] = [
  {
    name: 'write_file',
    description:
      'Save a deliverable in your task workspace, replacing any file at that path. Your manager reads these files, ' +
      'so put every result here: documents as .md, designs as self-contained .html, code in its source file. ' +
      `Paths are relative, like "report.md" or "src/app.ts". Up to ${MAX_FILES} files of ${MAX_FILE_BYTES / 1000} KB each; ` +
      'split long deliverables into several files rather than one huge one.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path, e.g. "notes/summary.md"' },
        content: { type: 'string', description: 'The full file contents' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file you saved earlier in this task workspace.',
    eager_input_streaming: true,
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'list_files',
    description: 'List the files in this task workspace.',
    eager_input_streaming: true,
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'ask_human',
    description:
      'Ask your manager a question and wait for the answer. Call this only when you are blocked on a decision or ' +
      'information that only they have (a preference, an account detail, approval for something irreversible). ' +
      'Ask one clear question; for yes/no questions, say so.',
    eager_input_streaming: true,
    input_schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
  },
];

export const hasCodeSandbox = (skills: readonly SkillName[]) => skills.some(s => CODE_SKILLS.includes(s));
export const hasWeb = (skills: readonly SkillName[]) => skills.includes('Research');

export function toolsForSkills(skills: readonly SkillName[]): Tool[] {
  const tools: Tool[] = [];
  const code = hasCodeSandbox(skills);
  if (hasWeb(skills)) {
    // The 20260209 web tools filter results with their own built-in code execution; pairing
    // them with a separate code_execution tool confuses the model, so sandbox users get
    // the basic web tools instead.
    if (code) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }, { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 8 });
    else tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 });
  }
  if (code) tools.push({ type: 'code_execution_20260120', name: 'code_execution' });
  return [...tools, ...OFFICE_TOOLS];
}

export type OfficeToolCall =
  | { name: 'write_file'; path: string; content: string }
  | { name: 'read_file'; path: string }
  | { name: 'list_files' }
  | { name: 'ask_human'; question: string };

/** Workspace paths: relative, no "..", a conservative character set. */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string') return null;
  const raw = p.trim().replace(/\\/g, '/');
  if (raw.startsWith('/')) return null;
  const parts = raw.split('/').filter(s => s && s !== '.');
  if (!parts.length || parts.some(s => s === '..' || !/^[\w.\- ]+$/.test(s))) return null;
  const path = parts.join('/');
  return path.length <= 200 ? path : null;
}

/**
 * With eager input streaming the API doesn't validate tool inputs, and the SDK's tolerant
 * parser can hand back a truncated object, so every input is checked here before it runs.
 */
export function validateToolInput(name: string, input: unknown): OfficeToolCall | { error: string } {
  const o = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  switch (name) {
    case 'write_file': {
      const path = cleanPath(o.path);
      if (!path) return { error: 'path must be a relative path like "report.md" (letters, digits, . _ - and /, no "..")' };
      if (typeof o.content !== 'string') return { error: 'content must be a string' };
      if (Buffer.byteLength(o.content) > MAX_FILE_BYTES) return { error: `content is larger than ${MAX_FILE_BYTES / 1000} KB; split it into several files` };
      return { name, path, content: o.content };
    }
    case 'read_file': {
      const path = cleanPath(o.path);
      return path ? { name, path } : { error: 'path must be a relative path' };
    }
    case 'list_files':
      return { name };
    case 'ask_human': {
      if (typeof o.question !== 'string' || !o.question.trim()) return { error: 'question must be a non-empty string' };
      return { name, question: o.question.trim().slice(0, 1000) };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
