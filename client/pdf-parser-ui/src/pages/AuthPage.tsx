import { Button, Card, Form, Input, Tabs, Typography } from "antd";
import { useState } from "react";

type AuthTab = "login" | "register";

export function AuthPage() {
  const [activeTab, setActiveTab] = useState<AuthTab>("login");

  return (
    <Card style={{ maxWidth: 560 }}>
      <Typography.Title level={3}>{activeTab === "login" ? "Вход" : "Регистрация"}</Typography.Title>
      <Typography.Paragraph type="secondary">
        Единая форма авторизации. API-подключение добавим на следующем этапе.
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
          <Button type="primary">Войти</Button>
        </Form>
      ) : (
        <Form layout="vertical">
          <Form.Item label="ФИО">
            <Input placeholder="Иванов Иван Иванович" />
          </Form.Item>
          <Form.Item label="Email">
            <Input placeholder="example@mail.com" />
          </Form.Item>
          <Form.Item label="Пароль">
            <Input.Password placeholder="Минимум 8 символов" />
          </Form.Item>
          <Button type="primary">Зарегистрироваться</Button>
        </Form>
      )}
    </Card>
  );
}
