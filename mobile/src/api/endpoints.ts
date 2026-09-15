import type { MaterialUsageInput } from "@contracts/worker";
import type { RoleValue, TaskStatusValue } from "@contracts/enums";
import { api } from "./client";

/**
 * Every call the app makes, in one place.
 *
 * The request shapes come from `src/contracts` in the repo root — the same
 * schemas the API validates against — so posting the wrong field fails to
 * compile here rather than 400ing on a pool deck.
 *
 * The response types are declared locally and deliberately. They mirror the
 * services' return types, but importing those would drag Prisma into the
 * bundle; keeping them here is the price of a mobile app that doesn't ship a
 * database client.
 */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: RoleValue;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type AuthSession = AuthTokens & { user: SessionUser };

export type BusinessDay = {
  timezone: string;
  /** `YYYY-MM-DD` in the business's timezone — not the device's. */
  today: string;
  tomorrow: string;
};

export type WorkerTask = {
  id: string;
  status: TaskStatusValue;
  startTime: string;
  /** Business-local calendar day. Group by comparing this to BusinessDay. */
  dayKey: string;
  durationMin: number;
  price: number;
  notes: string | null;
  flagReason: string | null;
  submittedAt: string | null;
  clientName: string;
  clientPhone: string | null;
  poolAddress: string;
  serviceName: string;
};

export type TaskListResponse<T> = {
  tasks: T[];
  businessDay: BusinessDay;
};

export type MaterialOption = {
  id: string;
  name: string;
  unit: string;
};

export const auth = {
  login: (email: string, password: string) =>
    api.post<AuthSession>("/auth/login", { email, password }, { anonymous: true }),

  /** Best effort — the server answers 204 even for a token it doesn't know. */
  logout: (refreshToken: string) =>
    api.post<void>("/auth/logout", { refreshToken }, { anonymous: true }),
};

export const me = {
  get: () => api.get<SessionUser & { createdAt: string }>("/me"),
  update: (fields: { name: string; phone?: string }) =>
    api.patch<SessionUser>("/me", fields),
  changePassword: (fields: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => api.post<void>("/me/password", fields),
};

export const tasks = {
  mine: () => api.get<TaskListResponse<WorkerTask>>("/tasks?view=mine"),
  start: (taskId: string) => api.post<void>(`/tasks/${taskId}/start`),
  submit: (taskId: string, usage: MaterialUsageInput[]) =>
    api.post<void>(`/tasks/${taskId}/submit`, { usage }),
};

export const materials = {
  /** Active catalog only — what can go on new work. Names and units, no prices. */
  usable: () => api.get<MaterialOption[]>("/materials"),
};

export const notifications = {
  /**
   * Polled on foreground and pull-to-refresh. The web pushes this over SSE,
   * which React Native has no EventSource for and iOS would suspend anyway.
   */
  get: () =>
    api.get<{ unread: number; items: { id: string; message: string }[] }>(
      "/notifications"
    ),
};
