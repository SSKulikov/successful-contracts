import { DesktopOutlined, LogoutOutlined, MoonOutlined, SunOutlined, UserOutlined } from "@ant-design/icons";
import { Avatar, Breadcrumb, Button, Dropdown, Layout, Menu, message, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  USER_PROFILE_UPDATED_CLIENT_EVENT,
  USER_ROLE_STORAGE_KEY,
  getStoredUserProfile,
  isPlatformAdminUser
} from "../api";
import { NotificationsBell } from "./NotificationsBell";

const { Header, Content, Sider } = Layout;

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profileVersion, setProfileVersion] = useState(0);

  const hideSidebar = location.pathname === "/" || location.pathname === "/auth";
  const showHeader = hideSidebar;
  const selectedKey = location.pathname;

  const platformMenuItems = useMemo(
    () => [
      {
        type: "group" as const,
        label: "Управление",
        children: [
          { key: "/profile", label: "Профиль" },
          { key: "/admin-panel", label: "Управление компаниями" }
        ]
      }
    ],
    []
  );

  const user = getStoredUserProfile();
  const tenantMenuItems = useMemo(
    () => [
      {
        type: "group" as const,
        label: "Документы",
        children: [
          { key: "/my-documents", label: "Мои документы" },
          { key: "/my-approvals", label: "В работе" }
        ]
      },
      ...(user?.role === "admin" && user.companyId != null
        ? [
            {
              type: "group" as const,
              label: "Управление",
              children: [{ key: "/admin-panel", label: "Управление компанией" }]
            }
          ]
        : []),
      {
        type: "group" as const,
        label: "Профиль",
        children: [{ key: "/profile", label: "Профиль" }]
      }
    ],
    [user?.role, user?.companyId]
  );

  const mustChangePassword = Boolean(user?.mustChangePassword);
  const menuItems = user && isPlatformAdminUser(user) ? platformMenuItems : tenantMenuItems;
  const gatedMenuItems = mustChangePassword
    ? menuItems.map((item) => ({
        ...item,
        children: item.children?.map((child) =>
          child.key === "/profile" ? child : { ...child, disabled: true }
        )
      }))
    : menuItems;

  const breadcrumbMap: Record<string, string> = {
    "/my-documents": "Мои документы",
    "/documents": "Карточка документа",
    "/my-approvals": "В работе",
    "/profile": "Профиль",
    "/admin-panel": user && isPlatformAdminUser(user) ? "Управление компаниями" : "Управление компанией",
    "/workspace": "Рабочее место"
  };
  const breadcrumbLabel =
    Object.entries(breadcrumbMap).find(([path]) => location.pathname.startsWith(path))?.[1] ?? "Раздел";

  useEffect(() => {
    const syncProfileState = () => setProfileVersion((v) => v + 1);
    window.addEventListener(USER_PROFILE_UPDATED_CLIENT_EVENT, syncProfileState);
    window.addEventListener("storage", syncProfileState);
    return () => {
      window.removeEventListener(USER_PROFILE_UPDATED_CLIENT_EVENT, syncProfileState);
      window.removeEventListener("storage", syncProfileState);
    };
  }, []);

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

  const initials = user?.fullName
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

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
              <div className="app-sider-brand">
                <Link to="/" className="brand-link">
                  DocFlow
                </Link>
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
          {!hideSidebar ? (
            <header className="workspace-header">
              <Breadcrumb
                items={[
                  { title: "DocFlow" },
                  { title: breadcrumbLabel }
                ]}
                className="workspace-breadcrumb"
              />
              <Space size={12}>
                <NotificationsBell />
                <Dropdown
                  placement="bottomRight"
                  trigger={["click"]}
                  menu={{
                    items: [
                      {
                        key: "profile",
                        icon: <UserOutlined />,
                        label: "Профиль",
                        onClick: () => navigate("/profile")
                      },
                      { type: "divider" },
                      {
                        key: "theme-light",
                        icon: <SunOutlined />,
                        label: "Светлая тема",
                        disabled: true
                      },
                      {
                        key: "theme-dark",
                        icon: <MoonOutlined />,
                        label: "Тёмная тема",
                        disabled: true
                      },
                      {
                        key: "theme-system",
                        icon: <DesktopOutlined />,
                        label: "Системная тема",
                        disabled: true
                      },
                      { type: "divider" },
                      {
                        key: "logout",
                        icon: <LogoutOutlined />,
                        label: "Выйти",
                        danger: true,
                        onClick: handleLogout
                      }
                    ]
                  }}
                >
                  <Button type="text" className="workspace-user-trigger" aria-label="Меню пользователя" aria-haspopup="menu">
                    <Space size={10}>
                      <Typography.Text className="workspace-user-name" ellipsis>
                        {user?.fullName ?? "Пользователь"}
                      </Typography.Text>
                      <Avatar size={34} className="workspace-user-avatar">
                        {initials}
                      </Avatar>
                    </Space>
                  </Button>
                </Dropdown>
              </Space>
            </header>
          ) : null}
          {/* Зависимость от версии профиля, чтобы моментально применять гейт после смены пароля. */}
          <div data-profile-version={profileVersion} style={{ display: "none" }} />
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
