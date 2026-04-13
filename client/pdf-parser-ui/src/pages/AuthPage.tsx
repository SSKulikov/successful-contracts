import { Button, Card, Form, Input, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import {
  authApi,
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  PLATFORM_DEMO_ADMIN_EMAIL,
  USER_ROLE_STORAGE_KEY
} from "../shared/api";

const ADMIN_LOGIN = "admin";
const ADMIN_PASSWORD = "111";

export function AuthPage() {
  const navigate = useNavigate();
  const [loginForm] = Form.useForm();

  const handleLogin = async () => {
    await loginForm.validateFields();

    const login = loginForm.getFieldValue("login");
    const password = loginForm.getFieldValue("password");

    if (login === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
      try {
        const response = await authApi.login({ email: PLATFORM_DEMO_ADMIN_EMAIL, password: ADMIN_PASSWORD });
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
        localStorage.setItem(USER_ROLE_STORAGE_KEY, "admin");
        localStorage.setItem(
          AUTH_USER_STORAGE_KEY,
          JSON.stringify({ ...response.user, role: "admin" as const })
        );
        navigate("/admin-panel");
      } catch {
        message.error(
          "Не удалось войти как администратор. Убедитесь, что API запущен и доступен (см. VITE_API_URL), база данных подключена."
        );
      }
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
      if (response.isTemporaryPassword) {
        message.warning("Вы вошли по одноразовому паролю. Пожалуйста, смените пароль в профиле.");
      }
      navigate("/my-documents");
    } catch (error) {
      message.error("Неверный email или пароль");
    }
  };

  return (
    <Card style={{ maxWidth: 620, margin: "0 auto" }}>
      <Typography.Title level={3}>Вход в систему</Typography.Title>
      <Typography.Paragraph type="secondary">
        Войдите с выданными учетными данными. Если вы сотрудник, логин и пароль создает администратор компании.
      </Typography.Paragraph>

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
          Демо-админ: логин <code>admin</code>, пароль <code>111</code> — запрашивает сессию у API (учётная запись
          платформенного админа). Сотрудник: email + одноразовый пароль из админ-панели.
        </Typography.Paragraph>
      </Form>
    </Card>
  );
}
