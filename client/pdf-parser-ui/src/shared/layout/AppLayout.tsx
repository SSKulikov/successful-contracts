import { Layout, Menu, Typography } from "antd";
import type { MenuProps } from "antd";
import { FileTextOutlined, HomeOutlined, LoginOutlined } from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Header, Sider, Content } = Layout;

const menuItems: MenuProps["items"] = [
  { key: "/", icon: <HomeOutlined />, label: "Главная" },
  { key: "/auth", icon: <LoginOutlined />, label: "Вход / Регистрация" },
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
            ...
          </Typography.Title>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
