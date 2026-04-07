import { Layout, Menu, Typography } from "antd";
import type { MenuProps } from "antd";
import { FileTextOutlined, HomeOutlined, LoginOutlined, UserAddOutlined } from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Header, Sider, Content } = Layout;

const menuItems: MenuProps["items"] = [
  { key: "/", icon: <HomeOutlined />, label: "Главная" },
  { key: "/login", icon: <LoginOutlined />, label: "Вход" },
  { key: "/register", icon: <UserAddOutlined />, label: "Регистрация" },
  { key: "/contracts", icon: <FileTextOutlined />, label: "Договоры" }
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={240} breakpoint="lg" collapsedWidth={0}>
        <div className="brand">PDF Parser</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <Typography.Title level={4} style={{ margin: 0 }}>
            Умные договоры
          </Typography.Title>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
