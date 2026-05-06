import { DeleteOutlined, KeyOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { adminApi, type EmployeeRow, type RouteRow } from "../shared/api";
import { PageHeader } from "../shared/components/PageHeader";
import { DOCUMENT_TYPE_SELECT_OPTIONS } from "../shared/documentTypes";

const ROLE_OPTIONS = [
  { value: "admin", label: "Администратор" },
  { value: "lawyer", label: "Юрист" },
  { value: "financier", label: "Финансист" },
  { value: "accountant", label: "Бухгалтер" }
];
const ROLE_LABEL_MAP: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((item) => [item.value, item.label]));

export function CompanyManagementPage() {
  const [employeeForm] = Form.useForm();
  const [routeForm] = Form.useForm();
  const [lastIssuedPassword, setLastIssuedPassword] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: employees = [] } = useQuery({ queryKey: ["company-admin-employees"], queryFn: adminApi.listCompanyAdminEmployees });
  const { data: routes = [] } = useQuery({ queryKey: ["company-admin-routes"], queryFn: adminApi.listCompanyRoutes });
  const { data: companyProfile } = useQuery({ queryKey: ["company-profile"], queryFn: adminApi.getMyCompanyProfile });

  const createEmployee = useMutation({
    mutationFn: adminApi.createCompanyAdminEmployee,
    onSuccess: (data) => {
      message.success("Сотрудник создан");
      if (data.oneTimePassword) {
        setLastIssuedPassword(data.oneTimePassword);
        message.info(`Одноразовый пароль: ${data.oneTimePassword}`);
      }
      employeeForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["company-admin-employees"] });
    }
  });
  const deleteEmployee = useMutation({
    mutationFn: adminApi.deleteCompanyAdminEmployee,
    onSuccess: () => {
      message.success("Сотрудник удален");
      queryClient.invalidateQueries({ queryKey: ["company-admin-employees"] });
    }
  });
  const resetEmployeePassword = useMutation({
    mutationFn: adminApi.resetCompanyAdminEmployeePassword,
    onSuccess: (data, _employeeId) => {
      if (data.oneTimePassword) {
        setLastIssuedPassword(data.oneTimePassword);
        message.success("Одноразовый пароль сгенерирован");
        message.info(`Одноразовый пароль: ${data.oneTimePassword}`);
      } else {
        message.success("Пароль сотрудника обновлен");
      }
      queryClient.invalidateQueries({ queryKey: ["company-admin-employees"] });
      queryClient.invalidateQueries({ queryKey: ["users", "me"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["company-profile"] });
    },
    onError: () => {
      message.error("Не удалось сгенерировать одноразовый пароль");
    }
  });
  const createRoute = useMutation({
    mutationFn: adminApi.createCompanyRoute,
    onSuccess: () => {
      message.success("Маршрут сохранен");
      routeForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["company-admin-routes"] });
    }
  });
  const deleteRoute = useMutation({
    mutationFn: adminApi.deleteCompanyRoute,
    onSuccess: () => {
      message.success("Маршрут удален");
      queryClient.invalidateQueries({ queryKey: ["company-admin-routes"] });
    }
  });

  const employeeColumns: ColumnsType<EmployeeRow> = [
    { title: "ФИО", dataIndex: "fullName", key: "fullName" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Должность", dataIndex: "position", key: "position" },
    {
      title: "Роли",
      dataIndex: "roles",
      key: "roles",
      render: (roles: string[]) => roles.map((role) => ROLE_LABEL_MAP[role] ?? role).join(", ")
    },
    { title: "Статус", dataIndex: "status", key: "status", render: (s) => <Tag color={s === "Активен" ? "success" : "default"}>{s}</Tag> },
    {
      title: "Действия",
      key: "actions",
      render: (_, row) => (
        <Space size={4}>
          <Button type="link" icon={<KeyOutlined />} loading={resetEmployeePassword.isPending} onClick={() => resetEmployeePassword.mutate(row.key)}>
            Смена пароля
          </Button>
          <Button danger type="link" icon={<DeleteOutlined />} onClick={() => deleteEmployee.mutate(row.key)}>
            Удалить
          </Button>
        </Space>
      )
    }
  ];
  const routeColumns: ColumnsType<RouteRow> = [
    { title: "Название", dataIndex: "name", key: "name" },
    { title: "Тип", dataIndex: "documentType", key: "documentType", render: (v) => v || "Любой" },
    { title: "По умолчанию", dataIndex: "isDefault", key: "isDefault", render: (v: boolean) => (v ? "Да" : "Нет") },
    { title: "Шагов", dataIndex: "steps", key: "steps", render: (steps) => steps?.length ?? 0 },
    {
      title: "Действия",
      key: "actions",
      render: (_, row) => (
        <Button danger type="link" icon={<DeleteOutlined />} onClick={() => deleteRoute.mutate(row.id)}>
          Удалить
        </Button>
      )
    }
  ];

  return (
    <div className="page-shell">
      <PageHeader title="Управление компанией" subtitle="Сотрудники, маршруты и профиль компании." />
      <Tabs
        items={[
          {
            key: "employees",
            label: "Сотрудники",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={16}>
                <Card title="Создать сотрудника">
                  <Form form={employeeForm} layout="vertical">
                    <Space wrap>
                      <Form.Item name="fullName" label="ФИО" rules={[{ required: true }]} style={{ minWidth: 260 }}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="email" label="Email" rules={[{ required: true }, { type: "email" }]} style={{ minWidth: 260 }}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="position" label="Должность" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="roles" label="Роли" rules={[{ required: true }]} style={{ minWidth: 280 }}>
                        <Select mode="multiple" options={ROLE_OPTIONS} />
                      </Form.Item>
                      <Form.Item label=" " style={{ alignSelf: "flex-end" }}>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          loading={createEmployee.isPending}
                          onClick={async () => createEmployee.mutate(await employeeForm.validateFields())}
                        >
                          Создать сотрудника
                        </Button>
                      </Form.Item>
                    </Space>
                    <div style={{ marginTop: 12, maxWidth: 520 }}>
                      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
                        Сгенерированный одноразовый пароль
                      </Typography.Text>
                      <Input value={lastIssuedPassword ?? "Появится после создания сотрудника или смены пароля"} readOnly />
                    </div>
                    {lastIssuedPassword ? (
                      <Alert
                        style={{ marginTop: 12, maxWidth: 520 }}
                        type="info"
                        showIcon
                        message="Передайте пароль сотруднику для входа."
                        description="До смены одноразового пароля сотрудником действия в системе будут заблокированы."
                      />
                    ) : null}
                  </Form>
                </Card>
                <Card title="Список сотрудников">
                  <Table className="app-table" columns={employeeColumns} dataSource={employees} />
                </Card>
              </Space>
            )
          },
          {
            key: "routes",
            label: "Маршруты согласования",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={16}>
                <Card title="Создать маршрут">
                  <Form form={routeForm} layout="vertical" initialValues={{ steps: [{ assigneeKind: "employee" }] }}>
                    <Form.Item name="name" label="Название" rules={[{ required: true }]} style={{ maxWidth: 520 }}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="documentType" label="Тип документа" style={{ maxWidth: 360 }}>
                      <Select allowClear options={DOCUMENT_TYPE_SELECT_OPTIONS} />
                    </Form.Item>
                    <Form.Item name="isDefault" label="Маршрут по умолчанию" style={{ maxWidth: 260 }}>
                      <Select options={[{ value: true, label: "Да" }, { value: false, label: "Нет" }]} />
                    </Form.Item>
                    <Form.List name="steps">
                      {(fields, { add, remove }) => (
                        <Space direction="vertical" style={{ width: "100%" }}>
                          {fields.map((field, index) => (
                            <Space key={field.key} wrap align="baseline" style={{ minHeight: 44 }}>
                              <Typography.Text style={{ minWidth: 20, lineHeight: "32px" }}>{index + 1}</Typography.Text>
                              <Form.Item name={[field.name, "assigneeKind"]} rules={[{ required: true }]} style={{ minWidth: 180 }}>
                                <Select options={[{ value: "employee", label: "Сотрудник" }]} />
                              </Form.Item>
                              <Form.Item name={[field.name, "assigneeEmployeeId"]} rules={[{ required: true }]} style={{ minWidth: 360 }}>
                                <Select
                                  showSearch
                                  optionFilterProp="label"
                                  options={employees.map((e) => ({
                                    value: Number(e.key),
                                    label: `${e.fullName} — ${e.position}`
                                  }))}
                                />
                              </Form.Item>
                              {fields.length > 1 ? (
                                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)}>
                                  Удалить шаг
                                </Button>
                              ) : null}
                            </Space>
                          ))}
                          <div style={{ marginBottom: 8 }}>
                            <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ assigneeKind: "employee" })}>
                              Добавить шаг
                            </Button>
                          </div>
                        </Space>
                      )}
                    </Form.List>
                    <div style={{ marginTop: 12 }}>
                      <Button type="primary" loading={createRoute.isPending} onClick={async () => {
                        const values = await routeForm.validateFields();
                        createRoute.mutate({
                          name: values.name,
                          isDefault: values.isDefault === true,
                          documentType: values.documentType ?? null,
                          steps: (values.steps ?? []).map((s: { assigneeKind: "employee"; assigneeEmployeeId: number }, i: number) => ({
                            stepOrder: i + 1,
                            assigneeKind: s.assigneeKind,
                            assigneeEmployeeId: s.assigneeEmployeeId
                          }))
                        });
                      }}>
                        Сохранить маршрут
                      </Button>
                    </div>
                  </Form>
                </Card>
                <Card title="Список маршрутов">
                  <Table className="app-table" rowKey="id" columns={routeColumns} dataSource={routes} />
                </Card>
              </Space>
            )
          },
          {
            key: "company-profile",
            label: "Профиль компании",
            children: (
              <Card title="Профиль компании">
                <Typography.Paragraph>Компания: <b>{companyProfile?.companyName ?? "—"}</b></Typography.Paragraph>
                <Typography.Paragraph>ИНН: <b>{companyProfile?.inn ?? "—"}</b></Typography.Paragraph>
              </Card>
            )
          }
        ]}
      />
    </div>
  );
}
