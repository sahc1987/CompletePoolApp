import type {
  CreateMaterialRequestInput,
  MaterialUsageInput,
} from "@contracts/worker";
import type { CreateTaskInput, EditTaskInput } from "@contracts/scheduling";
import type {
  AddLineItemInput,
  CreateEstimateInput,
  DeclineEstimateInput,
  SignEstimateInput,
} from "@contracts/estimates";
import type {
  EstimateStatusValue,
  MaterialRequestStatusValue,
  PaymentMethodValue,
  RoleValue,
  TaskStatusValue,
} from "@contracts/enums";
import type { ClientFieldsInput, PoolFieldsInput } from "@contracts/clients";
import type { PaymentDetailsInput } from "@contracts/billing";
import type {
  AdjustStockInput,
  RespondMaterialRequestInput,
  SaveMaterialInput,
} from "@contracts/materials";
import type { CreateUserInput, SaveEmploymentInput } from "@contracts/users";
import type {
  CompanyInfoInput,
  SaveExtraInput,
  SaveServiceInput,
  SaveTaxRateInput,
  SaveWorkHoursInput,
} from "@contracts/settings";
import { api, downloadFile } from "./client";

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

  /** The public read-only demo login, or null while the demo is switched off. */
  demo: () =>
    api.get<{ email: string; password: string } | null>("/auth/demo", { anonymous: true }),

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

  // --- Admin ---------------------------------------------------------------
  /** Jobs submitted and waiting on an admin's approve/flag. */
  reviewQueue: () => api.get<TaskListResponse<ReviewTask>>("/tasks?view=review"),
  create: (input: CreateTaskInput) => api.post<{ id: string }>("/tasks", input),
  edit: (taskId: string, input: Omit<EditTaskInput, "taskId">) =>
    api.patch<void>(`/tasks/${taskId}`, input),
  approve: (taskId: string) => api.post<void>(`/tasks/${taskId}/approve`),
  flag: (taskId: string, reason: string) => api.post<void>(`/tasks/${taskId}/flag`, { reason }),
  /** `override` is required when the worker never submitted the job. */
  finish: (taskId: string, usage: MaterialUsageInput[], override: boolean) =>
    api.post<void>(`/tasks/${taskId}/finish`, { usage, override }),
  cancel: (taskId: string) => api.post<void>(`/tasks/${taskId}/cancel`),
  endSeries: (taskId: string) =>
    api.post<{ cancelled: number }>(`/tasks/${taskId}/end-series`),
};

export type ReviewTask = WorkerTask & {
  workerName: string;
  photoCount: number;
  extras: { id: string; name: string; price: number }[];
  materials: { materialId: string; name: string; unit: string; quantityUsed: number; customerPrice: number }[];
};

export type AgendaTask = {
  id: string;
  dayKey: string;
  start: string;
  /** Already formatted in the business's zone. */
  timeLabel: string;
  endLabel: string;
  /** Business-local "HH:MM" — what the edit form sends back. */
  time: string;
  durationMin: number;
  status: TaskStatusValue;
  clientName: string;
  poolAddress: string;
  serviceId: string;
  serviceName: string;
  workerId: string;
  workerName: string;
  notes: string | null;
  flagReason: string | null;
  /** Null for workers. */
  price: number | null;
  recurring: boolean;
  extras: string[];
  materialsUsed: { materialId: string; name: string; unit: string; quantityUsed: number }[];
  /** Admins only. */
  bill: {
    amount: number;
    paid: number;
    balance: number;
    status: "PENDING" | "PARTIAL" | "PAID";
    method: "CASH" | "CHECK" | "ONLINE" | null;
  } | null;
};

export type Agenda = {
  day: string;
  dayLabel: string;
  today: string;
  prevWeek: string;
  nextWeek: string;
  week: { day: string; weekday: string; dateNum: string; count: number }[];
  tasks: AgendaTask[];
  hours: { startMin: number; endMin: number };
};

export const agenda = {
  /** Omit `day` for today, as the business counts it. */
  get: (day?: string) =>
    api.get<Agenda>(day ? `/agenda?day=${encodeURIComponent(day)}` : "/agenda"),
};

export type SchedulingCatalog = {
  clients: { id: string; name: string; pools: { id: string; address: string }[] }[];
  workers: { id: string; name: string }[];
  services: { id: string; name: string; basePrice: number; defaultDurationMin: number }[];
  extras: { id: string; name: string; price: number }[];
  hours: { startMin: number; endMin: number; timezone: string };
  hasClientsWithPools: boolean;
};

export const scheduling = {
  catalog: () => api.get<SchedulingCatalog>("/scheduling/catalog"),
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

export type RouteStop = {
  taskId: string;
  workerId: string;
  workerName: string;
  /** 1-based position in the worker's day. */
  order: number;
  clientName: string;
  serviceName: string;
  address: string;
  start: string;
  /** Already formatted in the business's zone, e.g. "9:30 AM". */
  timeLabel: string;
  durationMin: number;
  status: TaskStatusValue;
  /** Null when the address couldn't be placed on the map. */
  lat: number | null;
  lng: number | null;
};

export type DayRoute = {
  day: string;
  dayLabel: string;
  today: string;
  prevDay: string;
  nextDay: string;
  workers: { id: string; name: string }[];
  stops: RouteStop[];
};

export const dayRoute = {
  /** Omit `day` for today, as the business counts it. */
  get: (day?: string) =>
    api.get<DayRoute>(day ? `/day-route?day=${encodeURIComponent(day)}` : "/day-route"),
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

// ── Clients and pools (admin) ────────────────────────────────────────────────

export type ClientListRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  poolCount: number;
  taskCount: number;
};

export type ClientListPage = {
  rows: ClientListRow[];
  total: number;
  totalUnfiltered: number;
  page: number;
  perPage: number;
  totalPages: number;
};

export type PoolRow = {
  id: string;
  address: string;
  size: string | null;
  type: string | null;
};

export type ClientDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  pools: PoolRow[];
  taskCount: number;
  estimateCount: number;
  /** False once any job or estimate references the client. */
  deletable: boolean;
};

export const clients = {
  list: (q: string, page = 1) =>
    api.get<ClientListPage>(
      `/clients?q=${encodeURIComponent(q)}&page=${page}&perPage=25`
    ),
  get: (id: string) => api.get<ClientDetail>(`/clients/${id}`),
  create: (input: ClientFieldsInput) => api.post<{ id: string }>("/clients", input),
  update: (id: string, input: ClientFieldsInput) =>
    api.patch<void>(`/clients/${id}`, input),
  remove: (id: string) => api.del<void>(`/clients/${id}`),
  addPool: (clientId: string, input: PoolFieldsInput) =>
    api.post<{ id: string }>(`/clients/${clientId}/pools`, input),
};

export const pools = {
  update: (id: string, input: PoolFieldsInput) => api.patch<void>(`/pools/${id}`, input),
  remove: (id: string) => api.del<void>(`/pools/${id}`),
};

// ── Billing (admin; the owner reads) ─────────────────────────────────────────

export type BillStatus = "PENDING" | "PARTIAL" | "PAID";
export type BillStatusFilter = "all" | "pending" | "partial" | "paid" | "open";

export type BillPayment = {
  id: string;
  receiptNo: number;
  amount: number;
  method: PaymentMethodValue;
  checkNumber: string | null;
  billingAddress: string | null;
  note: string | null;
  paidAt: string;
  recordedBy: string | null;
  balanceAfter: number;
};

export type Bill = {
  id: string;
  invoiceNo: number;
  status: BillStatus;
  createdAt: string;
  amount: number;
  paid: number;
  balance: number;
  lineItems: { description: string; detail?: string; amount: number }[];
  subtotal: number;
  taxes: { name: string; ratePercent: number; amount: number }[];
  /** The customer's online pay link while something is owed; else null. */
  payUrl: string | null;
  payments: BillPayment[];
  reversals: {
    id: string;
    reason: string;
    amountReversed: number;
    paymentCount: number;
    reversedBy: string | null;
    createdAt: string;
  }[];
  task: {
    id: string;
    date: string;
    serviceName: string;
    poolAddress: string;
    client: {
      id: string;
      name: string;
      address: string | null;
      phone: string | null;
      email: string | null;
    };
  };
};

export type BillRange = "all" | "day" | "week" | "month" | "custom";

export type BillListPage = {
  /** `paid` is all-time; `paidInPeriod` is the slice inside the chosen period. */
  rows: (Bill & { paidInPeriod: number })[];
  counts: Record<BillStatusFilter, number>;
  totals: { billed: number; collected: number; outstanding: number };
  page: number;
  perPage: number;
  totalPages: number;
  total: number;
  /** The business timezone, for showing dates. */
  timezone: string;
  /** The period as the server resolved it, with day keys for the arrows. */
  period: {
    range: BillRange;
    label: string | null;
    todayValue: string;
    dayValue: string;
    prevDay: string;
    nextDay: string;
  };
};

export type BillDetail = Bill & { timezone: string };

export const invoiceNumber = (n: number) => `INV-${String(n).padStart(6, "0")}`;
export const receiptNumber = (n: number) => `RCP-${String(n).padStart(6, "0")}`;

export const bills = {
  list: (
    opts: {
      status?: BillStatusFilter;
      clientId?: string;
      page?: number;
      perPage?: number;
      range?: BillRange;
      /** YYYY-MM-DD in the business zone; for "day", the day. */
      from?: string;
      to?: string;
    } = {}
  ) => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.clientId) q.set("clientId", opts.clientId);
    if (opts.page) q.set("page", String(opts.page));
    if (opts.perPage) q.set("perPage", String(opts.perPage));
    if (opts.range && opts.range !== "all") q.set("range", opts.range);
    if (opts.from) q.set("from", opts.from);
    if (opts.to) q.set("to", opts.to);
    const qs = q.toString();
    return api.get<BillListPage>(qs ? `/bills?${qs}` : "/bills");
  },
  get: (id: string) => api.get<BillDetail>(`/bills/${id}`),
  pay: (id: string, input: PaymentDetailsInput) =>
    api.post<void>(`/bills/${id}/payments`, input),
  reverse: (id: string, reason: string) =>
    api.post<void>(`/bills/${id}/reverse`, { reason }),
  /** Downloads the PDF and returns its local URI. */
  invoicePdf: (bill: Pick<Bill, "id" | "invoiceNo">) =>
    downloadFile(`/bills/${bill.id}/invoice`, `invoice-${invoiceNumber(bill.invoiceNo)}.pdf`),
  receiptPdf: (billId: string, payment: Pick<BillPayment, "id" | "receiptNo">) =>
    downloadFile(
      `/bills/${billId}/receipts/${payment.id}`,
      `receipt-${receiptNumber(payment.receiptNo)}.pdf`
    ),
};

// ── Materials and stock (admin) ──────────────────────────────────────────────

export type MaterialRow = MaterialOption & {
  costPrice: number;
  customerPrice: number;
  quantityOnHand: number;
  reorderThreshold: number;
  active: boolean;
  /** At or below the reorder threshold, and still in use. */
  low: boolean;
};

export type PendingMaterialRequest = MaterialRequest & {
  workerName: string | null;
  /** The client whose job prompted it, when tied to one. */
  taskClientName: string | null;
};

type MaterialFields = Omit<SaveMaterialInput, "id">;

export const materialsAdmin = {
  catalog: () => api.get<MaterialRow[]>("/materials/catalog"),
  create: (input: MaterialFields) => api.post<{ id: string }>("/materials/catalog", input),
  update: (id: string, input: MaterialFields) => api.patch<void>(`/materials/${id}`, input),
  toggle: (id: string) => api.post<{ active: boolean }>(`/materials/${id}/toggle`),
  adjustStock: (id: string, input: Omit<AdjustStockInput, "materialId">) =>
    api.post<void>(`/materials/${id}/stock`, input),
  pendingRequests: () => api.get<PendingMaterialRequest[]>("/material-requests/pending"),
  respond: (id: string, input: Omit<RespondMaterialRequestInput, "requestId">) =>
    api.post<void>(`/material-requests/${id}/respond`, input),
};

// ── Team (admin and owner) ───────────────────────────────────────────────────

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: RoleValue;
  active: boolean;
  hourlyRate: number | null;
  hiredOn: string | null;
  birthday: string | null;
  assignedTaskCount: number;
  isSelf: boolean;
  administrable: boolean;
  isLastManager: boolean;
  /** No account control should be offered. */
  locked: boolean;
};

export type TeamList = {
  members: TeamMember[];
  activeCount: number;
  grantableRoles: RoleValue[];
};

export type TeamMemberDetail = TeamMember & {
  createdAt: string;
  payRateHistory: {
    id: string;
    oldRate: number | null;
    newRate: number;
    changedBy: string | null;
    note: string | null;
    createdAt: string;
  }[];
  weeks: { weekStart: string; jobs: number; minutes: number; hours: number; pay: number | null }[];
  timezone: string;
  totalMinutes: number;
  totalPay: number;
};

export const team = {
  list: () => api.get<TeamList>("/users"),
  get: (id: string) => api.get<TeamMemberDetail>(`/users/${id}`),
  create: (input: CreateUserInput) => api.post<{ id: string }>("/users", input),
  setRole: (id: string, role: RoleValue) => api.post<void>(`/users/${id}/role`, { role }),
  toggleActive: (id: string) => api.post<{ active: boolean }>(`/users/${id}/toggle-active`),
  saveEmployment: (id: string, input: Omit<SaveEmploymentInput, "userId">) =>
    api.put<void>(`/users/${id}/employment`, input),
  resetPassword: (id: string, password: string) =>
    api.post<void>(`/users/${id}/password`, { password }),
};

// ── Settings (admin) ─────────────────────────────────────────────────────────

export type ServiceRow = { id: string; name: string; basePrice: number; defaultDurationMin: number };
export type ExtraRow = { id: string; name: string; price: number };
export type TaxRateRow = { id: string; name: string; rate: number; active: boolean };

export type BusinessSettings = {
  services: ServiceRow[];
  extras: ExtraRow[];
  taxRates: TaxRateRow[];
  hours: { startMin: number; endMin: number; timezone: string };
  company: CompanyInfo;
};

/** What invoices and receipts print about the business. */
export type CompanyInfo = {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  paymentTerms: string;
  paymentNote: string | null;
  documentFooter: string | null;
};

export const settings = {
  get: () => api.get<BusinessSettings>("/settings"),
  saveHours: (input: SaveWorkHoursInput) => api.put<void>("/settings/hours", input),
  saveCompany: (input: CompanyInfoInput) => api.put<void>("/settings/company", input),
  createService: (input: Omit<SaveServiceInput, "id">) =>
    api.post<{ id: string }>("/settings/services", input),
  updateService: (id: string, input: Omit<SaveServiceInput, "id">) =>
    api.patch<void>(`/settings/services/${id}`, input),
  deleteService: (id: string) => api.del<void>(`/settings/services/${id}`),
  createExtra: (input: Omit<SaveExtraInput, "id">) =>
    api.post<{ id: string }>("/settings/extras", input),
  updateExtra: (id: string, input: Omit<SaveExtraInput, "id">) =>
    api.patch<void>(`/settings/extras/${id}`, input),
  deleteExtra: (id: string) => api.del<void>(`/settings/extras/${id}`),
  createTaxRate: (input: Omit<SaveTaxRateInput, "id">) =>
    api.post<{ id: string }>("/settings/tax-rates", input),
  updateTaxRate: (id: string, input: Omit<SaveTaxRateInput, "id">) =>
    api.patch<void>(`/settings/tax-rates/${id}`, input),
  toggleTaxRate: (id: string) => api.post<{ active: boolean }>(`/settings/tax-rates/${id}/toggle`),
};

// ── KPIs (owner) ─────────────────────────────────────────────────────────────

export type KpiSummary = {
  revenue: number;
  margin: number;
  marginPct: number;
  materialCost: number;
  materialBilled: number;
  totalMinutes: number;
  approvedJobs: number;
  onTimeCount: number;
  submittedCount: number;
  onTimePct: number;
  signedEstimateTotal: number;
  signedEstimateCount: number;
  workers: { id: string; name: string; revenue: number; jobs: number; minutes: number }[];
  materials: {
    materialId: string;
    name: string;
    unit: string;
    qty: number;
    cost: number;
    billed: number;
  }[];
};

export const kpi = {
  get: () => api.get<KpiSummary>("/kpi"),
};
