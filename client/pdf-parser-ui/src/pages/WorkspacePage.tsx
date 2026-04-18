import { Badge, Button, Card, Space, Tabs, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { approvalsApi, getStoredUserProfile, isPlatformAdminUser } from "../shared/api";

export function WorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { data: pendingApprovalsTotal = 0 } = useQuery({
    queryKey: ["my-approvals", "workspace-badge-total"],
    queryFn: async () => {
      try {
        const res = await approvalsApi.listMyApprovals({ page: 1, pageSize: 1 });
        return res.meta.total;
      } catch {
        return 0;
      }
    },
    staleTime: 30_000,
    enabled: Boolean(getStoredUserProfile())
  });
  const showAdminTab = useMemo(() => {
    const user = getStoredUserProfile();
    return user ? isPlatformAdminUser(user) : false;
  }, [location.pathname]);

  const items = [
    {
      key: "my-documents",
      label: "Мои документы",
      children: (
        <Card>
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
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
        <Badge count={pendingApprovalsTotal} size="small" offset={[10, 0]}>
          <span>Мои согласования</span>
        </Badge>
      ),
      children: (
        <Card>
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
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
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Button type="primary" onClick={() => navigate("/profile")}>
              Перейти в профиль
            </Button>
          </Space>
        </Card>
      )
    },
    ...(showAdminTab
      ? [
          {
            key: "admin-panel",
            label: "Админ-панель",
            children: (
              <Card>
                <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                  <Button type="primary" onClick={() => navigate("/admin-panel")}>
                    Перейти в админ-панель
                  </Button>
                </Space>
              </Card>
            )
          }
        ]
      : [])
  ];

  return (
    <div>
      <Typography.Title level={3}>Рабочее место</Typography.Title>
      <Tabs defaultActiveKey="my-documents" items={items} />
    </div>
  );
}
