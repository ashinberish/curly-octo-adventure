import type { Employee, EmployeePatch, LogLine, NewEmployee, NewTask, OfficeSnapshot, Task, TaskPatch } from '@pixel-office/shared';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface OfficeApi {
  state(): Promise<OfficeSnapshot>;
  events(taskId: number, after: number): Promise<LogLine[]>;
  hire(input: NewEmployee): Promise<Employee>;
  updateEmployee(id: string, patch: EmployeePatch): Promise<Employee>;
  fire(id: string): Promise<void>;
  addTask(input: NewTask): Promise<Task>;
  updateTask(id: number, patch: TaskPatch): Promise<Task>;
  cancelTask(id: number): Promise<Task>;
  answerPermission(id: number, allow: boolean): Promise<Task>;
}

const TOKEN_KEY = 'pixel-office-token';

export const tokenStorage = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string | null): void {
    try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode: keep it for this page only */ }
  },
};

export function httpApi(base = '/api', getToken: () => string | null = tokenStorage.get): OfficeApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'Can’t reach the office server');
    }
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) throw new ApiError(res.status, data?.error ?? `Office server error (${res.status})`);
    return data as T;
  }

  return {
    state: () => call('GET', '/state'),
    events: async (taskId, after) => (await call<{ events: LogLine[] }>('GET', `/tasks/${taskId}/events?after=${after}`)).events,
    hire: input => call('POST', '/employees', input),
    updateEmployee: (id, patch) => call('PATCH', `/employees/${encodeURIComponent(id)}`, patch),
    fire: async id => { await call('DELETE', `/employees/${encodeURIComponent(id)}`); },
    addTask: input => call('POST', '/tasks', input),
    updateTask: (id, patch) => call('PATCH', `/tasks/${id}`, patch),
    cancelTask: id => call('POST', `/tasks/${id}/cancel`),
    answerPermission: (id, allow) => call('POST', `/tasks/${id}/permission`, { allow }),
  };
}
