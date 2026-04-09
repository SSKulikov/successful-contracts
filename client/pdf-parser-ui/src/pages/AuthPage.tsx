import { Alert, Button, Card, Form, Input, Tabs, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi, AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY, USER_ROLE_STORAGE_KEY } from "../shared/api";

type AuthTab = "login" | "register";
const ADMIN_LOGIN = "admin";
const ADMIN_PASSWORD = "111";

export function AuthPage() {
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [role, setRole] = useState<"employee" | "admin">(() => {
    const savedRole = localStorage.getItem(USER_ROLE_STORAGE_KEY);
    return savedRole === "admin" ? "admin" : "employee";
  });
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAdmin = role === "admin";
  const registrationLocked = activeTab === "register" && !isAdmin;
  const requestedTab = useMemo(() => searchParams.get("tab"), [searchParams]);

  useEffect(() => {
    if (requestedTab === "register") {
      setActiveTab(isAdmin ? "register" : "login");
      return;
    }
    if (requestedTab === "login") {
      setActiveTab("login");
    }
  }, [isAdmin, requestedTab]);

  const handleTabChange = (nextTab: AuthTab) => {
    if (nextTab === "register" && !isAdmin) return;
    setActiveTab(nextTab);
  };

  const handleLogin = async () => {
    await loginForm.validateFields();

    const login = loginForm.getFieldValue("login");
    const password = loginForm.getFieldValue("password");

    if (login === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      localStorage.setItem(USER_ROLE_STORAGE_KEY, "admin");
      localStorage.setItem(
        AUTH_USER_STORAGE_KEY,
        JSON.stringify({ fullName: "Администратор", email: ADMIN_LOGIN, roleLabel: "Администратор", role: "admin" })
      );
      setRole("admin");
      navigate("/admin-panel");
      return;
    }

    try {
      const response = await authApi.login({ email: login, password });
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
      localStorage.setItem(USER_ROLE_STORAGE_KEY, "employee");
      localStorage.setItem(
        AUTH_USER_STORAGE_KEY,
        JSON.stringify({ ...response.user, role: "employee" })
      );
      setRole("employee");
      if (response.isTemporaryPassword) {
        message.warning("Вы вошли по одноразовому паролю. Пожалуйста, смените пароль в профиле.");
      }
      navigate("/my-documents");
    } catch (error) {
      message.error("Неверный email или пароль");
    }
  };

  const [loginForm] = Form.useForm();

  return (
    <Card style={{ maxWidth: 620, margin: "0 auto" }}>
      <Typography.Title level={3}>{activeTab === "login" ? "Вход в систему" : "Регистрация администратора"}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {activeTab === "login"
          ? "Войдите с выданными учетными данными. Если вы сотрудник, логин и пароль создает администратор компании."
          : "Зарегистрируйте компанию и получите права администратора для управления сотрудниками и маршрутами согласования."}
      </Typography.Paragraph>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => handleTabChange(key as AuthTab)}
        items={[
          { key: "login", label: "Вход" },
          { key: "register", label: "Регистрация", disabled: !isAdmin }
        ]}
      />

      {registrationLocked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Регистрация доступна только пользователям с правами администратора."
        />
      )}

      {activeTab === "login" ? (
        <Form form={loginForm} layout="vertical">
          <Form.Item
            label="Email или логин"
            name="login"
            rules={[{ required: true, message: "Введите email или логин" }]}
          >
            <Input placeholder="admin или user@company.ru" />
          </Form.Item>
          <Form.Item label="Пароль" name="password" rules={[{ required: true, message: "Введите пароль" }]}>
            <Input.Password placeholder="Введите пароль" />
          </Form.Item>
          <Button type="primary" block onClick={handleLogin}>
            Войти
          </Button>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Демо-админ: admin / 111. Сотрудник: email + одноразовый пароль из админ-панели.
          </Typography.Paragraph>
        </Form>
      ) : (
        <Form layout="vertical">
          <Form.Item label="Название компании">
            <Input placeholder="ООО Ромашка" />
          </Form.Item>
          <Form.Item label="ИНН компании">
            <Input placeholder="1234567890" />
          </Form.Item>
          <Form.Item label="Имя администратора">
            <Input placeholder="Иван Иванов" />
          </Form.Item>
          <Form.Item label="Email">
            <Input placeholder="example@mail.com" />
          </Form.Item>
          <Form.Item label="Пароль">
            <Input.Password placeholder="Минимум 8 символов" />
          </Form.Item>
          <Form.Item label="Подтверждение пароля">
            <Input.Password placeholder="Повторите пароль" />
          </Form.Item>
          <Button type="primary" block onClick={() => navigate("/admin-panel")}>
            Зарегистрировать компанию
          </Button>
        </Form>
      )}
    </Card>
  );
}
