import { Button, Layout, Menu, message } from "antd";
import { useEffect, useMemo } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  USER_ROLE_STORAGE_KEY,
  getStoredUserProfile,
  isPlatformAdminUser
} from "../api";
import { NotificationsBell } from "./NotificationsBell";

const { Header, Content, Sider } = Layout;

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const hideSidebar = location.pathname === "/" || location.pathname === "/auth";
  const showHeader = hideSidebar;
  const selectedKey = location.pathname;

  const platformMenuItems = useMemo(
    () => [
      { key: "/profile", label: "Профиль" },
      { key: "/admin-panel", label: "Админ панель" },
      { key: "/my-documents", label: "Мои документы" },
      { key: "/my-approvals", label: "В работе" }
    ],
    []
  );

  const tenantMenuItems = useMemo(
    () => [
      { key: "/profile", label: "Профиль" },
      { key: "/my-documents", label: "Мои документы" },
      { key: "/my-approvals", label: "В работе" }
    ],
    []
  );

  const user = getStoredUserProfile();
  const mustChangePassword = Boolean(user?.mustChangePassword);
  const menuItems = user && isPlatformAdminUser(user) ? platformMenuItems : tenantMenuItems;
  const gatedMenuItems = mustChangePassword
    ? menuItems.map((item) => (item.key === "/profile" ? item : { ...item, disabled: true }))
    : menuItems;

  useEffect(() => {
    if (!mustChangePassword) return;
    if (location.pathname === "/auth" || location.pathname === "/profile") return;
    message.warning("Сначала смените одноразовый пароль в профиле.");
    navigate("/profile?mustSetPassword=1", { replace: true });
  }, [location.pathname, mustChangePassword, navigate]);

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
            <Link to="/" className="brand-link">
              DocFlow
            </Link>
            {location.pathname === "/auth" ? (
              <Link to="/" className="app-header-home-link">
                На главную
              </Link>
            ) : null}
          </div>
        </Header>
      )}
      <Layout>
        {!hideSidebar && (
          <Sider width={280} className="app-sider">
            <div className="app-sider-inner">
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  padding: "8px 12px 4px"
                }}
              >
                <NotificationsBell />
              </div>
              <Menu
                mode="inline"
                className="app-side-menu"
                selectedKeys={[selectedKey]}
                items={gatedMenuItems}
                onClick={({ key }) => {
                  if (mustChangePassword && key !== "/profile") {
                    message.warning("Сначала смените одноразовый пароль в профиле.");
                    navigate("/profile?mustSetPassword=1");
                    return;
                  }
                  navigate(key);
                }}
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
