import { Button, Card, Form, Input, Typography } from "antd";

export function LoginPage() {
  return (
    <Card style={{ maxWidth: 520 }}>
      <Typography.Title level={3}>Вход</Typography.Title>
      <Typography.Paragraph type="secondary">
        Заглушка формы входа. Подключим API на следующем этапе.
      </Typography.Paragraph>

      <Form layout="vertical">
        <Form.Item label="Email">
          <Input placeholder="example@mail.com" />
        </Form.Item>
        <Form.Item label="Пароль">
          <Input.Password placeholder="Введите пароль" />
        </Form.Item>
        <Button type="primary">Войти</Button>
      </Form>
    </Card>
  );
}
