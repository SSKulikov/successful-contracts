import { Button, Layout, Typography } from "antd";
import { Outlet, useNavigate } from "react-router-dom";

const { Header, Content } = Layout;

export function AppLayout() {
  const navigate = useNavigate();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header className="app-header">
        <div className="app-header-inner">
          <Typography.Title level={4} className="brand">
            DocFlow
          </Typography.Title>
          <div className="app-header-actions">
            <Button type="text" onClick={() => navigate("/")}>
              Главная
            </Button>
            <Button type="text" onClick={() => navigate("/auth")}>
              Войти
            </Button>
            <Button type="text" onClick={() => navigate("/workspace")}>
              Рабочее место
            </Button>
            <Button type="text" onClick={() => navigate("/my-documents")}>
              Мои документы
            </Button>
            <Button type="text" onClick={() => navigate("/my-approvals")}>
              Мои согласования
            </Button>
            <Button type="text" onClick={() => navigate("/profile")}>
              Профиль
            </Button>
            <Button type="text" onClick={() => navigate("/admin-panel")}>
              Админ-панель
            </Button>
            <Button type="primary" onClick={() => navigate("/contracts")}>
              Документы
            </Button>
          </div>
        </div>
      </Header>
      <Content className="app-content">
        <Outlet />
      </Content>
    </Layout>
  );
}
