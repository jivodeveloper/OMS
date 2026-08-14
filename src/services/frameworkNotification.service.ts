import { api } from "./api";

/**
 * Notifications from the reusable notification framework (Payments / Deposits /
 * future modules). Served by the Django app `notifications` at
 * /api/notifications/ — SEPARATE from the old Orders feed (/api/orders/
 * notifications/). Every row is already scoped to the caller server-side, so a
 * user only ever sees notifications created for them (their per-permission
 * inbox); the client adds no visibility rule of its own.
 */
export interface FrameworkNotification {
  id: number;
  event_type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: number | null;
  // Coarse module label the client filters on: "payments" | "deposits" | "other".
  module: string;
  company_id: number | null;
  is_read: boolean;
  created_at: string;
}

export const frameworkNotificationService = {
  getNotifications: async (): Promise<FrameworkNotification[]> => {
    const response = await api.get("/notifications/");
    return Array.isArray(response) ? (response as FrameworkNotification[]) : [];
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await api.get("/notifications/unread-count/");
    const value = (response as { unread?: number })?.unread;
    return typeof value === "number" ? value : 0;
  },

  markAllRead: async (): Promise<void> => {
    await api.post("/notifications/", {});
  },

  markRead: async (id: number): Promise<void> => {
    await api.patch(`/notifications/${id}/`);
  },
};
