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
};
