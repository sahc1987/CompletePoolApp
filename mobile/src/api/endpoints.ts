import type {
  CreateMaterialRequestInput,
  MaterialUsageInput,
} from "@contracts/worker";
import type {
  AddLineItemInput,
  CreateEstimateInput,
  DeclineEstimateInput,
  SignEstimateInput,
} from "@contracts/estimates";
import type {
  EstimateStatusValue,
  MaterialRequestStatusValue,
  RoleValue,
  TaskStatusValue,
} from "@contracts/enums";
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

export type MaterialRequest = {
  id: string;
  materialId: string | null;
  materialName: string | null;
  materialUnit: string | null;
  description: string | null;
  quantityRequested: number;
  urgent: boolean;
  status: MaterialRequestStatusValue;
  responseNote: string | null;
  createdAt: string;
  respondedAt: string | null;
  taskId: string | null;
};

export const materialRequests = {
  mine: () => api.get<MaterialRequest[]>("/material-requests"),
  /** Never changes stock — an admin approves, then restocks when it arrives. */
  create: (input: CreateMaterialRequestInput) =>
    api.post<{ id: string }>("/material-requests", input),
};

export type EstimateListRow = {
  id: string;
  status: EstimateStatusValue;
  clientName: string;
  createdByName: string;
  total: number | null;
  createdAt: string;
  presentedAt: string | null;
  signedAt: string | null;
  validUntil: string | null;
};

export type EstimateDetail = {
  id: string;
  status: EstimateStatusValue;
  clientId: string;
  clientName: string;
  poolId: string | null;
  poolAddress: string | null;
  createdByName: string;
  notes: string | null;
  validUntil: string | null;
  createdAt: string;
  presentedAt: string | null;
  signedByName: string | null;
  signatureData: string | null;
  signedAt: string | null;
  declineReason: string | null;
  respondedAt: string | null;
  convertedTaskId: string | null;
  lineItems: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
  taxes: {
    id: string;
    taxRateId: string | null;
    name: string;
    ratePercent: number;
    amount: number;
  }[];
  subtotal: number | null;
  taxTotal: number | null;
  total: number | null;
  isDraft: boolean;
  isPresented: boolean;
  availableTaxRates: { id: string; name: string; rate: number }[];
};

export type EstimateCatalog = {
  clients: { id: string; name: string; pools: { id: string; address: string }[] }[];
  lineItems: { name: string; price: number; kind: "Service" | "Extra" | "Material" }[];
};

/** Fields the line-item, sign and decline calls send, minus the id in the path. */
type WithoutEstimate<T> = Omit<T, "estimateId">;

export const estimates = {
  list: () => api.get<EstimateListRow[]>("/estimates"),
  catalog: () => api.get<EstimateCatalog>("/estimates/catalog"),
  get: (id: string) => api.get<EstimateDetail>(`/estimates/${id}`),
  create: (input: CreateEstimateInput) =>
    api.post<{ id: string; createdClient: boolean }>("/estimates", input),
  remove: (id: string) => api.del<void>(`/estimates/${id}`),
  addLine: (id: string, line: WithoutEstimate<AddLineItemInput>) =>
    api.post<{ id: string }>(`/estimates/${id}/line-items`, line),
  removeLine: (id: string, lineId: string) =>
    api.del<void>(`/estimates/${id}/line-items/${lineId}`),
  addTax: (id: string, taxRateId: string) =>
    api.post<void>(`/estimates/${id}/taxes`, { taxRateId }),
  removeTax: (id: string, taxId: string) =>
    api.del<void>(`/estimates/${id}/taxes/${taxId}`),
  present: (id: string) => api.post<void>(`/estimates/${id}/present`),
  backToDraft: (id: string) => api.post<void>(`/estimates/${id}/draft`),
  sign: (id: string, body: WithoutEstimate<SignEstimateInput>) =>
    api.post<void>(`/estimates/${id}/sign`, body),
  decline: (id: string, body: WithoutEstimate<DeclineEstimateInput>) =>
    api.post<void>(`/estimates/${id}/decline`, body),
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
