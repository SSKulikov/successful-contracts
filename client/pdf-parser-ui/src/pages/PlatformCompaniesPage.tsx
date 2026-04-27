import { DeleteOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Space, Table, Tabs, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { adminApi, type RegisteredCompanyRow } from "../shared/api";
import { PageHeader } from "../shared/components/PageHeader";
import { confirmDangerAction } from "../shared/utils/confirm-actions";

export function PlatformCompaniesPage() {
  const queryClient = useQueryClient();
  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: adminApi.listCompanies
  });
  const deleteCompanyMutation = useMutation({
    mutationFn: adminApi.deleteCompany,
    onSuccess: () => {
      message.success("Компания удалена. Доступ сотрудников компании заблокирован.");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    },
    onError: () => message.error("Не удалось удалить компанию")
  });

  const companyColumns: ColumnsType<RegisteredCompanyRow> = [
    { title: "Компания", dataIndex: "companyName", key: "companyName" },
    { title: "ИНН компании", dataIndex: "inn", key: "inn", width: 180 },
    { title: "Имя администратора", dataIndex: "adminFullName", key: "adminFullName", width: 220 },
    { title: "Почта администратора", dataIndex: "email", key: "email", width: 240 },
    {
      title: "Действия",
      key: "actions",
      width: 160,
      render: (_, record) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          loading={deleteCompanyMutation.isPending && deleteCompanyMutation.variables === record.key}
          onClick={() =>
            confirmDangerAction({
              title: "Удалить компанию?",
              content: "Компания и связанные учетные записи потеряют доступ к системе.",
              okText: "Удалить",
              onOk: () => deleteCompanyMutation.mutateAsync(record.key)
            })
          }
        >
          Удалить
        </Button>
      )
    }
  ];

  return (
    <div className="page-shell">
      <PageHeader title="Управление компаниями" />
      <Tabs
        defaultActiveKey="companies"
        items={[
          {
            key: "companies",
            label: "Зарегистрированные компании",
            children: (
              <Card title="Список зарегистрированных компаний">
                <Table
                  className="app-table"
                  columns={companyColumns}
                  dataSource={companies}
                  loading={isLoading}
                  pagination={{ pageSize: 8 }}
                  locale={{ emptyText: "Нет зарегистрированных компаний" }}
                />
              </Card>
            )
          },
          {
            key: "payment-status",
            label: "Статус оплаты",
            children: (
              <Card title="Статус оплаты">
                <Space direction="vertical">
                  <Typography.Text type="secondary">Данные по оплате будут добавлены позже.</Typography.Text>
                </Space>
              </Card>
            )
          }
        ]}
      />
    </div>
  );
}
