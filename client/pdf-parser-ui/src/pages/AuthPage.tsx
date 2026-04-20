import { Button, Card, Form, Input, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import {
  authApi,
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  PLATFORM_DEMO_ADMIN_EMAIL,
  USER_ROLE_STORAGE_KEY
} from "../shared/api";
import { getApiErrorMessage } from "../shared/utils/api-error";

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
        localStorage.setItem(USER_ROLE_STORAGE_KEY, response.user.role);
        localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(response.user));
        if (response.isTemporaryPassword || response.user.mustChangePassword) {
          message.warning("Вы вошли по одноразовому паролю. Пожалуйста, смените пароль в профиле.");
          navigate("/profile?mustSetPassword=1");
          return;
        }
        navigate("/admin-panel");
      } catch (err: unknown) {
        message.error(getApiErrorMessage(err, "Не удалось войти как администратор. Проверьте API и настройки CORS."));
      }
      return;
    }

    try {
      const response = await authApi.login({ email: login, password });
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
      localStorage.setItem(USER_ROLE_STORAGE_KEY, response.user.role);
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(response.user));
      if (response.isTemporaryPassword || response.user.mustChangePassword) {
        message.warning("Вы вошли по одноразовому паролю. Пожалуйста, смените пароль в профиле.");
        navigate("/profile?mustSetPassword=1");
        return;
      }
      navigate("/my-documents");
    } catch (error) {
      message.error("Неверный email или пароль");
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
      <Typography.Title level={3}>Вход в систему</Typography.Title>
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
          Демо-админ: <code>admin</code> / <code>111</code>. Сотрудник: email и пароль от администратора компании.
        </Typography.Paragraph>
      </Form>
      </Card>
    </div>
  );
}
