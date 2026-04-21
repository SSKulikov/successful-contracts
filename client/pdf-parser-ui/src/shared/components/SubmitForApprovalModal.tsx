import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Form, Modal, Segmented, Select, Space, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { adminApi, documentsApi, type RouteRow } from "../api";

type StepRow = { employeeId?: number };

export type SubmitForApprovalModalResult =
  | { kind: "route"; routeId: number }
  | { kind: "chain"; approverEmployeeIds: number[] };

export type SubmitForApprovalModalProps = {
  open: boolean;
  documentId: string | null;
  documentType: string;
  /** Для платформенного админа — компания документа (для загрузки сотрудников и маршрутов). */
  companyId: number | null;
  isPlatformAdmin: boolean;
  submitLoading: boolean;
  onClose: () => void;
  onSubmit: (result: SubmitForApprovalModalResult) => void | Promise<void>;
};

function routesForDocumentType(routes: RouteRow[], documentType: string): RouteRow[] {
  return routes.filter((r) => !r.documentType || r.documentType === documentType);
}

export function SubmitForApprovalModal(props: SubmitForApprovalModalProps) {
  const { open, documentId, documentType, companyId, isPlatformAdmin, submitLoading, onClose, onSubmit } = props;
  const [phase, setPhase] = useState<"configure" | "review">("configure");
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [submitMode, setSubmitMode] = useState<"route" | "manual">("manual");
  const [selectedRouteId, setSelectedRouteId] = useState<number | undefined>(undefined);
  const [form] = Form.useForm<{ steps: StepRow[] }>();

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ["submit-approval-routes", isPlatformAdmin ? companyId : "tenant"],
    queryFn: () =>
      isPlatformAdmin && companyId != null ? adminApi.listRoutes(companyId) : documentsApi.listCompanyRoutes(),
    enabled: open && (isPlatformAdmin ? companyId != null : true)
  });

  const matchedRoutes = useMemo(() => routesForDocumentType(routes, documentType), [routes, documentType]);

  useEffect(() => {
    if (!open) {
      setPhase("configure");
      setSavedIds([]);
      setSubmitMode("manual");
      setSelectedRouteId(undefined);
      form.resetFields();
      return;
    }
    setPhase("configure");
    setSavedIds([]);
    form.setFieldsValue({ steps: [{}] });
  }, [open, documentId, form]);

  useEffect(() => {
    if (!open) return;
    if (matchedRoutes.length > 0) {
      setSubmitMode("route");
      setSelectedRouteId(matchedRoutes[0]!.id);
    } else {
      setSubmitMode("manual");
      setSelectedRouteId(undefined);
    }
  }, [open, matchedRoutes]);

  const listParamsCompanyId = isPlatformAdmin ? companyId ?? undefined : undefined;
  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ["company-employees", listParamsCompanyId ?? "self"],
    queryFn: () => documentsApi.listCompanyEmployees(listParamsCompanyId),
    enabled: open && (isPlatformAdmin ? companyId != null : true)
  });

  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const options = employees.map((e) => ({
    value: e.id,
    label: `${e.position} — ${e.fullName}`
  }));

  const routeOptions = matchedRoutes.map((r) => ({
    value: r.id,
    label: r.documentType ? `${r.name} (${r.documentType})` : r.name
  }));

  const selectedRoute = matchedRoutes.find((r) => r.id === selectedRouteId);

  const handleContinue = async () => {
    if (submitMode === "route") {
      if (selectedRouteId == null) {
        message.error("Выберите маршрут");
        return;
      }
      setPhase("review");
      return;
    }
    try {
      const vals = await form.validateFields();
      const steps = vals.steps ?? [];
      const ids = steps.map((s) => s?.employeeId).filter((id): id is number => typeof id === "number" && id > 0);
      if (!ids.length) {
        message.error("Добавьте хотя бы одного согласующего");
        return;
      }
      setSavedIds(ids);
      setPhase("review");
    } catch {
      /* validateFields */
    }
  };

  const previewLines = savedIds.map((id, i) => {
    const e = byId.get(id);
    const pos = e?.position?.trim() ? e.position : "Сотрудник";
    const name = e?.fullName ?? `№${id}`;
    return `${i + 1}. ${pos} — ${name}`;
  });

  const routePreviewLines =
    selectedRoute?.steps?.map((s, i) => `${i + 1}. ${s.assigneeSummary ?? "—"}`) ?? [];

  return (
    <Modal title={`Отправка на согласование — ${documentType}`} open={open} onCancel={onClose} footer={null} destroyOnHidden width={640}>
      {phase === "configure" ? (
        <>
          {matchedRoutes.length > 0 ? (
            <Segmented
              block
              value={submitMode}
              onChange={(v) => setSubmitMode(v as "route" | "manual")}
              options={[
                { label: "Сохранённый маршрут", value: "route" },
                { label: "Цепочка вручную", value: "manual" }
              ]}
              style={{ marginBottom: 16 }}
            />
          ) : null}

          {submitMode === "route" ? (
            <>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Выберите маршрут"
                loading={routesLoading}
                value={selectedRouteId}
                onChange={(v) => setSelectedRouteId(v)}
                options={routeOptions}
                style={{ width: "100%", marginBottom: 16 }}
              />
            </>
          ) : (
            <>
              <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
                Цепочка согласующих
              </Typography.Text>
              <Form form={form} layout="vertical">
                <Form.List name="steps">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field, index) => (
                        <Space key={field.key} align="baseline" style={{ display: "flex", marginBottom: 8 }} wrap>
                          <Typography.Text style={{ minWidth: 22 }}>{index + 1}.</Typography.Text>
                          <Form.Item
                            name={[field.name, "employeeId"]}
                            rules={[{ required: true, message: "Выберите сотрудника" }]}
                            style={{ marginBottom: 0, flex: 1, minWidth: 220 }}
                          >
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder="Согласующий"
                              loading={employeesLoading}
                              options={options}
                            />
                          </Form.Item>
                          {fields.length > 1 ? (
                            <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Удалить шаг ${index + 1}`} onClick={() => remove(field.name)} />
                          ) : null}
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add({})} icon={<PlusOutlined />} block style={{ marginBottom: 16 }}>
                        Добавить шаг
                      </Button>
                    </>
                  )}
                </Form.List>
              </Form>
            </>
          )}

          <Space wrap>
            <Button type="primary" onClick={() => void handleContinue()}>
              Далее
            </Button>
            <Button onClick={onClose}>Закрыть</Button>
          </Space>
        </>
      ) : (
        <>
          <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
            Проверьте перед отправкой
          </Typography.Text>
          {submitMode === "route" && selectedRoute ? (
            <>
              <Typography.Paragraph style={{ marginBottom: 8 }}>{selectedRoute.name}</Typography.Paragraph>
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 16 }}>
                {routePreviewLines.join("\n")}
              </Typography.Paragraph>
            </>
          ) : (
            <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 16 }}>{previewLines.join("\n")}</Typography.Paragraph>
          )}
          <Space wrap>
            <Button
              type="primary"
              loading={submitLoading}
              disabled={!documentId}
              onClick={() => {
                if (!documentId) return;
                if (submitMode === "route" && selectedRouteId != null) {
                  void onSubmit({ kind: "route", routeId: selectedRouteId });
                } else if (submitMode === "manual" && savedIds.length) {
                  void onSubmit({ kind: "chain", approverEmployeeIds: savedIds });
                }
              }}
            >
              Отправить на согласование
            </Button>
            <Button onClick={() => setPhase("configure")}>Назад</Button>
            <Button onClick={onClose}>Закрыть</Button>
          </Space>
        </>
      )}
    </Modal>
  );
}
