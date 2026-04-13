import { PlusOutlined, RedoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { USER_ROLE_STORAGE_KEY, RegisteredCompanyRow, adminApi, EmployeeRow, RouteRow } from "../shared/api";

function generateOneTimePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function AdminPanelPage() {
  const navigate = useNavigate();
  const [employeeForm] = Form.useForm();
  const [routeForm] = Form.useForm();
  const [companyRegisterForm] = Form.useForm();
  const [companyEditForm] = Form.useForm();
  const [companyEditOpen, setCompanyEditOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<RegisteredCompanyRow | null>(null);
  const [generatedOneTimePassword, setGeneratedOneTimePassword] = useState(generateOneTimePassword);
  const [lastIssuedPassword, setLastIssuedPassword] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem(USER_ROLE_STORAGE_KEY) !== "admin") {
      message.warning("Раздел доступен только администратору");
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const queryClient = useQueryClient();
  const { data: employees = [], isLoading: isEmployeesLoading } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: adminApi.listEmployees
  });
  const { data: routes = [], isLoading: isRoutesLoading } = useQuery({
    queryKey: ["admin-routes"],
    queryFn: adminApi.listRoutes
  });
  const { data: companies = [], isLoading: isCompaniesLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: adminApi.listCompanies
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
  const createCompanyMutation = useMutation({
    mutationFn: adminApi.createCompany,
    onSuccess: () => {
      message.success("Компания зарегистрирована");
      companyRegisterForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object"
          ? (err.response as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg ?? "Не удалось зарегистрировать компанию");
    }
  });
  const updateCompanyMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { companyName: string; inn: string; adminFullName: string } }) =>
      adminApi.updateCompany(id, payload),
    onSuccess: () => {
      message.success("Данные компании обновлены");
      setCompanyEditOpen(false);
      setEditingCompany(null);
      companyEditForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object"
          ? (err.response as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg ?? "Не удалось сохранить изменения");
    }
  });
  const deleteCompanyMutation = useMutation({
    mutationFn: adminApi.deleteCompany,
    onSuccess: () => {
      message.success("Компания удалена");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    },
    onError: () => message.error("Не удалось удалить компанию")
  });
  const resetCompanyAdminMutation = useMutation({
    mutationFn: adminApi.resetCompanyAdmin,
    onSuccess: (data) => {
      message.success("Сброс учётной записи администратора выполнен");
      if (data?.oneTimePassword) {
        message.info(`Новый одноразовый пароль: ${data.oneTimePassword}`);
      }
    },
    onError: () => message.error("Не удалось выполнить сброс")
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

  const companyColumns: ColumnsType<RegisteredCompanyRow> = [
    { title: "Компания", dataIndex: "companyName", key: "companyName" },
    { title: "ИНН компании", dataIndex: "inn", key: "inn", width: 160 },
    { title: "Имя администратора", dataIndex: "adminFullName", key: "adminFullName", width: 220 },
    {
      title: "Действия",
      key: "actions",
      width: 280,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setEditingCompany(record);
              companyEditForm.setFieldsValue({
                companyName: record.companyName,
                inn: record.inn,
                adminFullName: record.adminFullName
              });
              setCompanyEditOpen(true);
            }}
          >
            Редактировать
          </Button>
          <Button
            type="link"
            icon={<RedoOutlined />}
            onClick={() => resetCompanyAdminMutation.mutate(record.key)}
          >
            Сбросить сотрудника
          </Button>
          <Popconfirm
            title="Удалить компанию из списка?"
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteCompanyMutation.mutate(record.key)}
          >
            <Button type="link" danger>
              Удалить
            </Button>
          </Popconfirm>
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

  const handleRegisterCompany = async () => {
    const values = await companyRegisterForm.validateFields();
    await createCompanyMutation.mutateAsync({
      companyName: values.companyName,
      inn: values.inn,
      adminFullName: values.adminFullName,
      email: values.email,
      password: values.password
    });
  };

  const handleCompanyEditOk = async () => {
    const values = await companyEditForm.validateFields();
    if (!editingCompany) return;
    await updateCompanyMutation.mutateAsync({
      id: editingCompany.key,
      payload: {
        companyName: values.companyName,
        inn: values.inn,
        adminFullName: values.adminFullName
      }
    });
  };

  const handleCompanyEditCancel = () => {
    setCompanyEditOpen(false);
    setEditingCompany(null);
    companyEditForm.resetFields();
  };

  return (
    <div>
      <Typography.Title level={3}>Админ-панель</Typography.Title>
      <Typography.Paragraph type="secondary">
        Управление сотрудниками и маршрутами согласования. Сейчас это UI-скелет для последующего подключения API.
      </Typography.Paragraph>

      <Modal
        title="Редактировать компанию"
        open={companyEditOpen}
        onOk={handleCompanyEditOk}
        onCancel={handleCompanyEditCancel}
        destroyOnClose
        okText="Сохранить"
        confirmLoading={updateCompanyMutation.isPending}
      >
        <Form form={companyEditForm} layout="vertical">
          <Form.Item
            label="Название компании"
            name="companyName"
            rules={[{ required: true, message: "Укажите название компании" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="ИНН компании" name="inn" rules={[{ required: true, message: "Укажите ИНН" }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label="Имя администратора"
            name="adminFullName"
            rules={[{ required: true, message: "Укажите ФИО" }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>

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
          },
          {
            key: "company-registration",
            label: "Регистрация компании",
            children: (
              <Card title="Регистрация компании">
                <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  Зарегистрируйте компанию и получите права администратора для управления сотрудниками и маршрутами
                  согласования.
                </Typography.Paragraph>
                <Form form={companyRegisterForm} layout="vertical" style={{ maxWidth: 520 }}>
                  <Form.Item
                    label="Название компании"
                    name="companyName"
                    rules={[{ required: true, message: "Укажите название компании" }]}
                  >
                    <Input placeholder="ООО Ромашка" />
                  </Form.Item>
                  <Form.Item
                    label="ИНН компании"
                    name="inn"
                    rules={[{ required: true, message: "Укажите ИНН" }]}
                  >
                    <Input placeholder="1234567890" />
                  </Form.Item>
                  <Form.Item
                    label="Имя администратора"
                    name="adminFullName"
                    rules={[{ required: true, message: "Укажите ФИО" }]}
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
                  >
                    <Input placeholder="example@mail.com" />
                  </Form.Item>
                  <Form.Item
                    label="Пароль"
                    name="password"
                    rules={[{ required: true, message: "Введите пароль" }]}
                  >
                    <Input.Password placeholder="Минимум 8 символов" />
                  </Form.Item>
                  <Form.Item
                    label="Подтверждение пароля"
                    name="confirmPassword"
                    dependencies={["password"]}
                    rules={[
                      { required: true, message: "Подтвердите пароль" },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue("password") === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error("Пароли не совпадают"));
                        }
                      })
                    ]}
                  >
                    <Input.Password placeholder="Повторите пароль" />
                  </Form.Item>
                  <Button type="primary" loading={createCompanyMutation.isPending} onClick={handleRegisterCompany}>
                    Зарегистрировать компанию
                  </Button>
                </Form>
              </Card>
            )
          },
          {
            key: "companies",
            label: "Зарегистрированные компании",
            children: (
              <Card title="Список зарегистрированных компаний">
                <Table
                  columns={companyColumns}
                  dataSource={companies}
                  loading={isCompaniesLoading}
                  pagination={{ pageSize: 8 }}
                  locale={{ emptyText: "Нет зарегистрированных компаний — добавьте компанию во вкладке «Регистрация компании»" }}
                />
              </Card>
            )
          }
        ]}
      />
    </div>
  );
}
