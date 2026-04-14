import axios from "axios";

export type DocumentStatus = "Загружен" | "На согласовании" | "На доработке" | "Отклонен" | "Согласован";

export type DocumentRow = {
  key: string;
  id: string;
  type: string;
  title: string;
  initiator: string;
  amount: string;
  status: DocumentStatus;
  createdAt?: string;
};

export type DocumentFormPayload = {
  type: string;
  number: string;
  date: string;
  customerName: string;
  customerInn: string;
  executorName: string;
  executorInn: string;
  amount: number;
  subject: string;
  note?: string;
};

export type ListMyDocumentsParams = {
  status?: DocumentStatus;
  type?: string;
  q?: string;
  number?: string;
  counterparty?: string;
  inn?: string;
  dateFrom?: string;
  dateTo?: string;
};

/** Ключи статусов как в API/БД (сводка «Мои документы»). */
export type MyDocumentsByStatusApiKey = "uploaded" | "in_approval" | "revision" | "rejected" | "approved";

export type MyDocumentsByStatusStats = {
  byStatus: Record<MyDocumentsByStatusApiKey, number>;
};

export type DocumentHistoryVariant =
  | "create"
  | "submit"
  | "withdraw"
  | "resubmit"
  | "approve"
  | "reject"
  | "revise"
  | "update"
  | "other";

export type DocumentHistoryItem = {
  id: string;
  date: string;
  action: string;
  author: string;
  variant?: DocumentHistoryVariant;
};

export type DocumentDetails = {
  id: string;
  type: string;
  title: string;
  status: DocumentStatus;
  initiator: string;
  amount: string;
  currentStep: string;
  activeTaskId?: string | null;
  canApproveCurrentStep?: boolean;
  canWithdrawDocuments?: boolean;
  canDeleteDocuments?: boolean;
  canSubmitForApproval?: boolean;
  canResubmitForApproval?: boolean;
  createdAt: string;
  updatedAt: string;
  history: DocumentHistoryItem[];
  fields?: {
    number: string;
    date: string;
    customerName: string;
    customerInn: string;
    executorName: string;
    executorInn: string;
    subject: string;
    note?: string | null;
  };
};

export type ApprovalRow = {
  key: string;
  id: string;
  type: string;
  title: string;
  initiator: string;
  /** Сумма по документу (как в БД, строка). */
  amount: string;
  /** Полных календарных дней с даты назначения задачи (по серверной дате). */
  waitingDays: number;
  currentStep: string;
  receivedAt: string;
  priority: "Обычный" | "Срочно";
  documentId?: string;
  canTakeDecision?: boolean;
};

export type ListMyApprovalsParams = {
  q?: string;
  type?: string;
  page?: number;
  pageSize?: number;
};

export type ApprovalListResponse = {
  items: ApprovalRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
};

/** DTO пользователя: login, GET/PATCH /users/me */
export type UserProfile = {
  fullName: string;
  email: string;
  roleLabel: string;
  position?: string;
  /** ID компании (tenant); `null` у платформенного админа или без привязки */
  companyId: number | null;
  /** Роль в приложении: администратор компании/платформы или сотрудник */
  role: "admin" | "employee";
  /** Нужно сменить пароль (одноразовый / сброс); то же, что `isTemporaryPassword` в ответе login, дублируется в профиле. */
  mustChangePassword: boolean;
};

export type AuthUser = UserProfile;

/** Управление компаниями и глобальным списком сотрудников в API — только при `companyId === null`. */
export function isPlatformAdminUser(user: Pick<UserProfile, "role" | "companyId">): boolean {
  return user.role === "admin" && user.companyId == null;
}

export function getStoredUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    if (
      parsed &&
      typeof parsed.email === "string" &&
      (parsed.role === "admin" || parsed.role === "employee")
    ) {
      return {
        ...parsed,
        mustChangePassword: parsed.mustChangePassword === true
      };
    }
    return null;
  } catch {
    return null;
  }
}

export type EmployeeRow = {
  key: string;
  fullName: string;
  email: string;
  position: string;
  roles: string[];
  status: "Активен" | "Неактивен";
};

export type RouteRow = {
  key: string;
  documentType: string;
  routeName: string;
  steps: string;
};

/** Зарегистрированные компании (ответ GET /admin/companies). */
export type RegisteredCompanyRow = {
  key: string;
  companyName: string;
  inn: string;
  adminFullName: string;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3003/api";
const USE_MOCK_API = (import.meta.env.VITE_USE_MOCK_API ?? "false") === "true";
const USE_MOCK_ADMIN_API = (import.meta.env.VITE_USE_MOCK_ADMIN_API ?? "false") === "true";
const USE_MOCK_PROFILE_API = (import.meta.env.VITE_USE_MOCK_PROFILE_API ?? "false") === "true";

export const AUTH_TOKEN_STORAGE_KEY = "docflow-auth-token";
export const AUTH_USER_STORAGE_KEY = "docflow-auth-user";
export const USER_ROLE_STORAGE_KEY = "docflow-user-role";

/** Должен совпадать с `PLATFORM_DEMO_ADMIN_EMAIL` на сервере (`admin.controller.ts`). */
export const PLATFORM_DEMO_ADMIN_EMAIL = "platform-admin@docflow.local";

const httpClient = axios.create({
  baseURL: API_BASE_URL
});

httpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const mockDocuments: DocumentRow[] = [
  {
    key: "1",
    id: "DOC-101",
    type: "Договор",
    title: "Договор поставки №101",
    initiator: "Иван Петров",
    amount: "1 250 000 ₽",
    status: "На согласовании"
  },
  {
    key: "2",
    id: "DOC-102",
    type: "Счет на оплату",
    title: "Счет на оплату №44",
    initiator: "Иван Петров",
    amount: "320 000 ₽",
    status: "На доработке"
  },
  {
    key: "3",
    id: "DOC-103",
    type: "Акт",
    title: "Акт выполненных работ №18",
    initiator: "Мария Соколова",
    amount: "780 000 ₽",
    status: "Согласован"
  }
];

const statusToApiMap: Record<DocumentStatus, "uploaded" | "in_approval" | "revision" | "rejected" | "approved"> = {
  Загружен: "uploaded",
  "На согласовании": "in_approval",
  "На доработке": "revision",
  Отклонен: "rejected",
  Согласован: "approved"
};

const statusFromApiMap: Record<string, DocumentStatus> = {
  uploaded: "Загружен",
  in_approval: "На согласовании",
  revision: "На доработке",
  rejected: "Отклонен",
  approved: "Согласован"
};

function mapStatusFromApi(status: string): DocumentStatus {
  return statusFromApiMap[status] ?? "Загружен";
}

const mockApprovals: ApprovalRow[] = [
  {
    key: "1",
    id: "APP-201",
    type: "Договор",
    title: "Договор поставки №101",
    initiator: "Иван Петров",
    amount: "1 250 000 ₽",
    waitingDays: 3,
    currentStep: "Финансист",
    receivedAt: "08.04.2026 10:25",
    priority: "Срочно",
    documentId: "DOC-101",
    canTakeDecision: true
  },
  {
    key: "2",
    id: "APP-202",
    type: "УПД",
    title: "УПД №890",
    initiator: "Мария Соколова",
    amount: "98 400 ₽",
    waitingDays: 0,
    currentStep: "Юрист",
    receivedAt: "08.04.2026 09:40",
    priority: "Обычный",
    documentId: "DOC-102",
    canTakeDecision: false
  }
];

const mockDocumentDetailsMap: Record<string, DocumentDetails> = {
  "DOC-101": {
    id: "DOC-101",
    type: "Договор",
    title: "Договор поставки №101",
    status: "На согласовании",
    initiator: "Иван Петров",
    amount: "1 250 000 ₽",
    currentStep: "Финансист",
    canWithdrawDocuments: true,
    canDeleteDocuments: false,
    canSubmitForApproval: false,
    canResubmitForApproval: false,
    canApproveCurrentStep: true,
    activeTaskId: "1",
    createdAt: "06.04.2026 11:10",
    updatedAt: "08.04.2026 10:25",
    fields: {
      number: "101",
      date: "2026-04-01",
      customerName: "ООО Заказчик",
      customerInn: "7700000000",
      executorName: "ООО Исполнитель",
      executorInn: "7800000000",
      subject: "Поставка оборудования",
      note: null
    },
    history: [
      { id: "h1", date: "06.04.2026 11:10", action: "Документ создан", author: "Иван Петров", variant: "create" },
      { id: "h2", date: "06.04.2026 12:00", action: "Отправлен на согласование", author: "Иван Петров", variant: "submit" },
      { id: "h3", date: "07.04.2026 15:20", action: "Шаг согласован", author: "Мария Соколова", variant: "approve" }
    ]
  },
  "DOC-102": {
    id: "DOC-102",
    type: "Счет на оплату",
    title: "Счет на оплату №44",
    status: "На доработке",
    initiator: "Иван Петров",
    amount: "320 000 ₽",
    currentStep: "Инициатор",
    canWithdrawDocuments: false,
    canDeleteDocuments: true,
    canSubmitForApproval: false,
    canResubmitForApproval: true,
    createdAt: "05.04.2026 09:30",
    updatedAt: "08.04.2026 09:40",
    fields: {
      number: "44",
      date: "2026-04-05",
      customerName: "Иван Петров",
      customerInn: "7700000001",
      executorName: "ООО Поставщик",
      executorInn: "7700000002",
      subject: "Оплата по договору",
      note: "Уточнить НДС"
    },
    history: [
      { id: "h1", date: "05.04.2026 09:30", action: "Документ создан", author: "Иван Петров", variant: "create" },
      { id: "h2", date: "05.04.2026 09:50", action: "Отправлен на согласование", author: "Иван Петров", variant: "submit" },
      { id: "h3", date: "08.04.2026 09:40", action: "Отправлен на доработку: уточнить реквизиты", author: "Мария Соколова", variant: "revise" }
    ]
  }
};

const mockProfile: UserProfile = {
  fullName: "Иван Петров",
  email: "demo@company.ru",
  roleLabel: "Сотрудник",
  companyId: 1,
  role: "employee",
  mustChangePassword: false
};

const mockEmployees: EmployeeRow[] = [
  {
    key: "1",
    fullName: "Иван Петров",
    email: "i.petrov@company.ru",
    position: "Финансист",
    roles: ["financier"],
    status: "Активен"
  },
  {
    key: "2",
    fullName: "Мария Соколова",
    email: "m.sokolova@company.ru",
    position: "Юрист",
    roles: ["lawyer"],
    status: "Активен"
  }
];

const mockRegisteredCompanies: RegisteredCompanyRow[] = [
  {
    key: "mock-1",
    companyName: "ООО Пример",
    inn: "7700000000",
    adminFullName: "Пётр Админов"
  }
];

const mockRoutes: RouteRow[] = [
  {
    key: "1",
    documentType: "Договор",
    routeName: "Базовый маршрут договора",
    steps: "Инициатор -> Юрист -> Финансист -> Главбух"
  },
  {
    key: "2",
    documentType: "Счет на оплату",
    routeName: "Маршрут счета",
    steps: "Инициатор -> Финансист -> Казначей"
  }
];

export const contractsApi = {
  async parseFile(file: File) {
    const payload = new FormData();
    payload.append("file", file);
    const response = await httpClient.post("/parse-file", payload, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
  },
  async saveDataInfo(data: unknown) {
    const response = await httpClient.post("/save-data-info", data, {
      headers: { "Content-Type": "application/json" }
    });
    return response.data;
  }
};

export const documentsApi = {
  async listMyDocuments(params?: ListMyDocumentsParams): Promise<DocumentRow[]> {
    if (USE_MOCK_API) return Promise.resolve(mockDocuments);
    const queryParams: Record<string, string> = {};
    if (params?.status) queryParams.status = statusToApiMap[params.status];
    if (params?.type) queryParams.type = params.type;
    if (params?.q) queryParams.q = params.q;
    if (params?.number) queryParams.number = params.number;
    if (params?.counterparty) queryParams.counterparty = params.counterparty;
    if (params?.inn) queryParams.inn = params.inn;
    if (params?.dateFrom) queryParams.date_from = params.dateFrom;
    if (params?.dateTo) queryParams.date_to = params.dateTo;

    const response = await httpClient.get("/documents/my", { params: queryParams });
    const items = (response.data?.items ?? []) as Array<{
      id: string;
      type: string;
      title: string;
      status: DocumentStatus;
      initiator?: string;
      counterparty?: string;
      amount: string;
    }>;

    return items.map((item) => ({
      key: item.id,
      id: item.id,
      type: item.type,
      title: item.title,
      initiator: item.initiator ?? item.counterparty ?? "-",
      amount: item.amount,
      status: mapStatusFromApi(String(item.status)),
      createdAt: (item as { createdAt?: string }).createdAt
    }));
  },
  async getMyDocumentsStatusStats(): Promise<MyDocumentsByStatusStats> {
    if (USE_MOCK_API) {
      const byStatus: MyDocumentsByStatusStats["byStatus"] = {
        uploaded: 0,
        in_approval: 0,
        revision: 0,
        rejected: 0,
        approved: 0
      };
      for (const doc of mockDocuments) {
        const k = statusToApiMap[doc.status];
        byStatus[k] += 1;
      }
      return { byStatus };
    }
    const response = await httpClient.get<MyDocumentsByStatusStats>("/documents/my/stats");
    return response.data;
  },
  async exportMyDocuments(params?: ListMyDocumentsParams): Promise<Blob> {
    if (USE_MOCK_API) {
      let rows = mockDocuments;
      if (params?.status) rows = rows.filter((doc) => doc.status === params.status);
      if (params?.type) rows = rows.filter((doc) => doc.type === params.type);
      if (params?.q) {
        const q = params.q.trim().toLowerCase();
        rows = rows.filter(
          (doc) =>
            doc.id.toLowerCase().includes(q) ||
            doc.title.toLowerCase().includes(q) ||
            doc.initiator.toLowerCase().includes(q) ||
            doc.type.toLowerCase().includes(q)
        );
      }
      const header = "ID;Тип;Название;Инициатор;Сумма;Статус;Ссылка\n";
      const body = rows
        .map((doc) => `${doc.id};${doc.type};${doc.title};${doc.initiator};${doc.amount};${doc.status};http://localhost:5173/documents/${doc.id}`)
        .join("\n");
      return new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    }
    const queryParams: Record<string, string> = {};
    if (params?.status) queryParams.status = statusToApiMap[params.status];
    if (params?.type) queryParams.type = params.type;
    if (params?.q) queryParams.q = params.q;
    if (params?.number) queryParams.number = params.number;
    if (params?.counterparty) queryParams.counterparty = params.counterparty;
    if (params?.inn) queryParams.inn = params.inn;
    if (params?.dateFrom) queryParams.date_from = params.dateFrom;
    if (params?.dateTo) queryParams.date_to = params.dateTo;

    const response = await httpClient.get("/documents/export.xlsx", {
      params: queryParams,
      responseType: "blob"
    });
    return response.data;
  },
  async openDocument(documentId: string): Promise<DocumentDetails> {
    if (USE_MOCK_API) {
      return (
        mockDocumentDetailsMap[documentId] ?? {
          id: documentId,
          type: "Документ",
          title: `Документ ${documentId}`,
          status: "На согласовании",
          initiator: "Неизвестно",
          amount: "-",
          currentStep: "Не назначен",
          canWithdrawDocuments: true,
          canDeleteDocuments: false,
          canSubmitForApproval: false,
          canResubmitForApproval: false,
          createdAt: "-",
          updatedAt: "-",
          fields: {
            number: "-",
            date: "-",
            customerName: "-",
            customerInn: "-",
            executorName: "-",
            executorInn: "-",
            subject: "-",
            note: null
          },
          history: []
        }
      );
    }
    const response = await httpClient.get(`/documents/${documentId}`);
    return response.data;
  },
  async createDocument(payload: DocumentFormPayload) {
    if (USE_MOCK_API) return Promise.resolve({ id: String(Date.now()), status: "uploaded" });
    const response = await httpClient.post("/documents", payload);
    return response.data as { id: string; status: "uploaded" };
  },
  async updateDocument(documentId: string, payload: Partial<DocumentFormPayload>) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, id: documentId });
    const response = await httpClient.patch(`/documents/${documentId}`, payload);
    return response.data as { ok: true; id: string };
  },
  async submitForApproval(documentId: string) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, id: documentId, status: "in_approval" });
    const response = await httpClient.post(`/documents/${documentId}/submit`);
    return response.data;
  },
  async resubmitForApproval(documentId: string) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, documentId });
    const response = await httpClient.post(`/documents/${documentId}/resubmit`);
    return response.data;
  },
  async withdrawFromApproval(documentId: string) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, id: documentId, status: "uploaded" });
    const response = await httpClient.post(`/documents/${documentId}/withdraw`);
    return response.data;
  },
  async deleteDocument(documentId: string) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, id: documentId });
    const response = await httpClient.delete(`/documents/${documentId}`);
    return response.data as { ok: true; id: string };
  }
};

export const approvalsApi = {
  async listMyApprovals(params?: ListMyApprovalsParams): Promise<ApprovalListResponse> {
    if (USE_MOCK_API) {
      const page = Math.max(1, params?.page ?? 1);
      const pageSize = Math.max(1, params?.pageSize ?? 8);
      const offset = (page - 1) * pageSize;
      const pagedItems = mockApprovals.slice(offset, offset + pageSize);
      return Promise.resolve({
        items: pagedItems,
        meta: {
          page,
          pageSize,
          total: mockApprovals.length
        }
      });
    }

    const queryParams: Record<string, string | number> = {};
    if (params?.q) queryParams.q = params.q;
    if (params?.type) queryParams.type = params.type;
    if (params?.page) queryParams.page = params.page;
    if (params?.pageSize) queryParams.page_size = params.pageSize;

    const response = await httpClient.get("/approvals/my", { params: queryParams });
    const items = (response.data?.items ?? []) as Array<Partial<ApprovalRow> & Pick<ApprovalRow, "id">>;
    return {
      items: items.map((item) => ({
        ...item,
        key: item.key ?? item.id,
        amount: item.amount ?? "-",
        waitingDays: typeof item.waitingDays === "number" && !Number.isNaN(item.waitingDays) ? item.waitingDays : Number(item.waitingDays ?? 0)
      })) as ApprovalRow[],
      meta: {
        page: Number(response.data?.meta?.page ?? 1),
        pageSize: Number(response.data?.meta?.pageSize ?? params?.pageSize ?? 8),
        total: Number(response.data?.meta?.total ?? items.length)
      }
    };
  },
  async approve(approvalId: string) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, approvalId });
    const response = await httpClient.post(`/approvals/${approvalId}/approve`);
    return response.data;
  },
  async returnForRevision(approvalId: string, payload: { comment: string }) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, approvalId });
    const response = await httpClient.post(`/approvals/${approvalId}/revise`, payload);
    return response.data;
  },
  async reject(approvalId: string) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, approvalId });
    const response = await httpClient.post(`/approvals/${approvalId}/reject`);
    return response.data;
  }
};

export const profileApi = {
  async getMyProfile(): Promise<UserProfile> {
    if (USE_MOCK_API && USE_MOCK_PROFILE_API) return Promise.resolve(mockProfile);
    const response = await httpClient.get("/users/me");
    return response.data;
  },
  async updateMyProfile(payload: Pick<UserProfile, "fullName" | "email">) {
    if (USE_MOCK_API && USE_MOCK_PROFILE_API) return Promise.resolve({ ...mockProfile, ...payload });
    const response = await httpClient.patch("/users/me", payload);
    return response.data;
  },
  async changeMyPassword(payload: { currentPassword: string; newPassword: string }) {
    if (USE_MOCK_API && USE_MOCK_PROFILE_API) return Promise.resolve({ ok: true });
    const response = await httpClient.post("/users/me/change-password", payload);
    return response.data;
  }
};

export const authApi = {
  async login(payload: { email: string; password: string }) {
    const response = await httpClient.post("/auth/login", payload);
    return response.data as { token: string; isTemporaryPassword: boolean; user: UserProfile };
  }
};

export const adminApi = {
  async listEmployees(): Promise<EmployeeRow[]> {
    if (USE_MOCK_API && USE_MOCK_ADMIN_API) return Promise.resolve(mockEmployees);
    const response = await httpClient.get("/admin/employees");
    return response.data?.items ?? [];
  },
  async createEmployee(payload: {
    fullName: string;
    email: string;
    position: string;
    roles: string[];
    oneTimePassword?: string;
    companyId?: number;
  }) {
    if (USE_MOCK_API && USE_MOCK_ADMIN_API) return Promise.resolve({ id: "mock-new-employee", ...payload });
    const response = await httpClient.post("/admin/employees", payload);
    return response.data;
  },
  async listRoutes(): Promise<RouteRow[]> {
    if (USE_MOCK_API) return Promise.resolve(mockRoutes);
    const response = await httpClient.get("/admin/routes");
    return response.data?.items ?? [];
  },
  async createRoute(payload: { documentType: string; routeName: string; steps: string }) {
    if (USE_MOCK_API) return Promise.resolve({ id: "mock-new-route", ...payload });
    const response = await httpClient.post("/admin/routes", payload);
    return response.data;
  },
  async listCompanies(): Promise<RegisteredCompanyRow[]> {
    if (USE_MOCK_API && USE_MOCK_ADMIN_API) return Promise.resolve(mockRegisteredCompanies);
    const response = await httpClient.get("/admin/companies");
    return response.data?.items ?? [];
  },
  async createCompany(payload: {
    companyName: string;
    inn: string;
    adminFullName: string;
    email: string;
    password: string;
  }) {
    if (USE_MOCK_API && USE_MOCK_ADMIN_API) {
      return Promise.resolve({ message: "Компания зарегистрирована (mock)" });
    }
    const response = await httpClient.post("/admin/companies", payload);
    return response.data as { message?: string };
  },
  async updateCompany(
    id: string,
    payload: { companyName: string; inn: string; adminFullName: string }
  ) {
    if (USE_MOCK_API && USE_MOCK_ADMIN_API) {
      return Promise.resolve({ message: "Обновлено (mock)" });
    }
    const response = await httpClient.patch(`/admin/companies/${id}`, payload);
    return response.data as { message?: string };
  },
  async deleteCompany(id: string) {
    if (USE_MOCK_API && USE_MOCK_ADMIN_API) {
      return Promise.resolve({ message: "Удалено (mock)" });
    }
    const response = await httpClient.delete(`/admin/companies/${id}`);
    return response.data as { message?: string };
  },
  async resetCompanyAdmin(id: string) {
    if (USE_MOCK_API && USE_MOCK_ADMIN_API) {
      return Promise.resolve({ message: "Сброс (mock)", oneTimePassword: "MOCKPASS12" });
    }
    const response = await httpClient.post(`/admin/companies/${id}/reset-admin`);
    return response.data as { message?: string; oneTimePassword?: string };
  }
};
