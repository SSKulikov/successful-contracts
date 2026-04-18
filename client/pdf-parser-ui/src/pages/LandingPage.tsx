import { ClockCircleOutlined, FileTextOutlined, SafetyOutlined } from "@ant-design/icons";
import { Button, Card, Typography } from "antd";
import { useNavigate } from "react-router-dom";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <section className="landing-hero">
        <Typography.Title className="landing-title">
          Согласование документов без лишней сложности
        </Typography.Title>
        <Typography.Paragraph className="landing-subtitle">
          Единое пространство для договоров, УПД, счетов, актов и накладных. Загружайте документы, отправляйте на
          согласование по маршруту и отслеживайте статус в одном интерфейсе.
        </Typography.Paragraph>

        <div className="landing-actions">
          <Button
            type="primary"
            size="large"
            className="landing-btn-primary"
            onClick={() => navigate("/auth")}
          >
            Начать работу
          </Button>
        </div>
        <Typography.Paragraph className="landing-hint">
          Регистрацию компании выполняет администратор. Сотрудников добавляют внутри админ-панели.
        </Typography.Paragraph>
      </section>

      <div className="landing-divider" />

      <section className="landing-cards">
        <Card className="landing-card">
          <div className="landing-icon-wrap">
            <FileTextOutlined className="landing-icon" />
          </div>
          <Typography.Title level={4} className="landing-card-title">
            Мои документы
          </Typography.Title>
          <Typography.Paragraph className="landing-card-text">
            Поиск, фильтры и полный список документов со всеми статусами.
          </Typography.Paragraph>
        </Card>

        <Card className="landing-card">
          <div className="landing-icon-wrap">
            <SafetyOutlined className="landing-icon" />
          </div>
          <Typography.Title level={4} className="landing-card-title">
            В работе
          </Typography.Title>
          <Typography.Paragraph className="landing-card-text">
            Задачи по согласованию: согласовать, отклонить или вернуть на доработку с комментарием.
          </Typography.Paragraph>
        </Card>

        <Card className="landing-card">
          <div className="landing-icon-wrap">
            <ClockCircleOutlined className="landing-icon" />
          </div>
          <Typography.Title level={4} className="landing-card-title">
            Прозрачный процесс
          </Typography.Title>
          <Typography.Paragraph className="landing-card-text">
            История действий и статусы по каждому документу для инициатора и согласующих.
          </Typography.Paragraph>
        </Card>
      </section>
    </div>
  );
}
