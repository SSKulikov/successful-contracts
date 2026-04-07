import { ClockCircleOutlined, FileTextOutlined, SafetyOutlined } from "@ant-design/icons";
import { Button, Card, Typography } from "antd";
import { useNavigate } from "react-router-dom";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <section className="landing-hero">
        <Typography.Title className="landing-title">
          Надежное хранение и согласование документов
        </Typography.Title>
        <Typography.Paragraph className="landing-subtitle">
          Единое пространство для работы с контрактами. Удобный поиск, прозрачный процесс согласования и полный
          контроль над документами компании.
        </Typography.Paragraph>

        <div className="landing-actions">
          <Button
            type="primary"
            size="large"
            className="landing-btn-primary"
            onClick={() => navigate("/contracts")}
          >
            Начать работу
          </Button>
          <Button size="large" className="landing-btn-secondary" onClick={() => navigate("/auth")}>
            Войти в систему
          </Button>
        </div>
      </section>

      <div className="landing-divider" />

      <section className="landing-cards">
        <Card className="landing-card">
          <div className="landing-icon-wrap">
            <FileTextOutlined className="landing-icon" />
          </div>
          <Typography.Title level={4} className="landing-card-title">
            Единый реестр
          </Typography.Title>
          <Typography.Paragraph className="landing-card-text">
            Все договоры в одном месте с удобным поиском и фильтрацией.
          </Typography.Paragraph>
        </Card>

        <Card className="landing-card">
          <div className="landing-icon-wrap">
            <SafetyOutlined className="landing-icon" />
          </div>
          <Typography.Title level={4} className="landing-card-title">
            Прозрачное согласование
          </Typography.Title>
          <Typography.Paragraph className="landing-card-text">
            Четкие маршруты утверждения документов с историей комментариев.
          </Typography.Paragraph>
        </Card>

        <Card className="landing-card">
          <div className="landing-icon-wrap">
            <ClockCircleOutlined className="landing-icon" />
          </div>
          <Typography.Title level={4} className="landing-card-title">
            Контроль сроков
          </Typography.Title>
          <Typography.Paragraph className="landing-card-text">
            Отслеживание статусов и сроков действий по каждому контракту.
          </Typography.Paragraph>
        </Card>
      </section>
    </div>
  );
}
