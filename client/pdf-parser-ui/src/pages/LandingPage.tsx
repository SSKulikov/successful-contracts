import { Button, Card, Flex, Typography } from "antd";
import { useNavigate } from "react-router-dom";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <Card>
      <Flex vertical gap={20} align="flex-start">
        <Typography.Title level={2} style={{ margin: 0 }}>
          Добро пожаловать в систему обработки договоров
        </Typography.Title>
        <Typography.Paragraph style={{ margin: 0 }}>
          Выберите действие для продолжения работы.
        </Typography.Paragraph>

        <Flex gap={12} wrap>
          <Button type="primary" size="large" onClick={() => navigate("/login")}>
            Вход
          </Button>
          <Button size="large" onClick={() => navigate("/register")}>
            Регистрация
          </Button>
          <Button size="large" onClick={() => navigate("/contracts")}>
            Загрузка договоров
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}
