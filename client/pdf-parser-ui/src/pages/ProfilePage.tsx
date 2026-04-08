import { LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, Button, Card, Form, Input, Space, Typography, message } from "antd";
import { profileApi } from "../shared/api";

export function ProfilePage() {
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: profileApi.getMyProfile
  });
  const updateProfileMutation = useMutation({
    mutationFn: profileApi.updateMyProfile,
    onSuccess: () => {
      message.success("Профиль обновлен");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    }
  });
  const changePasswordMutation = useMutation({
    mutationFn: profileApi.changeMyPassword,
    onSuccess: () => {
      message.success("Пароль обновлен");
      passwordForm.resetFields();
    }
  });

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
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Typography.Title level={3}>Профиль</Typography.Title>
        <Typography.Paragraph type="secondary">
          Управление учетной записью пользователя. Пока используется демо-режим без API.
        </Typography.Paragraph>
      </div>

      <Card>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space align="center" size={16}>
            <Avatar size={64} icon={<UserOutlined />} />
            <div>
              <Typography.Title level={5} style={{ marginBottom: 0 }}>
                {profile?.fullName ?? "Пользователь"}
              </Typography.Title>
              <Typography.Text type="secondary">{profile?.roleLabel ?? "Сотрудник"}</Typography.Text>
            </div>
          </Space>

          <Form
            form={profileForm}
            layout="vertical"
            initialValues={{ fullName: profile?.fullName ?? "", email: profile?.email ?? "" }}
            key={profile?.email}
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

      <Card title="Смена пароля">
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
