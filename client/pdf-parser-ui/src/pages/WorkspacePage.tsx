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

  const commonItems = [
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
    }
  ];
  const tenantItems = [
    {
      key: "my-documents",
      label: "Все документы",
      children: (
        <Card>
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Button type="primary" onClick={() => navigate("/my-documents")}>
              Перейти в все документы
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
    ...commonItems
  ];
  const platformItems = [
    ...commonItems,
    ...(showAdminTab
      ? [
          {
            key: "admin-panel",
            label: "Управление компаниями",
            children: (
              <Card>
                <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                  <Button type="primary" onClick={() => navigate("/admin-panel")}>
                    Перейти в управление компаниями
                  </Button>
                </Space>
              </Card>
            )
          }
        ]
      : [])
  ];
  const items = showAdminTab ? platformItems : tenantItems;

  return (
    <div>
      <Typography.Title level={3}>Рабочее место</Typography.Title>
      <Tabs defaultActiveKey="my-documents" items={items} />
    </div>
  );
}
