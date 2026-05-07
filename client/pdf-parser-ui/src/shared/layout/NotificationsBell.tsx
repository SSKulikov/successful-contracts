import { BellOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Drawer, Empty, List, Spin, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsApi, type NotificationListItem } from "../api";

const UNREAD_POLL_MS = 45_000;

function formatWhen(iso: string): string {
  try {
    return dayjs(iso).format("DD.MM.YYYY HH:mm");
  } catch {
    return iso;
  }
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: UNREAD_POLL_MS
  });

  const {
    data: listData,
    isLoading: isListLoading,
    isFetching: isListFetching
  } = useQuery({
    queryKey: ["notifications", "list", 1],
    queryFn: () => notificationsApi.listNotifications({ page: 1, pageSize: 50 }),
    enabled: open
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const onItemClick = useCallback(
    async (item: NotificationListItem) => {
      if (!item.read) {
        try {
          await markReadMutation.mutateAsync(item.id);
        } catch {
          /* mark read не блокирует переход */
        }
      }
      if (item.documentId) {
        setOpen(false);
        navigate(`/documents/${item.documentId}`);
      }
    },
    [markReadMutation, navigate]
  );

  const items = listData?.items ?? [];

  return (
    <>
      <Badge count={unread > 0 ? unread : 0} size="small" offset={[-2, 2]}>
        <Button
          type="text"
          className="workspace-notifications-trigger"
          aria-label="Уведомления"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          onClick={handleOpen}
        />
      </Badge>
      <Drawer
        title="Уведомления"
        placement="right"
        size={380}
        onClose={handleClose}
        open={open}
        destroyOnHidden={false}
        className="notifications-drawer"
      >
        {isListLoading || (open && isListFetching && !listData) ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty description="Нет уведомлений" />
        ) : (
          <List
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                style={{
                  cursor: item.documentId ? "pointer" : "default",
                  opacity: item.read ? 0.72 : 1,
                  background: item.read ? undefined : "rgba(51, 65, 85, 0.08)",
                  paddingInline: 12,
                  borderRadius: 8,
                  marginBottom: 16
                }}
                onClick={() => void onItemClick(item)}
              >
                <List.Item.Meta
                  title={
                    <Typography.Text strong={!item.read} ellipsis>
                      {item.title}
                    </Typography.Text>
                  }
                  description={
                    <div>
                      {item.body ? (
                        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 4 }}>
                          {item.body}
                        </Typography.Paragraph>
                      ) : null}
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatWhen(item.createdAt)}
                      </Typography.Text>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </>
  );
}
