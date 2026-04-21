import { DeleteOutlined, PlusOutlined, RedoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Checkbox, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RegisteredCompanyRow,
  adminApi,
  EmployeeRow,
  RouteRow,
  PLATFORM_DEMO_ADMIN_EMAIL,
  getStoredUserProfile,
  isPlatformAdminUser
} from "../shared/api";
import { PageHeader } from "../shared/components/PageHeader";
import { DOCUMENT_TYPE_SELECT_OPTIONS } from "../shared/documentTypes";
import { ApiErrorState } from "../shared/components/ApiErrorState";
import { getApiErrorMessage } from "../shared/utils/api-error";
import { confirmDangerAction } from "../shared/utils/confirm-actions";
import { useSingleFlight } from "../shared/utils/useSingleFlight";

const ROLE_OPTIONS = [
  { value: "admin", label: "Администратор" },
  { value: "lawyer", label: "Юрист" },
  { value: "financier", label: "Финансист" },
  { value: "accountant", label: "Бухгалтер" }
] as const;

const ROLE_LABEL_MAP: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

function generateOneTimePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function AdminPanelPage() {
  const navigate = useNavigate();
  const [employeeForm] = Form.useForm();
  const [routeForm] = Form.useForm();
  const [routeEditForm] = Form.useForm();
  const [companyRegisterForm] = Form.useForm();
  const [companyEditForm] = Form.useForm();
  const [employeeEditForm] = Form.useForm();
  const [companyEditOpen, setCompanyEditOpen] = useState(false);
  const [employeeEditOpen, setEmployeeEditOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(null);
  const [editingCompany, setEditingCompany] = useState<RegisteredCompanyRow | null>(null);
  const [generatedOneTimePassword, setGeneratedOneTimePassword] = useState(generateOneTimePassword);
  const [lastIssuedPassword, setLastIssuedPassword] = useState<string | null>(null);
  const [selectedRouteCompanyId, setSelectedRouteCompanyId] = useState<number | null>(null);
  const [routeEditOpen, setRouteEditOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteRow | null>(null);
  const { runSingleFlight, isSingleFlight } = useSingleFlight();

  useEffect(() => {
    const user = getStoredUserProfile();
    if (!user || !isPlatformAdminUser(user)) {
      message.warning("Раздел доступен только платформенному администратору");
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const queryClient = useQueryClient();
  const { data: employees = [], isLoading: isEmployeesLoading, isError: isEmployeesError, error: employeesError, refetch: refetchEmployees } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: adminApi.listEmployees
  });
  const { data: routes = [], isLoading: isRoutesLoading, isError: isRoutesError, error: routesError, refetch: refetchRoutes } = useQuery<RouteRow[]>({
    queryKey: ["admin-routes"],
    queryFn: () => adminApi.listRoutes()
  });
  const { data: companies = [], isLoading: isCompaniesLoading, isError: isCompaniesError, error: companiesError, refetch: refetchCompanies } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: adminApi.listCompanies
  });
  const adminQueryError = employeesError ?? routesError ?? companiesError;
  const hasAdminQueryError = isEmployeesError || isRoutesError || isCompaniesError;

  const companyEmployees = useMemo(
    () => employees.filter((e) => selectedRouteCompanyId != null && Number(e.key) > 0 && e.companyId === selectedRouteCompanyId),
    [employees, selectedRouteCompanyId]
  );

  const employeeSelectOptions = useMemo(
    () => companyEmployees.map((e) => ({ value: Number(e.key), label: `${e.fullName} — ${e.position}` })),
    [companyEmployees]
  );
  const createEmployeeMutation = useMutation({
    mutationFn: adminApi.createEmployee,
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object"
          ? (err.response as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg ?? "Не удалось создать сотрудника");
    },
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
  const deleteEmployeeMutation = useMutation({
    mutationFn: adminApi.deleteEmployee,
    onSuccess: () => {
      message.success("Сотрудник помечен как удалённый");
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object"
          ? (err.response as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg ?? "Не удалось удалить сотрудника");
    }
  });
  const updateEmployeeMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof adminApi.updateEmployee>[1] }) =>
      adminApi.updateEmployee(id, payload),
    onSuccess: () => {
      message.success("Данные сотрудника сохранены");
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
      setEmployeeEditOpen(false);
      setEditingEmployee(null);
      employeeEditForm.resetFields();
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object"
          ? (err.response as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg ?? "Не удалось сохранить изменения");
    }
  });
  const resetEmployeePasswordMutation = useMutation({
    mutationFn: adminApi.resetEmployeePassword,
    onSuccess: (data) => {
      message.success("Пароль сброшен");
      if (data?.oneTimePassword) {
        message.info(`Новый одноразовый пароль: ${data.oneTimePassword}`);
      }
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object"
          ? (err.response as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg ?? "Не удалось сбросить пароль");
    }
  });
  const createRouteMutation = useMutation({
    mutationFn: adminApi.createRoute,
    onSuccess: () => {
      message.success("Маршрут сохранен");
      routeForm.resetFields();
      setSelectedRouteCompanyId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-routes"] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object"
          ? (err.response as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg ?? "Не удалось создать маршрут");
    }
  });
  const updateRouteMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof adminApi.updateRoute>[1] }) =>
      adminApi.updateRoute(id, payload),
    onSuccess: () => {
      message.success("Маршрут обновлён");
      setRouteEditOpen(false);
      setEditingRoute(null);
      routeEditForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["admin-routes"] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object"
          ? (err.response as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg ?? "Не удалось обновить маршрут");
    }
  });
  const deleteRouteMutation = useMutation({
    mutationFn: adminApi.deleteRoute,
    onSuccess: () => {
      message.success("Маршрут удалён");
      queryClient.invalidateQueries({ queryKey: ["admin-routes"] });
    },
    onError: () => message.error("Не удалось удалить маршрут")
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
  const assignCompanyAdminMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { email: string; fullName?: string } }) =>
      adminApi.assignCompanyAdmin(id, payload),
    onSuccess: () => {
      message.success("Администратор компании назначен");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err && err.response && typeof err.response === "object"
          ? (err.response as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg ?? "Не удалось назначить администратора");
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
        <Typography.Text>{roles.map((role) => ROLE_LABEL_MAP[role] ?? role).join(", ")}</Typography.Text>
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
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            disabled={Boolean(record.deletedAt)}
            onClick={() => {
              setEditingEmployee(record);
              employeeEditForm.setFieldsValue({
                fullName: record.fullName,
                email: record.email,
                position: record.position,
                companyId: record.companyId ?? undefined,
                roles: record.roles,
                status: record.status
              });
              setEmployeeEditOpen(true);
            }}
          >
            Редактировать
          </Button>
          <Button
            type="link"
            icon={<RedoOutlined />}
            disabled={Boolean(record.deletedAt)}
            loading={
              (resetEmployeePasswordMutation.isPending &&
                resetEmployeePasswordMutation.variables === record.key) ||
              isSingleFlight(`reset-employee-password-${record.key}`)
            }
            onClick={() =>
              void runSingleFlight(`reset-employee-password-${record.key}`, () =>
                resetEmployeePasswordMutation.mutateAsync(record.key)
              )
            }
          >
            Сбросить пароль
          </Button>
          <Button
            type="link"
            danger
            loading={
              (deleteEmployeeMutation.isPending && deleteEmployeeMutation.variables === record.key) ||
              isSingleFlight(`delete-employee-${record.key}`)
            }
            disabled={record.email === PLATFORM_DEMO_ADMIN_EMAIL || Boolean(record.deletedAt)}
            onClick={() =>
              confirmDangerAction({
                title: "Пометить сотрудника как удалённого?",
                content: "Вход будет заблокирован.",
                okText: "Удалить",
                onOk: async () => {
                  await runSingleFlight(`delete-employee-${record.key}`, () =>
                    deleteEmployeeMutation.mutateAsync(record.key)
                  );
                }
              })
            }
          >
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
                adminFullName: record.adminFullName,
                adminEmail: ""
              });
              setCompanyEditOpen(true);
            }}
          >
            Редактировать
          </Button>
          <Button
            type="link"
            icon={<RedoOutlined />}
            loading={
              (resetCompanyAdminMutation.isPending && resetCompanyAdminMutation.variables === record.key) ||
              isSingleFlight(`reset-company-admin-${record.key}`)
            }
            onClick={() =>
              void runSingleFlight(`reset-company-admin-${record.key}`, () =>
                resetCompanyAdminMutation.mutateAsync(record.key)
              )
            }
          >
            Сбросить сотрудника
          </Button>
          <Button
            type="link"
            danger
            loading={
              (deleteCompanyMutation.isPending && deleteCompanyMutation.variables === record.key) ||
              isSingleFlight(`delete-company-${record.key}`)
            }
            onClick={() =>
              confirmDangerAction({
                title: "Удалить компанию из списка?",
                content: "Данные компании и связанные настройки будут недоступны.",
                okText: "Удалить",
                onOk: async () => {
                  await runSingleFlight(`delete-company-${record.key}`, () =>
                    deleteCompanyMutation.mutateAsync(record.key)
                  );
                }
              })
            }
          >
            Удалить
          </Button>
        </Space>
      )
    }
  ];

  const routeColumns: ColumnsType<RouteRow> = [
    { title: "Название", dataIndex: "name", key: "name", width: 240 },
    {
      title: "Компания",
      dataIndex: "companyId",
      key: "companyId",
      width: 200,
      render: (companyId: number) => {
        const company = companies.find((c) => Number(c.key) === companyId);
        return company ? company.companyName : `#${companyId}`;
      }
    },
    {
      title: "По умолчанию",
      dataIndex: "isDefault",
      key: "isDefault",
      width: 120,
      render: (v: boolean) => (v ? <Tag color="blue">Да</Tag> : <Tag>Нет</Tag>)
    },
    {
      title: "Тип документа",
      dataIndex: "documentType",
      key: "documentType",
      width: 140,
      render: (t: string | null | undefined) => (t ? <Tag>{t}</Tag> : <Typography.Text type="secondary">Любой</Typography.Text>)
    },
    {
      title: "Шаги",
      dataIndex: "steps",
      key: "steps",
      render: (steps: RouteRow["steps"]) => {
        const resolveName = (id: number | null) => {
          if (!id) return "?";
          const emp = employees.find((e) => Number(e.key) === id);
          return emp ? emp.fullName : `#${id}`;
        };
        return steps
          .map((s) =>
            s.assigneeKind === "employee"
              ? resolveName(s.assigneeEmployeeId)
              : `${ROLE_LABEL_MAP[s.roleKey ?? ""] ?? s.roleKey} (${resolveName(s.defaultEmployeeId)})`
          )
          .join(" → ");
      }
    },
    {
      title: "Действия",
      key: "actions",
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setEditingRoute(record);
              routeEditForm.setFieldsValue({
                name: record.name,
                isDefault: record.isDefault,
                documentType: record.documentType ?? undefined,
                steps: record.steps.map((s) => ({
                  assigneeKind: s.assigneeKind,
                  assigneeEmployeeId: s.assigneeEmployeeId ?? undefined,
                  roleKey: s.roleKey ?? undefined,
                  defaultEmployeeId: s.defaultEmployeeId ?? undefined
                }))
              });
              setRouteEditOpen(true);
            }}
          >
            Изменить
          </Button>
          <Button
            type="link"
            danger
            loading={
              (deleteRouteMutation.isPending && deleteRouteMutation.variables === record.id) ||
              isSingleFlight(`delete-route-${record.id}`)
            }
            onClick={() =>
              confirmDangerAction({
                title: "Удалить маршрут?",
                content: "Маршрут будет удален без возможности восстановления.",
                okText: "Удалить",
                onOk: async () => {
                  await runSingleFlight(`delete-route-${record.id}`, () =>
                    deleteRouteMutation.mutateAsync(record.id)
                  );
                }
              })
            }
          >
            Удалить
          </Button>
        </Space>
      )
    }
  ];

  const handleCreateEmployee = async () => {
    const values = await employeeForm.validateFields();
    await createEmployeeMutation.mutateAsync({
      fullName: values.fullName,
      email: values.email,
      position: values.position,
      roles: values.roles,
      oneTimePassword: values.oneTimePassword || generatedOneTimePassword,
      ...(values.companyId != null && values.companyId !== "" ? { companyId: Number(values.companyId) } : {})
    });
  };

  const handleCreateRoute = async () => {
    try {
      const values = await routeForm.validateFields();
      await createRouteMutation.mutateAsync({
        companyId: Number(values.companyId),
        name: values.name,
        isDefault: !!values.isDefault,
        documentType: values.documentType ? String(values.documentType) : null,
        steps: (values.steps ?? []).map((s: { assigneeKind: string; assigneeEmployeeId?: number; roleKey?: string; defaultEmployeeId?: number }, i: number) => ({
          stepOrder: i + 1,
          assigneeKind: s.assigneeKind,
          ...(s.assigneeKind === "employee" ? { assigneeEmployeeId: s.assigneeEmployeeId } : {}),
          ...(s.assigneeKind === "role_default" ? { roleKey: s.roleKey, defaultEmployeeId: s.defaultEmployeeId } : {})
        }))
      });
    } catch {
      // validateFields выбрасывает при ошибке валидации — Ant Design покажет ошибки в полях
    }
  };

  const handleRouteEditOk = async () => {
    if (!editingRoute) return;
    try {
      const values = await routeEditForm.validateFields();
      await updateRouteMutation.mutateAsync({
        id: editingRoute.id,
        payload: {
          name: values.name,
          isDefault: !!values.isDefault,
          documentType: values.documentType ? String(values.documentType) : null,
          steps: (values.steps ?? []).map((s: { assigneeKind: string; assigneeEmployeeId?: number; roleKey?: string; defaultEmployeeId?: number }, i: number) => ({
            stepOrder: i + 1,
            assigneeKind: s.assigneeKind,
            ...(s.assigneeKind === "employee" ? { assigneeEmployeeId: s.assigneeEmployeeId } : {}),
            ...(s.assigneeKind === "role_default" ? { roleKey: s.roleKey, defaultEmployeeId: s.defaultEmployeeId } : {})
          }))
        }
      });
    } catch {
      // валидация формы
    }
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
    const adminEmail = String(values.adminEmail ?? "").trim().toLowerCase();
    if (adminEmail) {
      const candidate = employees.find((e) => e.email.trim().toLowerCase() === adminEmail);
      const targetCompanyId = Number(editingCompany.key);
      if (candidate && candidate.roles.includes("admin") && candidate.companyId != null && candidate.companyId !== targetCompanyId) {
        message.error("Нельзя назначить этого сотрудника: он уже администратор другой компании.");
        return;
      }
    }
    await updateCompanyMutation.mutateAsync({
      id: editingCompany.key,
      payload: {
        companyName: values.companyName,
        inn: values.inn,
        adminFullName: values.adminFullName
      }
    });
    if (adminEmail) {
      await assignCompanyAdminMutation.mutateAsync({
        id: editingCompany.key,
        payload: { email: adminEmail, fullName: values.adminFullName }
      });
    }
  };

  const handleCompanyEditCancel = () => {
    setCompanyEditOpen(false);
    setEditingCompany(null);
    companyEditForm.resetFields();
  };

  const handleEmployeeEditOk = async () => {
    if (!editingEmployee) return;
    try {
      const values = await employeeEditForm.validateFields();
      const isPlatform = editingEmployee.email === PLATFORM_DEMO_ADMIN_EMAIL;
      await updateEmployeeMutation.mutateAsync({
        id: editingEmployee.key,
        payload: isPlatform
          ? {
              fullName: values.fullName,
              position: values.position,
              status: values.status,
              email: editingEmployee.email,
              roles: editingEmployee.roles,
              companyId: null
            }
          : {
              fullName: values.fullName,
              email: values.email,
              position: values.position,
              roles: values.roles,
              companyId:
                values.companyId != null && values.companyId !== "" ? Number(values.companyId) : null,
              status: values.status
            }
      });
    } catch {
      // валидация формы
    }
  };

  const handleEmployeeEditCancel = () => {
    setEmployeeEditOpen(false);
    setEditingEmployee(null);
    employeeEditForm.resetFields();
  };

  return (
    <div className="page-shell">
      <PageHeader title="Админ-панель" subtitle="Управление сотрудниками, маршрутами согласования и компаниями." />
      <Typography.Paragraph type="secondary" style={{ marginTop: -6, marginBottom: 16 }}>
        Рекомендуемый порядок: зарегистрируйте компанию → добавьте сотрудников и роли → настройте маршрут согласования.
      </Typography.Paragraph>
      {hasAdminQueryError ? (
        <ApiErrorState
          title="Не удалось загрузить данные админ-панели"
          description={getApiErrorMessage(adminQueryError)}
          onRetry={() => {
            void refetchEmployees();
            void refetchRoutes();
            void refetchCompanies();
          }}
          fallbackText="Перейти к документам"
          onFallback={() => navigate("/my-documents")}
        />
      ) : null}
      <Modal
        title="Редактировать маршрут"
        open={routeEditOpen}
        onOk={handleRouteEditOk}
        onCancel={() => { setRouteEditOpen(false); setEditingRoute(null); routeEditForm.resetFields(); }}
        destroyOnHidden
        okText="Сохранить"
        width={720}
        confirmLoading={updateRouteMutation.isPending}
      >
        <Form form={routeEditForm} layout="vertical">
          <Form.Item label="Название" name="name" rules={[{ required: true, message: "Укажите название" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="isDefault" valuePropName="checked">
            <Checkbox>Маршрут по умолчанию</Checkbox>
          </Form.Item>
          <Form.Item
            label="Тип документа"
            name="documentType"
            tooltip="Если не выбран — маршрут доступен для любого типа документа."
            style={{ maxWidth: 360 }}
          >
            <Select allowClear placeholder="Любой тип" options={[...DOCUMENT_TYPE_SELECT_OPTIONS]} />
          </Form.Item>
          <Typography.Text strong style={{ display: "block", margin: "8px 0" }}>Шаги</Typography.Text>
          <Form.List name="steps" rules={[{ validator: async (_, v) => { if (!v || !v.length) throw new Error("Добавьте шаг"); } }]}>
            {(fields, { add, remove }, { errors }) => {
              const editEmployeeOptions = editingRoute
                ? employees.filter((e) => e.companyId === editingRoute.companyId).map((e) => ({ value: Number(e.key), label: `${e.fullName} — ${e.position}` }))
                : [];
              return (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" wrap style={{ display: "flex", marginBottom: 8 }}>
                      <Tag>{field.name + 1}</Tag>
                      <Form.Item {...field} name={[field.name, "assigneeKind"]} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <Select style={{ width: 180 }}>
                          <Select.Option value="employee">Сотрудник</Select.Option>
                          <Select.Option value="role_default">По роли</Select.Option>
                        </Select>
                      </Form.Item>
                      <Form.Item noStyle shouldUpdate={(prev, cur) => prev?.steps?.[field.name]?.assigneeKind !== cur?.steps?.[field.name]?.assigneeKind}>
                        {({ getFieldValue }) => {
                          const kind = getFieldValue(["steps", field.name, "assigneeKind"]);
                          if (kind === "role_default") {
                            return (
                              <>
                                <Form.Item name={[field.name, "roleKey"]} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                  <Select placeholder="Роль" style={{ width: 180 }} options={[...ROLE_OPTIONS]} />
                                </Form.Item>
                                <Form.Item name={[field.name, "defaultEmployeeId"]} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                  <Select placeholder="Сотрудник" style={{ width: 260 }} showSearch optionFilterProp="label" options={editEmployeeOptions} />
                                </Form.Item>
                              </>
                            );
                          }
                          return (
                            <Form.Item name={[field.name, "assigneeEmployeeId"]} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                              <Select placeholder="Сотрудник" style={{ width: 260 }} showSearch optionFilterProp="label" options={editEmployeeOptions} />
                            </Form.Item>
                          );
                        }}
                      </Form.Item>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                    </Space>
                  ))}
                  <Form.Item>
                    <Button type="dashed" onClick={() => add({ assigneeKind: "employee" })} icon={<PlusOutlined />}>Добавить шаг</Button>
                    <Form.ErrorList errors={errors} />
                  </Form.Item>
                </>
              );
            }}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="Редактировать сотрудника"
        open={employeeEditOpen}
        onOk={handleEmployeeEditOk}
        onCancel={handleEmployeeEditCancel}
        destroyOnHidden
        okText="Сохранить"
        confirmLoading={updateEmployeeMutation.isPending}
        width={560}
      >
        <Form form={employeeEditForm} layout="vertical">
          <Form.Item label="ФИО" name="fullName" rules={[{ required: true, message: "Укажите ФИО" }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: "Укажите email" },
              { type: "email", message: "Введите корректный email" }
            ]}
          >
            <Input disabled={editingEmployee?.email === PLATFORM_DEMO_ADMIN_EMAIL} />
          </Form.Item>
          <Form.Item label="Должность" name="position" rules={[{ required: true, message: "Укажите должность" }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label="Компания"
            name="companyId"
            dependencies={["roles"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const roles = getFieldValue("roles") as string[] | undefined;
                  if (editingEmployee?.email === PLATFORM_DEMO_ADMIN_EMAIL) {
                    return Promise.resolve();
                  }
                  if (roles?.includes("admin") && (value === undefined || value === null || value === "")) {
                    return Promise.reject(new Error("Выберите компанию для администратора"));
                  }
                  return Promise.resolve();
                }
              })
            ]}
          >
            <Select
              allowClear
              placeholder="Без компании (платформа)"
              disabled={editingEmployee?.email === PLATFORM_DEMO_ADMIN_EMAIL}
              options={companies.map((c) => ({
                value: Number(c.key),
                label: `${c.companyName} (ИНН ${c.inn})`
              }))}
            />
          </Form.Item>
          <Form.Item label="Роли" name="roles" rules={[{ required: true, message: "Выберите хотя бы одну роль" }]}>
            <Select
              mode="multiple"
              placeholder="Роли"
              disabled={editingEmployee?.email === PLATFORM_DEMO_ADMIN_EMAIL}
              options={[
                { value: "admin", label: "Администратор компании (один на компанию)" },
                { value: "lawyer", label: "Юрист" },
                { value: "financier", label: "Финансист" },
                { value: "accountant", label: "Бухгалтер" }
              ]}
            />
          </Form.Item>
          <Form.Item label="Статус" name="status" rules={[{ required: true, message: "Выберите статус" }]}>
            <Select
              options={[
                { value: "Активен", label: "Активен" },
                { value: "Неактивен", label: "Неактивен" }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Редактировать компанию"
        open={companyEditOpen}
        onOk={handleCompanyEditOk}
        onCancel={handleCompanyEditCancel}
        destroyOnHidden
        okText="Сохранить"
        confirmLoading={updateCompanyMutation.isPending || assignCompanyAdminMutation.isPending}
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
          <Form.Item
            label="Email администратора (существующий сотрудник без компании)"
            name="adminEmail"
            tooltip="Необязательно. Если заполнено, система назначит админом сотрудника с этим email."
            rules={[{ type: "email", message: "Введите корректный email" }]}
          >
            <Input placeholder="user@company.ru" />
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
              <Space orientation="vertical" size={16} style={{ width: "100%" }}>
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
                        label="Компания"
                        name="companyId"
                        tooltip="Обязательно, если выбрана роль «Администратор компании». Один администратор на компанию."
                        style={{ minWidth: 300 }}
                        dependencies={["roles"]}
                        rules={[
                          ({ getFieldValue }) => ({
                            validator(_, value) {
                              const roles = getFieldValue("roles") as string[] | undefined;
                              if (roles?.includes("admin") && (value === undefined || value === null || value === "")) {
                                return Promise.reject(new Error("Выберите компанию для администратора"));
                              }
                              return Promise.resolve();
                            }
                          })
                        ]}
                      >
                        <Select
                          allowClear
                          placeholder="Платформа (без компании)"
                          options={companies.map((c) => ({
                            value: Number(c.key),
                            label: `${c.companyName} (ИНН ${c.inn})`
                          }))}
                        />
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
                            { value: "admin", label: "Администратор компании (один на компанию)" },
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
                    className="app-table"
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
              <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <Card title="Создать маршрут">
                  <Form form={routeForm} layout="vertical">
                    <Space wrap style={{ width: "100%" }}>
                      <Form.Item
                        label="Компания"
                        name="companyId"
                        rules={[{ required: true, message: "Выберите компанию" }]}
                        style={{ minWidth: 300 }}
                      >
                        <Select
                          placeholder="Выберите компанию"
                          options={companies.map((c) => ({
                            value: Number(c.key),
                            label: `${c.companyName} (ИНН ${c.inn})`
                          }))}
                          onChange={(val: number) => {
                            setSelectedRouteCompanyId(val);
                            routeForm.setFieldValue("steps", []);
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        label="Название маршрута"
                        name="name"
                        rules={[{ required: true, message: "Укажите название маршрута" }]}
                        style={{ minWidth: 260 }}
                      >
                        <Input placeholder="Базовый маршрут договора" />
                      </Form.Item>
                      <Form.Item name="isDefault" valuePropName="checked" style={{ minWidth: 180, alignSelf: "flex-end" }}>
                        <Checkbox>Маршрут по умолчанию</Checkbox>
                      </Form.Item>
                    </Space>

                    <Form.Item
                      label="Тип документа"
                      name="documentType"
                      tooltip="Если не выбран — маршрут доступен для любого типа документа."
                      style={{ maxWidth: 360 }}
                    >
                      <Select allowClear placeholder="Любой тип" options={[...DOCUMENT_TYPE_SELECT_OPTIONS]} />
                    </Form.Item>

                    <Typography.Text strong style={{ display: "block", margin: "8px 0" }}>
                      Шаги маршрута
                    </Typography.Text>
                    <Form.List
                      name="steps"
                      rules={[
                        {
                          validator: async (_, value) => {
                            if (!value || value.length === 0) {
                              return Promise.reject(new Error("Добавьте хотя бы один шаг"));
                            }
                          }
                        }
                      ]}
                    >
                      {(fields, { add, remove }, { errors }) => (
                        <>
                          {!selectedRouteCompanyId && (
                            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                              Сначала выберите компанию
                            </Typography.Text>
                          )}
                          {fields.map((field) => (
                            <Space key={field.key} align="baseline" wrap style={{ display: "flex", marginBottom: 8 }}>
                              <Tag>{field.name + 1}</Tag>
                              <Form.Item
                                {...field}
                                name={[field.name, "assigneeKind"]}
                                rules={[{ required: true, message: "Тип" }]}
                                style={{ marginBottom: 0 }}
                              >
                                <Select placeholder="Тип назначения" style={{ width: 180 }}>
                                  <Select.Option value="employee">Сотрудник</Select.Option>
                                  <Select.Option value="role_default">По роли</Select.Option>
                                </Select>
                              </Form.Item>
                              <Form.Item noStyle shouldUpdate={(prev, cur) =>
                                prev?.steps?.[field.name]?.assigneeKind !== cur?.steps?.[field.name]?.assigneeKind
                              }>
                                {({ getFieldValue }) => {
                                  const kind = getFieldValue(["steps", field.name, "assigneeKind"]);
                                  if (kind === "role_default") {
                                    return (
                                      <>
                                        <Form.Item
                                          name={[field.name, "roleKey"]}
                                          rules={[{ required: true, message: "Роль" }]}
                                          style={{ marginBottom: 0 }}
                                        >
                                          <Select placeholder="Роль" style={{ width: 180 }} options={[...ROLE_OPTIONS]} />
                                        </Form.Item>
                                        <Form.Item
                                          name={[field.name, "defaultEmployeeId"]}
                                          rules={[{ required: true, message: "Выберите сотрудника" }]}
                                          style={{ marginBottom: 0 }}
                                        >
                                          <Select
                                            placeholder="Fallback-сотрудник"
                                            style={{ width: 260 }}
                                            showSearch
                                            optionFilterProp="label"
                                            options={employeeSelectOptions}
                                            notFoundContent="Нет сотрудников в этой компании"
                                          />
                                        </Form.Item>
                                      </>
                                    );
                                  }
                                  return (
                                    <Form.Item
                                      name={[field.name, "assigneeEmployeeId"]}
                                      rules={[{ required: true, message: "Выберите сотрудника" }]}
                                      style={{ marginBottom: 0 }}
                                    >
                                      <Select
                                        placeholder="Сотрудник"
                                        style={{ width: 260 }}
                                        showSearch
                                        optionFilterProp="label"
                                        options={employeeSelectOptions}
                                        notFoundContent="Нет сотрудников в этой компании"
                                      />
                                    </Form.Item>
                                  );
                                }}
                              </Form.Item>
                              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                            </Space>
                          ))}
                          <Form.Item>
                            <Button
                              type="dashed"
                              onClick={() => add({ assigneeKind: "employee" })}
                              icon={<PlusOutlined />}
                              disabled={!selectedRouteCompanyId}
                            >
                              Добавить шаг
                            </Button>
                            <Form.ErrorList errors={errors} />
                          </Form.Item>
                        </>
                      )}
                    </Form.List>

                    <Button type="primary" loading={createRouteMutation.isPending} onClick={handleCreateRoute}>
                      Сохранить маршрут
                    </Button>
                  </Form>
                </Card>

                <Card title="Список маршрутов">
                  <Table className="app-table" columns={routeColumns} dataSource={routes} rowKey="id" loading={isRoutesLoading} pagination={{ pageSize: 8 }} />
                </Card>
              </Space>
            )
          },
          {
            key: "company-registration",
            label: "Регистрация компании",
            children: (
              <Card title="Регистрация компании">
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
                  className="app-table"
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
