/** Строка сотрудника из БД (login, профиль, проверка токена). */
export type EmployeeAccountRow = {
  id: number;
  full_name: string;
  email: string;
  position: string;
  roles_json: string;
  password_value: string;
  is_temporary_password: 0 | 1;
  status: "Активен" | "Неактивен";
  company_id: number | null;
  /** Из JOIN `companies` (для профиля). */
  company_name?: string | null;
  company_inn?: string | null;
  /** NULL — активная учётная запись; иначе soft delete. */
  deleted_at: Date | null;
  /** Имя файла в `uploads/avatars` или NULL. */
  avatar_url: string | null;
};
