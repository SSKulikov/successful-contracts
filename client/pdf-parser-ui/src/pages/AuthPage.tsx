import { Button, Card, Form, Input, Tabs, Typography, message } from "antd";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const activeTab = useMemo(() => (searchParams.get("tab") === "register" ? "register" : "login"), [searchParams]);

  const handleLogin = async () => {
    try {
      await loginForm.validateFields();
    } catch {
      return;
    }

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

  const handleRegister = async () => {
    try {
      const values = await registerForm.validateFields();
      await authApi.registerCompany({
        companyName: values.companyName,
        inn: values.inn,
        adminFullName: values.adminFullName,
        email: values.email,
        password: values.password
      });
      message.success("Компания зарегистрирована");

      const response = await authApi.login({ email: values.email, password: values.password });
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
      localStorage.setItem(USER_ROLE_STORAGE_KEY, response.user.role);
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(response.user));
      navigate("/admin-panel");
    } catch (error) {
      message.error(getApiErrorMessage(error, "Не удалось зарегистрировать компанию"));
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <Typography.Title level={3}>Доступ в систему</Typography.Title>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (key === "register") next.set("tab", "register");
              else next.delete("tab");
              return next;
            });
          }}
          items={[
            {
              key: "login",
              label: "Вход",
              children: (
                <Form form={loginForm} layout="vertical">
                  <Form.Item
                    label="Email"
                    name="login"
                    rules={[{ required: true, message: "Введите email" }]}
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
              )
            },
            {
              key: "register",
              label: "Регистрация компании",
              children: (
                <Form form={registerForm} layout="vertical">
                  <Form.Item label="Название компании" name="companyName" rules={[{ required: true, message: "Укажите название компании" }]}>
                    <Input placeholder="ООО Ромашка" />
                  </Form.Item>
                  <Form.Item label="ИНН компании" name="inn" rules={[{ required: true, message: "Укажите ИНН" }]}>
                    <Input placeholder="1234567890" />
                  </Form.Item>
                  <Form.Item label="ФИО администратора" name="adminFullName" rules={[{ required: true, message: "Укажите ФИО администратора" }]}>
                    <Input placeholder="Иван Иванов" />
                  </Form.Item>
                  <Form.Item
                    label="Email администратора"
                    name="email"
                    rules={[
                      { required: true, message: "Укажите email" },
                      { type: "email", message: "Введите корректный email" }
                    ]}
                  >
                    <Input placeholder="admin@company.ru" />
                  </Form.Item>
                  <Form.Item label="Пароль" name="password" rules={[{ required: true, message: "Введите пароль" }]}>
                    <Input.Password placeholder="Минимум 8 символов" />
                  </Form.Item>
                  <Form.Item
                    label="Подтвердите пароль"
                    name="confirmPassword"
                    dependencies={["password"]}
                    rules={[
                      { required: true, message: "Подтвердите пароль" },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue("password") === value) return Promise.resolve();
                          return Promise.reject(new Error("Пароли не совпадают"));
                        }
                      })
                    ]}
                  >
                    <Input.Password placeholder="Повторите пароль" />
                  </Form.Item>
                  <Button type="primary" block onClick={handleRegister}>
                    Зарегистрироваться
                  </Button>
                </Form>
              )
            }
          ]}
        />
      </Card>
    </div>
  );
}
