import { Button, Card, Form, Input, Tabs, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

type AuthTab = "login" | "register";

export function AuthPage() {
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const navigate = useNavigate();

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
        onChange={(key) => setActiveTab(key as AuthTab)}
        items={[
          { key: "login", label: "Вход" },
          { key: "register", label: "Регистрация" }
        ]}
      />

      {activeTab === "login" ? (
        <Form layout="vertical">
          <Form.Item label="Email">
            <Input placeholder="example@mail.com" />
          </Form.Item>
          <Form.Item label="Пароль">
            <Input.Password placeholder="Введите пароль" />
          </Form.Item>
          <Button type="primary" block onClick={() => navigate("/workspace")}>
            Войти
          </Button>
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
          <Button type="primary" block onClick={() => navigate("/workspace")}>
            Зарегистрировать компанию
          </Button>
        </Form>
      )}
    </Card>
  );
}
