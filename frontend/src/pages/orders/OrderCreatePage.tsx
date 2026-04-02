import { Navigate } from "react-router-dom";

/** Редирект на список с открытием модального окна создания (см. OrdersListPage). */
export function OrderCreatePage() {
  return <Navigate to="/orders?create=1" replace />;
}
