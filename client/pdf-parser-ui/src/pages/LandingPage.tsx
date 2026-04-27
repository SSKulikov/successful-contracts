import { CheckCircleOutlined, ClockCircleOutlined, FileTextOutlined, SafetyOutlined, TeamOutlined } from "@ant-design/icons";
import { Button, Card, Typography } from "antd";
import { useNavigate } from "react-router-dom";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-hero-chip">B2B Document Workflow</div>
        <Typography.Title className="landing-title">
          Ускорьте согласование документов и снизьте операционные риски
        </Typography.Title>
        <Typography.Paragraph className="landing-subtitle">
          DocFlow помогает финансовому блоку, операционным руководителям и юристам работать в едином процессе:
          меньше ручного контроля, быстрее решения, полная прозрачность ответственности и статусов.
        </Typography.Paragraph>

        <div className="landing-actions">
          <Button
            type="primary"
            size="large"
            className="landing-btn-primary"
            onClick={() => navigate("/auth")}
          >
            Начать работать
          </Button>
          <Button
            size="large"
            type="primary"
            className="landing-btn-primary"
            onClick={() => navigate("/auth?tab=register")}
          >
            Зарегистрироваться
          </Button>
        </div>
        <Typography.Paragraph className="landing-hint">
          Для старта достаточно зарегистрировать компанию и назначить ответственных по ролям в админ-панели.
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

      <div className="landing-divider" />

      <section className="landing-process">
        <Typography.Title level={4} className="landing-section-title">
          Как это работает
        </Typography.Title>
        <div className="landing-process-grid">
          <Card className="landing-card">
            <Typography.Text className="landing-step-index">Шаг 1</Typography.Text>
            <Typography.Title level={5} className="landing-card-title">
              Загрузите документ
            </Typography.Title>
            <Typography.Paragraph className="landing-card-text">
              Договор, счёт, УПД, акт или накладную с полями реквизитов.
            </Typography.Paragraph>
          </Card>
          <Card className="landing-card">
            <Typography.Text className="landing-step-index">Шаг 2</Typography.Text>
            <Typography.Title level={5} className="landing-card-title">
              Запустите маршрут
            </Typography.Title>
            <Typography.Paragraph className="landing-card-text">
              Документ автоматически проходит согласование по шагам.
            </Typography.Paragraph>
          </Card>
          <Card className="landing-card">
            <Typography.Text className="landing-step-index">Шаг 3</Typography.Text>
            <Typography.Title level={5} className="landing-card-title">
              Контролируйте результат
            </Typography.Title>
            <Typography.Paragraph className="landing-card-text">
              Видите статусы, комментарии и историю изменений в одном месте.
            </Typography.Paragraph>
          </Card>
        </div>
      </section>

      <div className="landing-divider" />

      <section className="landing-process">
        <Typography.Title level={4} className="landing-section-title">
          Для кого продукт
        </Typography.Title>
        <div className="landing-process-grid">
          <Card className="landing-card">
            <div className="landing-icon-wrap">
              <TeamOutlined className="landing-icon" />
            </div>
            <Typography.Title level={5} className="landing-card-title">
              Руководители
            </Typography.Title>
            <Typography.Paragraph className="landing-card-text">
              Получают контроль сроков, SLA и загрузки команд по каждому этапу согласования.
            </Typography.Paragraph>
          </Card>
          <Card className="landing-card">
            <div className="landing-icon-wrap">
              <FileTextOutlined className="landing-icon" />
            </div>
            <Typography.Title level={5} className="landing-card-title">
              Финансы
            </Typography.Title>
            <Typography.Paragraph className="landing-card-text">
              Контролируют суммы, реквизиты и статус движения документов без ручных сверок.
            </Typography.Paragraph>
          </Card>
          <Card className="landing-card">
            <div className="landing-icon-wrap">
              <SafetyOutlined className="landing-icon" />
            </div>
            <Typography.Title level={5} className="landing-card-title">
              Юристы
            </Typography.Title>
            <Typography.Paragraph className="landing-card-text">
              Согласуют условия и фиксируют правки с понятной историей и ответственными.
            </Typography.Paragraph>
          </Card>
        </div>
      </section>

      <div className="landing-divider" />

      <section className="landing-trust">
        <Typography.Title level={4} className="landing-section-title">
          Почему бизнес выбирает DocFlow
        </Typography.Title>
        <div className="landing-trust-list">
          <span><CheckCircleOutlined /> Ролевой доступ и назначение ответственных по этапам</span>
          <span><CheckCircleOutlined /> Полная история действий и прозрачный audit trail</span>
          <span><CheckCircleOutlined /> Внутренние уведомления по новым задачам и решениям</span>
        </div>
      </section>

      <section className="landing-proof">
        <Typography.Title level={5} className="landing-section-title">
          Эффект внедрения
        </Typography.Title>
        <div className="landing-proof-grid">
          <Card className="landing-card">
            <Typography.Text className="landing-proof-value">-30%</Typography.Text>
            <Typography.Paragraph className="landing-card-text">
              среднее время прохождения документа по маршруту
            </Typography.Paragraph>
          </Card>
          <Card className="landing-card">
            <Typography.Text className="landing-proof-value">+100%</Typography.Text>
            <Typography.Paragraph className="landing-card-text">
              прозрачность истории решений и ответственных
            </Typography.Paragraph>
          </Card>
        </div>
      </section>

      <section className="landing-final-cta">
        <Typography.Title level={4} className="landing-section-title">
          Готовы сократить цикл согласования уже в этом месяце?
        </Typography.Title>
        <div className="landing-actions">
          <Button type="primary" size="large" className="landing-btn-primary" onClick={() => navigate("/auth")}>
            Начать работать
          </Button>
          <Button type="primary" size="large" className="landing-btn-primary" onClick={() => navigate("/auth?tab=register")}>
            Зарегистрироваться
          </Button>
        </div>
      </section>

      <footer className="landing-footer">DocFlow · Безопасное согласование документов</footer>
    </div>
  );
}
