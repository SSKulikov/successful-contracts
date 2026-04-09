import axios from "axios";

export type DocumentStatus = "На согласовании" | "На доработке" | "Отклонен" | "Согласован";

export type DocumentRow = {
  key: string;
  id: string;
  type: string;
  title: string;
  initiator: string;
  amount: string;
  status: DocumentStatus;
};

export type DocumentHistoryItem = {
  id: string;
  date: string;
  action: string;
  author: string;
};

export type DocumentDetails = {
  id: string;
  type: string;
  title: string;
  status: DocumentStatus;
  initiator: string;
  amount: string;
  currentStep: string;
  createdAt: string;
  updatedAt: string;
  history: DocumentHistoryItem[];
};

export type ApprovalRow = {
  key: string;
  id: string;
  type: string;
  title: string;
  initiator: string;
  currentStep: string;
  receivedAt: string;
  priority: "Обычный" | "Срочно";
};

export type UserProfile = {
  fullName: string;
  email: string;
  roleLabel: string;
  position?: string;
};

export type AuthUser = UserProfile & {
  role: "admin" | "employee";
};

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

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3003/api";
const USE_MOCK_API = (import.meta.env.VITE_USE_MOCK_API ?? "true") === "true";
const USE_MOCK_ADMIN_API = (import.meta.env.VITE_USE_MOCK_ADMIN_API ?? "false") === "true";
const USE_MOCK_PROFILE_API = (import.meta.env.VITE_USE_MOCK_PROFILE_API ?? "false") === "true";

export const AUTH_TOKEN_STORAGE_KEY = "docflow-auth-token";
export const AUTH_USER_STORAGE_KEY = "docflow-auth-user";
export const USER_ROLE_STORAGE_KEY = "docflow-user-role";

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

const mockApprovals: ApprovalRow[] = [
  {
    key: "1",
    id: "APP-201",
    type: "Договор",
    title: "Договор поставки №101",
    initiator: "Иван Петров",
    currentStep: "Финансист",
    receivedAt: "08.04.2026 10:25",
    priority: "Срочно"
  },
  {
    key: "2",
    id: "APP-202",
    type: "УПД",
    title: "УПД №890",
    initiator: "Мария Соколова",
    currentStep: "Юрист",
    receivedAt: "08.04.2026 09:40",
    priority: "Обычный"
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
    createdAt: "06.04.2026 11:10",
    updatedAt: "08.04.2026 10:25",
    history: [
      { id: "h1", date: "06.04.2026 11:10", action: "Документ создан", author: "Иван Петров" },
      { id: "h2", date: "06.04.2026 12:00", action: "Отправлен на согласование", author: "Иван Петров" },
      { id: "h3", date: "07.04.2026 15:20", action: "Согласовано этапом Юрист", author: "Мария Соколова" }
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
    createdAt: "05.04.2026 09:30",
    updatedAt: "08.04.2026 09:40",
    history: [
      { id: "h1", date: "05.04.2026 09:30", action: "Документ создан", author: "Иван Петров" },
      { id: "h2", date: "05.04.2026 09:50", action: "Отправлен на согласование", author: "Иван Петров" },
      { id: "h3", date: "08.04.2026 09:40", action: "Возвращен на доработку", author: "Мария Соколова" }
    ]
  }
};

const mockProfile: UserProfile = {
  fullName: "Иван Петров",
  email: "demo@company.ru",
  roleLabel: "Сотрудник"
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
  async listMyDocuments(): Promise<DocumentRow[]> {
    if (USE_MOCK_API) return Promise.resolve(mockDocuments);
    const response = await httpClient.get("/documents/my");
    return response.data?.items ?? [];
  },
  async exportMyDocuments(): Promise<Blob> {
    if (USE_MOCK_API) {
      const header = "ID;Тип;Название;Инициатор;Сумма;Статус\n";
      const rows = mockDocuments
        .map((doc) => `${doc.id};${doc.type};${doc.title};${doc.initiator};${doc.amount};${doc.status}`)
        .join("\n");
      return new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    }
    const response = await httpClient.get("/documents/my/export", {
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
          createdAt: "-",
          updatedAt: "-",
          history: []
        }
      );
    }
    const response = await httpClient.get(`/documents/${documentId}`);
    return response.data;
  },
  async resubmitForApproval(documentId: string) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, documentId });
    const response = await httpClient.post(`/documents/${documentId}/resubmit`);
    return response.data;
  }
};

export const approvalsApi = {
  async listMyApprovals(): Promise<ApprovalRow[]> {
    if (USE_MOCK_API) return Promise.resolve(mockApprovals);
    const response = await httpClient.get("/approvals/my");
    return response.data?.items ?? [];
  },
  async approve(approvalId: string) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, approvalId });
    const response = await httpClient.post(`/approvals/${approvalId}/approve`);
    return response.data;
  },
  async returnForRevision(approvalId: string) {
    if (USE_MOCK_API) return Promise.resolve({ ok: true, approvalId });
    const response = await httpClient.post(`/approvals/${approvalId}/return`);
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
  async createEmployee(payload: { fullName: string; email: string; position: string; roles: string[]; oneTimePassword?: string }) {
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
  }
};
