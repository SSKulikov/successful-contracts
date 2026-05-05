import { DownloadOutlined, MoreOutlined, PaperClipOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, DatePicker, Dropdown, Form, Grid, Input, InputNumber, Modal, Progress, Select, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ResizeCallbackData } from "react-resizable";
import type { MenuProps } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MockApiBanner } from "../shared/components/MockApiBanner";
import { AppEmptyState } from "../shared/components/AppEmptyState";
import { PageHeader } from "../shared/components/PageHeader";
import { StatusTag } from "../shared/components/StatusTag";
import { StatusLegend } from "../shared/components/StatusLegend";
import { ResizableHeaderCell } from "../shared/components/ResizableHeaderCell";
import { formatDateTime, formatMoney } from "../shared/utils/format";
import { confirmDangerAction } from "../shared/utils/confirm-actions";
import { ApiErrorState } from "../shared/components/ApiErrorState";
import {
  SubmitForApprovalModal,
  type SubmitForApprovalModalResult
} from "../shared/components/SubmitForApprovalModal";
import { getApiErrorMessage } from "../shared/utils/api-error";
import {
  adminApi,
  contractsApi,
  DocumentFormPayload,
  DocumentRow,
  documentsApi,
  getStoredUserProfile,
  isPlatformAdminUser,
  type ListMyDocumentsParams,
  type SubmitForApprovalPayload
} from "../shared/api";
import { DOCUMENT_TYPE_SELECT_OPTIONS } from "../shared/documentTypes";
import { MyDocumentsStatusSummary } from "./MyDocumentsStatusSummary";

function normalizeDetectedDocumentType(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  const normalized = lower.replace(/ё/g, "е");
  const hasInvoiceFacture =
    normalized.includes("счет-фактур") || /счет\w*\s+фактур/.test(normalized);
  const hasInvoicePayment =
    /счет\s*(на)?\s*оплат/.test(normalized) || normalized.includes("инвойс");
  const hasUniversalTransferDocPhrase =
    /универсальн\w*[\s.,:;/-]*передаточн\w*[\s.,:;/-]*документ/.test(normalized) ||
    (normalized.includes("универсальн") &&
      normalized.includes("передаточн") &&
      normalized.includes("документ"));
  const hasUpD =
    normalized.includes("упд") ||
    hasUniversalTransferDocPhrase ||
    (hasInvoiceFacture && normalized.includes("накладн")) ||
    /\bстатус\s*[:\-]?\s*[12]\b/.test(normalized);
  const hasInvoice = hasInvoiceFacture || hasInvoicePayment;
  const hasNakladn =
    /товарн\w*\s+накладн/.test(normalized) ||
    /\bторг[\s-]*12\b/.test(normalized) ||
    (normalized.includes("накладн") && !hasUpD && !hasInvoice);
  const hasAct =
    /акт\w*\s+(выполненн\w*\s+работ|оказанн\w*\s+услуг|прием\w*)/.test(normalized) ||
    normalized.includes("акт");
  const hasContract =
    /(?:^|\n|\s)договор(?:\s|$|№|n)/.test(normalized) ||
    /договор\w*\s*(поставк|оказан|подряд|аренд|купли[-\s]*продаж)/.test(normalized);

  if (hasUpD) {
    return "УПД";
  }
  if (hasInvoice) {
    return "Счет на оплату";
  }
  if (hasNakladn) {
    return "Накладная";
  }
  if (hasAct) {
    return "Акт";
  }
  if (hasContract && !hasInvoice && !hasNakladn) return "Договор";
  return undefined;
}

export function MyDocumentsPage() {
  const COLUMN_WIDTHS_STORAGE_KEY = "my-documents-column-widths";
  const VIEWED_KEY = "viewed-documents";
  const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    id: 92,
    type: 118,
    title: 148,
    initiator: 168,
    amount: 132,
    createdAt: 156,
    status: 146,
    actions: 320
  };
  const COLUMN_WIDTH_LIMITS: Record<string, { min: number; max: number }> = {
    id: { min: 80, max: 130 },
    type: { min: 100, max: 170 },
    title: { min: 110, max: 190 },
    initiator: { min: 140, max: 220 },
    amount: { min: 120, max: 180 },
    createdAt: { min: 140, max: 220 },
    status: { min: 130, max: 190 },
    actions: { min: 220, max: 420 }
  };
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createDocumentButtonRef = useRef<HTMLButtonElement | null>(null);
  const [form] = Form.useForm<DocumentFormPayload>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [parsingProgress, setParsingProgress] = useState(0);
  const [parsedSourceFile, setParsedSourceFile] = useState<File | null>(null);
  const [submitRouteModalOpen, setSubmitRouteModalOpen] = useState(false);
  const [submitDocumentId, setSubmitDocumentId] = useState<string | null>(null);
  const [submitAfterSave, setSubmitAfterSave] = useState(false);
  const [attachmentsPickerOpen, setAttachmentsPickerOpen] = useState(false);
  const [attachmentsPickerDocumentId, setAttachmentsPickerDocumentId] = useState<string | null>(null);
  const [selectedAttachmentUrl, setSelectedAttachmentUrl] = useState<string | null>(null);
  const [viewedDocIds, setViewedDocIds] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);

  const normalizeColumnWidths = (incoming: Record<string, number>) =>
    Object.entries(DEFAULT_COLUMN_WIDTHS).reduce<Record<string, number>>((acc, [key, fallback]) => {
      const raw = Number(incoming[key]);
      const limits = COLUMN_WIDTH_LIMITS[key];
      if (!Number.isFinite(raw)) {
        acc[key] = fallback;
        return acc;
      }
      acc[key] = Math.min(limits.max, Math.max(limits.min, Math.round(raw)));
      return acc;
    }, {});

  const me = getStoredUserProfile();
  const isPlatformAdmin = Boolean(me && isPlatformAdminUser(me));
  const isEmployee = Boolean(me && !isPlatformAdminUser(me));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWED_KEY);
      setViewedDocIds(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setViewedDocIds([]);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      setColumnWidths((prev) => ({ ...prev, ...normalizeColumnWidths(parsed) }));
    } catch {
      /* ignore parse errors */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch {
      /* ignore quota errors */
    }
  }, [columnWidths]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (isModalOpen) return;
    createDocumentButtonRef.current?.focus();
  }, [isModalOpen]);

  const { data: companies = [] } = useQuery({
    queryKey: ["admin", "companies"],
    queryFn: adminApi.listCompanies,
    enabled: isPlatformAdmin
  });

  const mutationError = (error: unknown) => message.error(getApiErrorMessage(error));

  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-documents", { search: debouncedSearch, statusFilter, typeFilter, dateFrom, dateTo }],
    queryFn: () =>
      documentsApi.listMyDocuments({
        q: debouncedSearch || undefined,
        status: statusFilter as DocumentRow["status"] | undefined,
        type: typeFilter,
        dateFrom,
        dateTo
      })
  });

  const {
    data: statusStats,
    isLoading: statusStatsLoading,
    isError: statusStatsError
  } = useQuery({
    queryKey: ["my-documents", "stats"],
    queryFn: () => documentsApi.getMyDocumentsStatusStats()
  });
  const saveDocumentMutation = useMutation({
    mutationFn: async (payload: DocumentFormPayload) => {
      if (editingDocumentId) {
        return documentsApi.updateDocument(editingDocumentId, payload);
      }
      return documentsApi.createDocument(payload);
    },
    onSuccess: (response: { id?: string } | undefined) => {
      message.success(editingDocumentId ? "Документ обновлен" : "Документ создан");
      setIsModalOpen(false);
      setEditingDocumentId(null);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      if (!editingDocumentId && response?.id && parsedSourceFile) {
        void documentsApi
          .uploadDocumentAttachment(response.id, parsedSourceFile)
          .then(() => {
            message.success("Исходный загруженный файл автоматически прикреплен к документу");
          })
          .catch(() => {
            message.warning("Документ создан, но исходный файл не удалось прикрепить автоматически");
          });
      }
      setParsedSourceFile(null);
      if (!editingDocumentId && submitAfterSave && response?.id) {
        setSubmitDocumentId(response.id);
        setSubmitRouteModalOpen(true);
      }
      setSubmitAfterSave(false);
    },
    onError: mutationError
  });
  const submitMutation = useMutation({
    mutationFn: ({ documentId, ...payload }: { documentId: string } & SubmitForApprovalPayload) =>
      documentsApi.submitForApproval(documentId, payload),
    onSuccess: () => {
      message.success("Документ отправлен на согласование");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    },
    onError: mutationError
  });
  const resubmitMutation = useMutation({
    mutationFn: documentsApi.resubmitForApproval,
    onSuccess: () => {
      message.success("Документ повторно отправлен на согласование");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    },
    onError: mutationError
  });
  const buildListQueryParams = (): ListMyDocumentsParams => ({
    q: debouncedSearch || undefined,
    status: statusFilter as DocumentRow["status"] | undefined,
    type: typeFilter,
    dateFrom,
    dateTo
  });

  const exportMutation = useMutation({
    mutationFn: (params: ListMyDocumentsParams) => documentsApi.exportMyDocuments(params),
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "my-documents.xlsx";
      link.style.display = "none";
      document.body.appendChild(link);
      window.setTimeout(() => {
        link.click();
        window.setTimeout(() => {
          link.remove();
          window.URL.revokeObjectURL(url);
        }, 0);
      }, 0);
      message.success("Экспорт подготовлен");
    },
    onError: mutationError
  });
  const withdrawMutation = useMutation({
    mutationFn: documentsApi.withdrawFromApproval,
    onSuccess: () => {
      message.success("Документ отозван с согласования");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
    },
    onError: mutationError
  });
  const deleteMutation = useMutation({
    mutationFn: documentsApi.deleteDocument,
    onSuccess: () => {
      message.success("Документ удален");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
    },
    onError: mutationError
  });
  const {
    data: pickedAttachments = [],
    isLoading: isLoadingPickedAttachments
  } = useQuery({
    queryKey: ["document-attachments", attachmentsPickerDocumentId],
    queryFn: () => documentsApi.listDocumentAttachments(attachmentsPickerDocumentId!),
    enabled: attachmentsPickerOpen && Boolean(attachmentsPickerDocumentId)
  });
  const openAttachmentsPicker = (documentId: string) => {
    setAttachmentsPickerDocumentId(documentId);
    setSelectedAttachmentUrl(null);
    setAttachmentsPickerOpen(true);
  };


  const watchedCompanyId = Form.useWatch("companyId", form);

  useEffect(() => {
    if (!isModalOpen || editingDocumentId) return;
    if (!isPlatformAdmin) return;
    if (watchedCompanyId == null) return;
    const company = companies.find((c) => Number(c.key) === Number(watchedCompanyId));
    if (company?.inn) {
      form.setFieldsValue({ customerInn: company.inn });
    }
  }, [isModalOpen, editingDocumentId, isPlatformAdmin, watchedCompanyId, companies, form]);

  const openCreateModal = () => {
    setEditingDocumentId(null);
    form.resetFields();
    setParsedSourceFile(null);
    if (!isPlatformAdmin && me?.companyInn) {
      form.setFieldsValue({ customerInn: me.companyInn });
    }
    setIsModalOpen(true);
  };

  const openSubmitRouteModal = (documentId: string) => {
    const row = data.find((r) => r.id === documentId);
    if (isPlatformAdmin && row?.companyId == null) {
      message.error("У документа не указана компания. Создайте документ заново и выберите компанию в форме.");
      return;
    }
    setSubmitDocumentId(documentId);
    setSubmitRouteModalOpen(true);
  };

  const handleSubmitForApproval = async (result: SubmitForApprovalModalResult) => {
    if (!submitDocumentId) return;
    if (result.kind === "route") {
      await submitMutation.mutateAsync({ documentId: submitDocumentId, routeId: result.routeId });
    } else {
      await submitMutation.mutateAsync({ documentId: submitDocumentId, approverEmployeeIds: result.approverEmployeeIds });
    }
    setSubmitRouteModalOpen(false);
    setSubmitDocumentId(null);
  };

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter(undefined);
    setTypeFilter(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
  };
  const hasActiveListFilters = Boolean(
    search.trim() || statusFilter || typeFilter || dateFrom || dateTo
  );
  const sortedData = useMemo(() => {
    if (!search.trim()) return data;
    return [...data].sort((left, right) =>
      left.id.localeCompare(right.id, "ru", { numeric: true, sensitivity: "base" })
    );
  }, [data, search]);

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };
  const markViewed = (docId: string) => {
    setViewedDocIds((prev) => {
      if (prev.includes(docId)) return prev;
      const next = [...prev, docId];
      localStorage.setItem(VIEWED_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/webp"
    ]);
    const okByMime = allowedTypes.has(file.type);
    const okByExt = /\.(pdf|doc|docx|jpe?g|png|webp)$/i.test(file.name);
    if (!okByMime && !okByExt) {
      message.error("Допустимы PDF, Word (.doc, .docx) и изображения JPG, PNG, WebP");
      event.target.value = "";
      return;
    }

    setIsParsingFile(true);
    setParsingProgress(8);
    const progressTimer = window.setInterval(() => {
      setParsingProgress((prev) => {
        if (prev >= 92) return prev;
        const step = prev < 40 ? 8 : prev < 70 ? 5 : 2;
        return Math.min(92, prev + step);
      });
    }, 180);
    try {
      const response = await contractsApi.parseFile(file);
      const parsed = response?.parsedJson ?? {};
      const parsedAmount = Number(String(parsed?.contract_sum ?? "").replace(",", ".").replace(/\s+/g, ""));

      const detectedTypeRaw =
        parsed?.document_type ??
        parsed?.doc_type ??
        parsed?.type ??
        parsed?.contract_type;
      const inferredType = normalizeDetectedDocumentType(detectedTypeRaw);
      setParsedSourceFile(file);
      form.setFieldsValue({
        type: inferredType ?? form.getFieldValue("type"),
        number: parsed?.contract_number ?? form.getFieldValue("number"),
        date: parsed?.contract_date ?? form.getFieldValue("date"),
        customerName: parsed?.customer?.name ?? parsed?.payer?.name ?? form.getFieldValue("customerName"),
        customerInn: parsed?.customer?.inn ?? form.getFieldValue("customerInn"),
        executorName: parsed?.supplier?.name ?? form.getFieldValue("executorName"),
        executorInn: parsed?.supplier?.inn ?? form.getFieldValue("executorInn"),
        amount: Number.isNaN(parsedAmount) ? form.getFieldValue("amount") : parsedAmount,
        subject: parsed?.contract_subject ?? parsed?.item ?? form.getFieldValue("subject")
      });

      message.success("Файл распознан, поля формы автозаполнены");
      setParsingProgress(100);
    } catch {
      message.error("Не удалось распознать файл");
    } finally {
      window.clearInterval(progressTimer);
      window.setTimeout(() => {
        setIsParsingFile(false);
        setParsingProgress(0);
      }, 350);
      event.target.value = "";
    }
  };

  const openEditModal = async (row: DocumentRow) => {
    try {
      const details = await documentsApi.openDocument(row.id);
      setEditingDocumentId(row.id);
      form.setFieldsValue({
        companyId: details.companyId ?? undefined,
        type: details.type,
        number: details.fields?.number ?? "",
        date: details.fields?.date ?? "",
        customerName: details.fields?.customerName ?? "",
        customerInn: details.fields?.customerInn ?? "",
        executorName: details.fields?.executorName ?? "",
        executorInn: details.fields?.executorInn ?? "",
        amount: Number(String(details.amount).replace(",", ".")) || 0,
        subject: details.fields?.subject ?? "",
        note: details.fields?.note ?? ""
      });
      setIsModalOpen(true);
    } catch (err) {
      message.error(getApiErrorMessage(err, "Не удалось загрузить документ для редактирования"));
    }
  };

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || isLoading) return;
    const row = data.find((item) => item.id === editId);
    if (!row) return;
    void openEditModal(row);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("edit");
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, data, isLoading]);

  const handleModalOk = async () => {
    const values = await form.validateFields();
    if (editingDocumentId) {
      const { companyId: _omitCompany, ...rest } = values;
      await saveDocumentMutation.mutateAsync(rest);
    } else {
      await saveDocumentMutation.mutateAsync(values);
    }
  };

  const sortByText = (a: string | undefined, b: string | undefined) => String(a ?? "").localeCompare(String(b ?? ""), "ru");
  const sortByAmount = (a: string, b: string) => {
    const left = Number(String(a).replace(",", ".").replace(/[^\d.-]/g, ""));
    const right = Number(String(b).replace(",", ".").replace(/[^\d.-]/g, ""));
    return (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right);
  };
  const sortByDate = (a: string | undefined, b: string | undefined) => new Date(String(a ?? "")).getTime() - new Date(String(b ?? "")).getTime();
  const extractDocumentNumber = (title: string | undefined) => {
    const source = String(title ?? "").trim();
    if (!source) return "";
    const byNoSign = source.match(/(?:№|#|no\.?|n)\s*([a-zа-я0-9\-\/]+)/i);
    if (byNoSign?.[1]) return byNoSign[1].trim();
    const trailingToken = source.match(/([a-zа-я0-9\-\/]+)\s*$/i);
    return trailingToken?.[1]?.trim() ?? source;
  };

  const handleResize =
    (key: string) =>
    (_event: SyntheticEvent<Element>, { size }: ResizeCallbackData) => {
      const minWidth = key === "actions" ? 220 : 90;
      setColumnWidths((prev) => ({ ...prev, [key]: Math.max(minWidth, Math.round(size.width)) }));
    };

  const columns: ColumnsType<DocumentRow> = [
    {
      title: "",
      dataIndex: "id",
      key: "attach",
      width: 48,
      render: (_: unknown, row: DocumentRow) => (
        <Button
          type="text"
          icon={<PaperClipOutlined />}
          aria-label={`Открыть вложения документа ${row.id}`}
          onClick={() => openAttachmentsPicker(row.id)}
        />
      )
    },
    { title: "ID", dataIndex: "id", key: "id", width: columnWidths.id, sorter: (a: DocumentRow, b: DocumentRow) => sortByText(a.id, b.id) },
    {
      title: "Тип",
      dataIndex: "type",
      key: "type",
      width: columnWidths.type,
      sorter: (a: DocumentRow, b: DocumentRow) => sortByText(a.type, b.type)
    },
    {
      title: "Номер",
      dataIndex: "title",
      key: "title",
      width: columnWidths.title,
      ellipsis: true,
      render: (value: string) => {
        const number = extractDocumentNumber(value);
        return <Typography.Text ellipsis={{ tooltip: number }}>{number}</Typography.Text>;
      },
      sorter: (a: DocumentRow, b: DocumentRow) =>
        sortByText(extractDocumentNumber(a.title), extractDocumentNumber(b.title))
    },
    {
      title: "Заказчик",
      dataIndex: "initiator",
      key: "initiator",
      width: columnWidths.initiator,
      ellipsis: true,
      render: (value: string) => <Typography.Text ellipsis={{ tooltip: value }}>{value}</Typography.Text>,
      sorter: (a: DocumentRow, b: DocumentRow) => sortByText(a.initiator, b.initiator)
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      key: "amount",
      width: columnWidths.amount,
      sorter: (a: DocumentRow, b: DocumentRow) => sortByAmount(a.amount, b.amount),
      render: (value: string) => formatMoney(value)
    },
    {
      title: "Создан",
      dataIndex: "createdAt",
      key: "createdAt",
      width: columnWidths.createdAt,
      sorter: (a: DocumentRow, b: DocumentRow) => sortByDate(a.createdAt, b.createdAt),
      render: (value?: string) => formatDateTime(value)
    },
    {
      title: "Статус",
      dataIndex: "status",
      key: "status",
      width: columnWidths.status,
      sorter: (a: DocumentRow, b: DocumentRow) => sortByText(a.status, b.status),
      render: (value: DocumentRow["status"]) => <StatusTag status={value} />
    },
    {
      title: "Действия",
      key: "actions",
      width: isMobile ? 88 : columnWidths.actions,
      render: (_: unknown, row: DocumentRow) => {
        const confirmDelete = () =>
          confirmDangerAction({
            title: "Удалить документ?",
            content: "Документ будет удален без возможности восстановления.",
            okText: "Удалить",
            onOk: () => deleteMutation.mutateAsync(row.id)
          });

        const confirmWithdraw = () =>
          Modal.confirm({
            title: "Отозвать документ с согласования?",
            content: "После отзыва документ вернется в статус 'Загружен'.",
            okText: "Отозвать",
            cancelText: "Отмена",
            onOk: () => withdrawMutation.mutateAsync(row.id)
          });

        if (!isMobile) {
          return (
            <Space wrap size={[4, 4]} className="table-actions-cell">
              <Button type="link" onClick={() => { markViewed(row.id); navigate(`/documents/${row.id}`); }}>
                Открыть
              </Button>
              {row.status === "Загружен" || row.status === "На доработке" ? (
                <>
                  <Button type="link" onClick={() => void openEditModal(row)}>
                    Редактировать
                  </Button>
                  {row.status === "На доработке" ? (
                    <Button
                      type="link"
                      loading={resubmitMutation.isPending && resubmitMutation.variables === row.id}
                      onClick={() => resubmitMutation.mutate(row.id)}
                    >
                      Повторно отправить
                    </Button>
                  ) : (
                    <Button type="link" loading={submitMutation.isPending} onClick={() => void openSubmitRouteModal(row.id)}>
                      Отправить
                    </Button>
                  )}
                  <Button
                    type="link"
                    danger
                    loading={deleteMutation.isPending && deleteMutation.variables === row.id}
                    onClick={confirmDelete}
                  >
                    Удалить
                  </Button>
                </>
              ) : null}
              {row.status === "На согласовании" ? (
                <Button
                  type="link"
                  loading={withdrawMutation.isPending && withdrawMutation.variables === row.id}
                  onClick={confirmWithdraw}
                >
                  Отозвать
                </Button>
              ) : null}
            </Space>
          );
        }

        const items: MenuProps["items"] = [
          { key: "open", label: "Открыть", onClick: () => { markViewed(row.id); navigate(`/documents/${row.id}`); } }
        ];
        if (row.status === "Загружен" || row.status === "На доработке") {
          items.push(
            { key: "edit", label: "Редактировать", onClick: () => void openEditModal(row) },
            row.status === "На доработке"
              ? {
                  key: "resubmit",
                  label: "Повторно отправить",
                  disabled: resubmitMutation.isPending,
                  onClick: () => resubmitMutation.mutate(row.id)
                }
              : {
                  key: "submit",
                  label: "Отправить",
                  disabled: submitMutation.isPending,
                  onClick: () => void openSubmitRouteModal(row.id)
                },
            {
              key: "delete",
              label: "Удалить",
              danger: true,
              disabled: deleteMutation.isPending,
              onClick: confirmDelete
            }
          );
        }
        if (row.status === "На согласовании") {
          items.push({
            key: "withdraw",
            label: "Отозвать",
            disabled: withdrawMutation.isPending,
            onClick: confirmWithdraw
          });
        }
        return (
          <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
            <Button icon={<MoreOutlined />} aria-label={`Действия для документа ${row.id}`} />
          </Dropdown>
        );
      }
    }
  ].map((column) => ({
    ...column,
    onHeaderCell: () => ({
      width: Number(column.width),
      onResize: handleResize(String(column.key))
    })
  }));

  return (
    <div className="page-shell">
      <PageHeader
        title="Мои документы"
        subtitle="Создавайте, фильтруйте и отправляйте документы на согласование."
      />

      <MyDocumentsStatusSummary stats={statusStats} loading={statusStatsLoading} isError={statusStatsError} />
      <StatusLegend />

      <MockApiBanner />
      {isError ? (
        <ApiErrorState
          title="Не удалось загрузить список"
          description={getApiErrorMessage(error)}
          onRetry={() => void refetch()}
          fallbackText="Перейти в админ-панель"
          onFallback={() => navigate("/admin-panel")}
        />
      ) : null}

      <Card>
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Space wrap className="toolbar-row">
            <Input.Search
              placeholder="Поиск по номеру, контрагенту или ИНН"
              allowClear
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: 320 }}
            />
            <Select
              allowClear
              placeholder="Статус"
              style={{ width: 180 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={[
                { value: "На согласовании", label: "На согласовании" },
                { value: "Загружен", label: "Загружен" },
                { value: "На доработке", label: "На доработке" },
                { value: "Отклонен", label: "Отклонен" },
                { value: "Согласован", label: "Согласован" }
              ]}
            />
            <Select
              allowClear
              placeholder="Тип документа"
              style={{ width: 200 }}
              value={typeFilter}
              onChange={(value) => setTypeFilter(value)}
              options={DOCUMENT_TYPE_SELECT_OPTIONS}
            />
            <DatePicker
              placeholder="Создан с"
              format="YYYY-MM-DD"
              value={dateFrom ? dayjs(dateFrom) : undefined}
              onChange={(value) => setDateFrom(value ? value.format("YYYY-MM-DD") : undefined)}
            />
            <DatePicker
              placeholder="Создан по"
              format="YYYY-MM-DD"
              value={dateTo ? dayjs(dateTo) : undefined}
              onChange={(value) => setDateTo(value ? value.format("YYYY-MM-DD") : undefined)}
            />
            <Button onClick={resetFilters}>Сбросить фильтры</Button>
            <Tooltip
              title={
                data.length === 0 && !isLoading && !isError
                  ? "Нет строк для выгрузки"
                  : "В файл — текущий список в таблице; сортировка колонок только на экране"
              }
            >
              <Button
                icon={<DownloadOutlined />}
                loading={exportMutation.isPending}
                disabled={!isLoading && !isError && data.length === 0}
                onClick={() => exportMutation.mutate(buildListQueryParams())}
              >
                Выгрузить в Excel
              </Button>
            </Tooltip>
            <Button ref={createDocumentButtonRef} type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Создать документ
            </Button>
          </Space>

          {hasActiveListFilters ? (
            <div>
              <Space wrap size={[8, 8]} align="center">
                <Typography.Text type="secondary">Активные условия:</Typography.Text>
                {search.trim() ? (
                  <Tag
                    closable
                    onClose={() => {
                      setSearch("");
                      setDebouncedSearch("");
                    }}
                  >
                    Поиск: «{search.trim()}»
                  </Tag>
                ) : null}
                {statusFilter ? (
                  <Tag closable onClose={() => setStatusFilter(undefined)}>
                    Статус: {statusFilter}
                  </Tag>
                ) : null}
                {typeFilter ? (
                  <Tag closable onClose={() => setTypeFilter(undefined)}>
                    Тип: {typeFilter}
                  </Tag>
                ) : null}
                {dateFrom ? (
                  <Tag closable onClose={() => setDateFrom(undefined)}>
                    Дата создания с: {dateFrom}
                  </Tag>
                ) : null}
                {dateTo ? (
                  <Tag closable onClose={() => setDateTo(undefined)}>
                    Дата создания по: {dateTo}
                  </Tag>
                ) : null}
                <Button type="link" size="small" onClick={resetFilters} style={{ paddingInline: 4 }}>
                  Сбросить всё
                </Button>
              </Space>
            </div>
          ) : null}

          <Table
            className="app-table"
            rowKey="id"
            components={{
              header: {
                cell: ResizableHeaderCell
              }
            }}
            columns={columns}
            dataSource={sortedData}
            loading={isLoading}
            size="small"
            tableLayout="fixed"
            scroll={{ x: 1380 }}
            pagination={{ pageSize: 8 }}
            rowClassName={(record) => (!viewedDocIds.includes(record.id) ? "doc-row-unread" : "")}
            locale={{
              emptyText: (
                <AppEmptyState
                  description="Нет документов"
                  actionText="Создать первый документ"
                  onAction={openCreateModal}
                  extra={
                    <Space>
                      {hasActiveListFilters ? <Button onClick={resetFilters}>Сбросить фильтры</Button> : null}
                      {isPlatformAdmin ? <Button onClick={() => navigate("/admin-panel")}>Перейти в админ-панель</Button> : null}
                      {isEmployee ? <Button onClick={() => navigate("/my-approvals")}>Открыть мои согласования</Button> : null}
                    </Space>
                  }
                />
              )
            }}
          />
        </Space>
      </Card>
      <SubmitForApprovalModal
        open={submitRouteModalOpen}
        documentId={submitDocumentId}
        documentType={data.find((r) => r.id === submitDocumentId)?.type ?? "—"}
        companyId={data.find((r) => r.id === submitDocumentId)?.companyId ?? me?.companyId ?? null}
        isPlatformAdmin={isPlatformAdmin}
        submitLoading={submitMutation.isPending}
        onClose={() => {
          setSubmitRouteModalOpen(false);
          setSubmitDocumentId(null);
        }}
        onSubmit={handleSubmitForApproval}
      />
      <Modal
        title="Открыть прикрепленный документ"
        open={attachmentsPickerOpen}
        onCancel={() => setAttachmentsPickerOpen(false)}
        onOk={() => {
          if (selectedAttachmentUrl) window.open(selectedAttachmentUrl, "_blank", "noopener,noreferrer");
        }}
        okButtonProps={{ disabled: !selectedAttachmentUrl }}
        okText="Открыть"
        cancelText="Отмена"
      >
        <Select
          style={{ width: "100%" }}
          loading={isLoadingPickedAttachments}
          placeholder="Выберите файл"
          value={selectedAttachmentUrl ?? undefined}
          onChange={(value) => setSelectedAttachmentUrl(value)}
          options={pickedAttachments.map((item) => ({
            value: item.url,
            label: `${item.originalName} (${item.uploadedAt})`
          }))}
        />
      </Modal>
      <Modal
        title={editingDocumentId ? "Редактировать документ" : "Создать документ"}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={saveDocumentMutation.isPending}
        cancelText="Отмена"
        width={760}
      >
        <Space style={{ marginBottom: 12 }}>
          <Button onClick={handlePickFile} disabled={isParsingFile}>
            Загрузить PDF/DOCX для автозаполнения
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp"
          />
        </Space>
        {isParsingFile ? (
          <div style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
              Идет загрузка и распознавание документа...
            </Typography.Text>
            <Progress
              percent={parsingProgress}
              showInfo={false}
              strokeColor={{ from: "#73d13d", to: "#389e0d" }}
              trailColor="#f0f5f0"
              status="active"
            />
          </div>
        ) : null}
        <Form form={form} layout="vertical">
          {isPlatformAdmin ? (
            <Form.Item
              name="companyId"
              label="Компания (владелец документа)"
              rules={[{ required: true, message: "Выберите компанию" }]}
              extra="Маршруты согласования настраиваются в админ-панели для этой компании. После создания документа компанию сменить нельзя."
            >
              <Select
                placeholder="Выберите компанию"
                disabled={Boolean(editingDocumentId)}
                options={companies.map((c) => ({
                  value: Number(c.key),
                  label: `${c.companyName} (ИНН ${c.inn})`
                }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          ) : null}
          <Form.Item name="type" label="Тип документа" rules={[{ required: true, message: "Укажите тип документа" }]}>
            <Select options={DOCUMENT_TYPE_SELECT_OPTIONS} placeholder="Выберите тип" />
          </Form.Item>
          <Form.Item name="number" label="Номер" rules={[{ required: true, message: "Укажите номер" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="date" label="Дата" rules={[{ required: true, message: "Укажите дату (YYYY-MM-DD)" }]}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="customerName" label="Заказчик/Плательщик" rules={[{ required: true, message: "Укажите заказчика или плательщика" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="customerInn" label="ИНН заказчика" rules={[{ required: true, message: "Укажите ИНН заказчика" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="executorName" label="Наименование исполнителя" rules={[{ required: true, message: "Укажите исполнителя" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="executorInn" label="ИНН исполнителя" rules={[{ required: true, message: "Укажите ИНН исполнителя" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amount" label="Сумма" rules={[{ required: true, message: "Укажите сумму" }]}>
            <InputNumber<number>
              min={0}
              style={{ width: "100%" }}
              formatter={(value) => {
                const numeric = String(value ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
                if (!numeric) return "";
                const amount = Number(numeric);
                if (Number.isNaN(amount)) return "";
                return `${new Intl.NumberFormat("ru-RU", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2
                }).format(amount)} ₽`;
              }}
              parser={(value) => {
                const normalized = String(value ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
                const amount = Number(normalized);
                return Number.isNaN(amount) ? 0 : amount;
              }}
            />
          </Form.Item>
          <Form.Item name="subject" label="Основание / предмет" rules={[{ required: true, message: "Укажите предмет документа" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
        {!editingDocumentId ? (
          <Button
            style={{ marginTop: 12 }}
            type="primary"
            ghost
            onClick={async () => {
              const values = await form.validateFields();
              setSubmitAfterSave(true);
              await saveDocumentMutation.mutateAsync(values);
            }}
          >
            Отправить на согласование
          </Button>
        ) : null}
      </Modal>
    </div>
  );
}
