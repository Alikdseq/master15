import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./app/RequireAuth";
import { Layout } from "./app/Layout";
import { RequireRole } from "./app/RequireRole";
import { LoginPage } from "./pages/LoginPage";
import { OrdersListPage } from "./pages/orders/OrdersListPage";
import { OrderCreatePage } from "./pages/orders/OrderCreatePage";
import { OrderDetailPage } from "./pages/orders/OrderDetailPage";
import { ClientsListPage } from "./pages/clients/ClientsListPage";
import { ClientDetailPage } from "./pages/clients/ClientDetailPage";
import { InventoryPage } from "./pages/inventory/InventoryPage";
import { InventoryCategoriesPage } from "./pages/inventory/InventoryCategoriesPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AdminPage } from "./pages/admin/AdminPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/orders" element={<OrdersListPage />} />
          <Route element={<RequireRole roles={["admin", "manager"]} />}>
            <Route path="/orders/new" element={<OrderCreatePage />} />
          </Route>
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/clients" element={<ClientsListPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route element={<RequireRole roles={["admin"]} />}>
            <Route path="/inventory/categories" element={<InventoryCategoriesPage />} />
          </Route>
          <Route path="/reports" element={<ReportsPage />} />
          <Route
            element={
              <RequireRole roles={["admin"]} redirectTo="/dashboard" forbiddenMessage="Доступ запрещён" />
            }
          >
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
