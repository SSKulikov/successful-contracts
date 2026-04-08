import { Badge, Button, Card, Space, Tabs, Typography } from "antd";
import { useNavigate } from "react-router-dom";

const mockApprovals = [
  { id: "APP-11", title: "Договор поставки №101", initiator: "Иван Петров", step: "Финансист" },
  { id: "APP-12", title: "УПД №890", initiator: "Мария Соколова", step: "Юрист" }
];

export function WorkspacePage() {
  const navigate = useNavigate();

  const items = [
    {
      key: "my-documents",
      label: "Мои документы",
      children: (
        <Card>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              Отдельная страница реестра документов уже доступна с таблицей, фильтрами и поиском.
            </Typography.Text>
            <Button type="primary" onClick={() => navigate("/my-documents")}>
              Перейти в мои документы
            </Button>
          </Space>
        </Card>
      )
    },
    {
      key: "my-approvals",
      label: (
        <Badge count={mockApprovals.length} size="small" offset={[10, 0]}>
          <span>Мои согласования</span>
        </Badge>
      ),
      children: (
        <Card>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              Документы, которые пришли вам на согласование по роли.
            </Typography.Text>
            <Button type="primary" onClick={() => navigate("/my-approvals")}>
              Перейти в мои согласования
            </Button>
          </Space>
        </Card>
      )
    },
    {
      key: "profile",
      label: "Профиль",
      children: (
        <Card>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              Профиль вынесен на отдельную страницу с формами обновления данных и смены пароля.
            </Typography.Text>
            <Button type="primary" onClick={() => navigate("/profile")}>
              Перейти в профиль
            </Button>
          </Space>
        </Card>
      )
    },
    {
      key: "admin-panel",
      label: "Админ-панель",
      children: (
        <Card>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              Для администратора доступно управление сотрудниками и маршрутами согласования.
            </Typography.Text>
            <Button type="primary" onClick={() => navigate("/admin-panel")}>
              Перейти в админ-панель
            </Button>
          </Space>
        </Card>
      )
    }
  ];

  return (
    <div>
      <Typography.Title level={3}>Рабочее место</Typography.Title>
      <Typography.Paragraph type="secondary">
        Базовый каркас личного кабинета для дальнейшего подключения API и прав доступа.
      </Typography.Paragraph>
      <Tabs defaultActiveKey="my-documents" items={items} />
    </div>
  );
}
