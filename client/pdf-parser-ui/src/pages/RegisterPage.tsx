import { Button, Card, Form, Input, Typography } from "antd";

export function RegisterPage() {
  return (
    <Card style={{ maxWidth: 520 }}>
      <Typography.Title level={3}>Регистрация</Typography.Title>
      <Typography.Paragraph type="secondary">
        Заглушка формы регистрации. Подключим API на следующем этапе.
      </Typography.Paragraph>

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
    </Card>
  );
}
