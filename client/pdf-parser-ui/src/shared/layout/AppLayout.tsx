import { Button, Layout, Menu, Typography } from "antd";
import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY, USER_ROLE_STORAGE_KEY } from "../api";

const { Header, Content, Sider } = Layout;

type AppRole = "admin" | "employee";

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = (localStorage.getItem(USER_ROLE_STORAGE_KEY) === "admin" ? "admin" : "employee") as AppRole;

  const hideSidebar = location.pathname === "/" || location.pathname === "/auth";
  const showHeader = hideSidebar;
  const selectedKey = location.pathname;

  const adminMenuItems = useMemo(
    () => [
      { key: "/profile", label: "Профиль" },
      { key: "/admin-panel", label: "Админ панель" },
      { key: "/my-documents", label: "Мои документы" },
      { key: "/my-approvals", label: "Мои согласования" }
    ],
    []
  );

  const employeeMenuItems = useMemo(
    () => [
      { key: "/profile", label: "Профиль" },
      { key: "/my-documents", label: "Мои документы" },
      { key: "/contracts", label: "Загрузить документы" },
      { key: "/my-approvals", label: "В работе" }
    ],
    []
  );

  const menuItems = role === "admin" ? adminMenuItems : employeeMenuItems;

  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    localStorage.removeItem(USER_ROLE_STORAGE_KEY);
    navigate("/");
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {showHeader && (
        <Header className="app-header">
          <div className="app-header-inner">
            <Typography.Title level={4} className="brand">
              DocFlow
            </Typography.Title>
          </div>
        </Header>
      )}
      <Layout>
        {!hideSidebar && (
          <Sider width={280} className="app-sider">
            <div className="app-sider-inner">
              <Menu
                mode="inline"
                className="app-side-menu"
                selectedKeys={[selectedKey]}
                items={menuItems}
                onClick={({ key }) => navigate(key)}
              />
              <div className="app-sider-logout">
                <Button block onClick={handleLogout}>
                  Выход из учетной записи
                </Button>
              </div>
            </div>
          </Sider>
        )}
        <Content className={hideSidebar ? "app-content" : "app-content app-content-with-sider"}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
