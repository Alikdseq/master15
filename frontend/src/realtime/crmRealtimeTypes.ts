/** События с сервера (совпадают с broadcast_crm на бэкенде). */

export type CrmRealtimeMessage = {
  type: string;
  payload: {
    actor_id?: number;
    order?: Record<string, unknown>;
    order_id?: number;
    /** Клиент (для client_* и order_deleted). */
    client_id?: number;
    client?: Record<string, unknown>;
    product?: Record<string, unknown>;
    product_id?: number;
    new_stock?: string;
    changes?: Record<string, unknown>;
  };
};
