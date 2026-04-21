import { Input, Modal, message } from "antd";

type ConfirmDangerActionParams = {
  title: string;
  content: string;
  okText: string;
  onOk: () => Promise<unknown>;
};

export function confirmDangerAction({ title, content, okText, onOk }: ConfirmDangerActionParams): void {
  Modal.confirm({
    title,
    content,
    okText,
    okButtonProps: { danger: true },
    cancelText: "Отмена",
    onOk
  });
}

type ConfirmCommentActionParams = {
  title: string;
  placeholder?: string;
  onSubmit: (comment: string) => Promise<unknown>;
};

export function confirmCommentAction({ title, placeholder = "Комментарий обязателен", onSubmit }: ConfirmCommentActionParams): void {
  let comment = "";
  Modal.confirm({
    title,
    content: (
      <Input.TextArea
        autoSize={{ minRows: 3, maxRows: 6 }}
        placeholder={placeholder}
        onChange={(event) => {
          comment = event.target.value;
        }}
      />
    ),
    okText: "Подтвердить",
    cancelText: "Отмена",
    onOk: async () => {
      const value = comment.trim();
      if (!value) {
        message.error("Комментарий обязателен");
        throw new Error("Комментарий обязателен");
      }
      await onSubmit(value);
    }
  });
}
