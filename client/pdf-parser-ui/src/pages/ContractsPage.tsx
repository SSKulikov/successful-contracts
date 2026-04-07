import { Button, Card, Form, Input, Upload, Typography } from "antd";
import { InboxOutlined } from "@ant-design/icons";

export function ContractsPage() {
  return (
    <Card>
      <Typography.Title level={3}>Загрузка договоров</Typography.Title>
      <Typography.Paragraph type="secondary">
        Это заглушка раздела договоров. Интеграцию с backend подключим на следующем этапе.
      </Typography.Paragraph>

      <Form layout="vertical">
        <Form.Item label="Файл договора">
          <Upload.Dragger beforeUpload={() => false} multiple={false}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p>Нажмите или перетащите файл в эту область</p>
          </Upload.Dragger>
        </Form.Item>

        <Form.Item label="Комментарий">
          <Input.TextArea rows={4} placeholder="Комментарий к загрузке" />
        </Form.Item>

        <Button type="primary">Отправить</Button>
      </Form>
    </Card>
  );
}
