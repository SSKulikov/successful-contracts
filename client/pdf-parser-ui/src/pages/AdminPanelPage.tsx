import { PlusOutlined, RedoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Form, Input, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { adminApi, EmployeeRow, RouteRow } from "../shared/api";

function generateOneTimePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function AdminPanelPage() {
  const [employeeForm] = Form.useForm();
  const [routeForm] = Form.useForm();
  const [generatedOneTimePassword, setGeneratedOneTimePassword] = useState(generateOneTimePassword);
  const [lastIssuedPassword, setLastIssuedPassword] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading: isEmployeesLoading } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: adminApi.listEmployees
  });
  const { data: routes = [], isLoading: isRoutesLoading } = useQuery({
    queryKey: ["admin-routes"],
    queryFn: adminApi.listRoutes
  });
  const createEmployeeMutation = useMutation({
    mutationFn: adminApi.createEmployee,
    onSuccess: (response: { oneTimePassword?: string }) => {
      message.success("Сотрудник добавлен");
      if (response?.oneTimePassword) {
        setLastIssuedPassword(response.oneTimePassword);
        setGeneratedOneTimePassword(response.oneTimePassword);
        employeeForm.setFieldValue("oneTimePassword", response.oneTimePassword);
        message.info(`Одноразовый пароль: ${response.oneTimePassword}`);
      }
      employeeForm.resetFields();
      const nextPassword = generateOneTimePassword();
      setGeneratedOneTimePassword(nextPassword);
      employeeForm.setFieldValue("oneTimePassword", nextPassword);
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    }
  });
  const createRouteMutation = useMutation({
    mutationFn: adminApi.createRoute,
    onSuccess: () => {
      message.success("Маршрут сохранен");
      routeForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["admin-routes"] });
    }
  });

  const employeeColumns: ColumnsType<EmployeeRow> = [
    { title: "ФИО", dataIndex: "fullName", key: "fullName" },
    { title: "Email", dataIndex: "email", key: "email", width: 220 },
    { title: "Должность", dataIndex: "position", key: "position", width: 160 },
    {
      title: "Роли",
      dataIndex: "roles",
      key: "roles",
      width: 220,
      render: (roles: string[]) => (
        <Space wrap>
          {roles.map((role) => (
            <Tag key={role}>{role}</Tag>
          ))}
        </Space>
      )
    },
    {
      title: "Статус",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: EmployeeRow["status"]) => (
        <Tag color={status === "Активен" ? "success" : "default"}>{status}</Tag>
      )
    },
    {
      title: "Действия",
      key: "actions",
      width: 280,
      render: () => (
        <Space>
          <Button type="link">Редактировать</Button>
          <Button type="link" icon={<RedoOutlined />}>
            Сбросить пароль
          </Button>
          <Button type="link" danger>
            Удалить
          </Button>
        </Space>
      )
    }
  ];

  const routeColumns: ColumnsType<RouteRow> = [
    { title: "Тип документа", dataIndex: "documentType", key: "documentType", width: 180 },
    { title: "Маршрут", dataIndex: "routeName", key: "routeName", width: 220 },
    { title: "Этапы", dataIndex: "steps", key: "steps" },
    {
      title: "Действия",
      key: "actions",
      width: 160,
      render: () => (
        <Space>
          <Button type="link">Изменить</Button>
          <Button type="link" danger>
            Удалить
          </Button>
        </Space>
      )
    }
  ];

  const handleCreateEmployee = async () => {
    const values = await employeeForm.validateFields();
    await createEmployeeMutation.mutateAsync({
      ...values,
      oneTimePassword: values.oneTimePassword || generatedOneTimePassword
    });
  };

  const handleCreateRoute = async () => {
    const values = await routeForm.validateFields();
    await createRouteMutation.mutateAsync(values);
  };

  return (
    <div>
      <Typography.Title level={3}>Админ-панель</Typography.Title>
      <Typography.Paragraph type="secondary">
        Управление сотрудниками и маршрутами согласования. Сейчас это UI-скелет для последующего подключения API.
      </Typography.Paragraph>

      <Tabs
        defaultActiveKey="employees"
        items={[
          {
            key: "employees",
            label: "Сотрудники",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="Создать сотрудника">
                  <Form
                    form={employeeForm}
                    layout="vertical"
                    initialValues={{
                      oneTimePassword: generatedOneTimePassword
                    }}
                  >
                    <Space wrap style={{ width: "100%" }}>
                      <Form.Item
                        label="ФИО"
                        name="fullName"
                        rules={[{ required: true, message: "Укажите ФИО" }]}
                        style={{ minWidth: 260 }}
                      >
                        <Input placeholder="Иван Иванов" />
                      </Form.Item>
                      <Form.Item
                        label="Email"
                        name="email"
                        rules={[
                          { required: true, message: "Укажите email" },
                          { type: "email", message: "Введите корректный email" }
                        ]}
                        style={{ minWidth: 260 }}
                      >
                        <Input placeholder="user@company.ru" />
                      </Form.Item>
                      <Form.Item
                        label="Должность"
                        name="position"
                        rules={[{ required: true, message: "Укажите должность" }]}
                        style={{ minWidth: 220 }}
                      >
                        <Input placeholder="Финансист" />
                      </Form.Item>
                      <Form.Item
                        label="Роли"
                        name="roles"
                        rules={[{ required: true, message: "Выберите хотя бы одну роль" }]}
                        style={{ minWidth: 260 }}
                      >
                        <Select
                          mode="multiple"
                          placeholder="Выберите роли"
                          options={[
                            { value: "lawyer", label: "Юрист" },
                            { value: "financier", label: "Финансист" },
                            { value: "accountant", label: "Бухгалтер" }
                          ]}
                        />
                      </Form.Item>
                      <Form.Item
                        label="Одноразовый пароль"
                        name="oneTimePassword"
                        tooltip="Сотрудник использует этот пароль для первого входа."
                        style={{ minWidth: 260 }}
                      >
                        <Input value={generatedOneTimePassword} readOnly />
                      </Form.Item>
                    </Space>
                    <Space style={{ marginBottom: 12 }}>
                      <Button
                        onClick={() => {
                          const nextPassword = generateOneTimePassword();
                          setGeneratedOneTimePassword(nextPassword);
                          employeeForm.setFieldValue("oneTimePassword", nextPassword);
                        }}
                      >
                        Сгенерировать заново
                      </Button>
                    </Space>
                    {lastIssuedPassword && (
                      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                        Пароль последнего созданного сотрудника: {lastIssuedPassword}
                      </Typography.Text>
                    )}
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      loading={createEmployeeMutation.isPending}
                      onClick={handleCreateEmployee}
                    >
                      Создать сотрудника
                    </Button>
                  </Form>
                </Card>

                <Card title="Список сотрудников">
                  <Table
                    columns={employeeColumns}
                    dataSource={employees}
                    loading={isEmployeesLoading}
                    pagination={{ pageSize: 8 }}
                  />
                </Card>
              </Space>
            )
          },
          {
            key: "routes",
            label: "Маршруты согласования",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="Создать маршрут">
                  <Form form={routeForm} layout="vertical">
                    <Space wrap style={{ width: "100%" }}>
                      <Form.Item
                        label="Тип документа"
                        name="documentType"
                        rules={[{ required: true, message: "Выберите тип документа" }]}
                        style={{ minWidth: 220 }}
                      >
                        <Select
                          placeholder="Выберите тип"
                          options={[
                            { value: "contract", label: "Договор" },
                            { value: "upd", label: "УПД" },
                            { value: "invoice", label: "Счет на оплату" },
                            { value: "act", label: "Акт" },
                            { value: "waybill", label: "Товарная накладная" }
                          ]}
                        />
                      </Form.Item>
                      <Form.Item
                        label="Название маршрута"
                        name="routeName"
                        rules={[{ required: true, message: "Укажите название маршрута" }]}
                        style={{ minWidth: 260 }}
                      >
                        <Input placeholder="Базовый маршрут договора" />
                      </Form.Item>
                      <Form.Item
                        label="Этапы (через ->)"
                        name="steps"
                        rules={[{ required: true, message: "Укажите этапы маршрута" }]}
                        style={{ minWidth: 420 }}
                      >
                        <Input placeholder="Инициатор -> Юрист -> Финансист -> Главбух" />
                      </Form.Item>
                    </Space>
                    <Button type="primary" loading={createRouteMutation.isPending} onClick={handleCreateRoute}>
                      Сохранить маршрут
                    </Button>
                  </Form>
                </Card>

                <Card title="Список маршрутов">
                  <Table columns={routeColumns} dataSource={routes} loading={isRoutesLoading} pagination={{ pageSize: 8 }} />
                </Card>
              </Space>
            )
          }
        ]}
      />
    </div>
  );
}
