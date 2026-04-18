import { LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Button, Card, Form, Input, Space, Typography, Upload, message } from "antd";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  USER_ROLE_STORAGE_KEY,
  PASSWORD_CHANGE_REQUIRED_CLIENT_EVENT,
  PROFILE_PASSWORD_REQUIRED_QUERY,
  UserProfile,
  getStoredUserProfile,
  profileApi
} from "../shared/api";
import { getApiErrorMessage } from "../shared/utils/api-error";

const PASSWORD_GATE_HINT = "Сначала смените пароль.";

function scrollToPasswordSection() {
  const el = document.getElementById("profile-password-section");
  if (el) {
    window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

export function ProfilePage() {
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const storedUserRaw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
  const storedUser = storedUserRaw ? (JSON.parse(storedUserRaw) as UserProfile | null) : null;
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: profileApi.getMyProfile,
    enabled: Boolean(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY))
  });
  const updateProfileMutation = useMutation({
    mutationFn: profileApi.updateMyProfile,
    onSuccess: (updatedProfile) => {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(updatedProfile));
      if (updatedProfile.role) {
        localStorage.setItem(USER_ROLE_STORAGE_KEY, updatedProfile.role);
      }
      message.success("Профиль обновлен");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: () => {
      message.error("Не удалось обновить профиль");
    }
  });
  const uploadAvatarMutation = useMutation({
    mutationFn: profileApi.uploadAvatar,
    onSuccess: (updated: UserProfile) => {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(updated));
      queryClient.setQueryData(["my-profile"], updated);
      message.success("Фото профиля обновлено");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (err: unknown) => {
      message.error(getApiErrorMessage(err, "Не удалось загрузить фото"));
    }
  });
  const changePasswordMutation = useMutation({
    mutationFn: profileApi.changeMyPassword,
    onSuccess: async () => {
      message.success("Пароль обновлен");
      passwordForm.resetFields();
      try {
        const updated = await profileApi.getMyProfile();
        localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(updated));
        queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      } catch {
        queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      }
    },
    onError: () => {
      message.error("Не удалось обновить пароль. Проверьте текущий пароль.");
    }
  });

  const currentProfile = profile ?? storedUser ?? null;

  useEffect(() => {
    if (!profile) return;
    try {
      const prev = getStoredUserProfile();
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify({ ...prev, ...profile }));
    } catch {
      /* ignore quota / private mode */
    }
  }, [profile]);

  useEffect(() => {
    if (searchParams.get(PROFILE_PASSWORD_REQUIRED_QUERY) !== "1") {
      return;
    }
    message.warning(PASSWORD_GATE_HINT);
    scrollToPasswordSection();
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const onPasswordGate = () => {
      message.warning(PASSWORD_GATE_HINT);
      scrollToPasswordSection();
    };
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_CLIENT_EVENT, onPasswordGate);
    return () => window.removeEventListener(PASSWORD_CHANGE_REQUIRED_CLIENT_EVENT, onPasswordGate);
  }, []);

  const handleSaveProfile = async () => {
    const values = await profileForm.validateFields();
    await updateProfileMutation.mutateAsync({
      fullName: values.fullName,
      email: values.email
    });
  };

  const handleChangePassword = async () => {
    const values = await passwordForm.validateFields();
    await changePasswordMutation.mutateAsync({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword
    });
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Typography.Title level={3}>Профиль</Typography.Title>

      {currentProfile?.mustChangePassword ? (
        <Alert
          type="warning"
          showIcon
          message="Требуется смена пароля"
          description="Установите новый пароль ниже. До смены изменения документов и согласований недоступны."
        />
      ) : null}

      <Card>
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Space align="center" size={16} wrap>
            <Avatar size={64} src={currentProfile?.avatarUrl || undefined} icon={<UserOutlined />} />
            <div>
              <Typography.Title level={5} style={{ marginBottom: 0 }}>
                {currentProfile?.fullName ?? "Пользователь"}
              </Typography.Title>
              <Typography.Text type="secondary">{currentProfile?.roleLabel ?? "Сотрудник"}</Typography.Text>
              {currentProfile?.companyId != null ? (
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {currentProfile.companyName?.trim()
                    ? `Компания: ${currentProfile.companyName}`
                    : `Компания (ID): ${currentProfile.companyId}`}
                </Typography.Paragraph>
              ) : null}
            </div>
            <Upload
              accept="image/jpeg,image/png,image/webp"
              showUploadList={false}
              beforeUpload={(file) => {
                uploadAvatarMutation.mutate(file);
                return false;
              }}
            >
              <Button loading={uploadAvatarMutation.isPending}>Загрузить фото</Button>
            </Upload>
          </Space>

          <Form
            form={profileForm}
            layout="vertical"
            initialValues={{ fullName: currentProfile?.fullName ?? "", email: currentProfile?.email ?? "" }}
            key={currentProfile?.email}
          >
            <Form.Item label="Имя" name="fullName" rules={[{ required: true, message: "Укажите имя" }]}>
              <Input prefix={<UserOutlined />} placeholder="Ваше имя" />
            </Form.Item>
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: "Укажите email" },
                { type: "email", message: "Введите корректный email" }
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="you@company.ru" />
            </Form.Item>
            <Button type="primary" loading={isLoading || updateProfileMutation.isPending} onClick={handleSaveProfile}>
              Сохранить профиль
            </Button>
          </Form>
        </Space>
      </Card>

      <Card id="profile-password-section" title="Смена пароля">
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            label="Текущий пароль"
            name="currentPassword"
            rules={[{ required: true, message: "Введите текущий пароль" }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Текущий пароль" />
          </Form.Item>
          <Form.Item
            label="Новый пароль"
            name="newPassword"
            rules={[{ required: true, message: "Введите новый пароль" }, { min: 8, message: "Минимум 8 символов" }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Новый пароль" />
          </Form.Item>
          <Form.Item
            label="Подтверждение нового пароля"
            name="confirmPassword"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "Подтвердите новый пароль" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("Пароли не совпадают"));
                }
              })
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Повторите новый пароль" />
          </Form.Item>
          <Button type="primary" loading={changePasswordMutation.isPending} onClick={handleChangePassword}>
            Обновить пароль
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
