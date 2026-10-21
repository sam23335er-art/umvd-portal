import { Navigate, Route, Routes } from "react-router-dom";
import { Forbidden, NotFound, RequireAuth, RequirePerm } from "./components/layout/Guards";
import { PublicLayout } from "./components/layout/PublicLayout";
import { ADMIN_NAV, PORTAL_NAV, Shell } from "./components/layout/Shell";
import { useAuth } from "./context/AuthContext";
import { AccessPage, RolesPage } from "./pages/admin/Access";
import { DesignPage } from "./pages/admin/Design";
import { AdminOverview } from "./pages/admin/Overview";
import { AppealsAdmin, ApplicationsAdmin, SecurityPage, SettingsPage } from "./pages/admin/Settings";
import { AppealThread, ApplyPage, CabinetHome, CabinetLayout, MyAppealsPage, NewAppealPage, PasswordTab } from "./pages/cabinet/Cabinet";
import { DashboardPage } from "./pages/portal/Dashboard";
import { DivisionDetailPage, DivisionsPage } from "./pages/portal/Divisions";
import { DocumentEditorPage, DocumentsPage, DocumentViewPage } from "./pages/portal/Documents";
import { EmployeeDetailPage, EmployeesPage } from "./pages/portal/Employees";
import { EventsPage } from "./pages/portal/Events";
import { AuditPage, HrPage } from "./pages/portal/HrAudit";
import { NewsPage } from "./pages/portal/News";
import { OrderDetailPage, OrdersPage } from "./pages/portal/Orders";
import { ReportsPage } from "./pages/portal/Reports";
import { AdminLoginPage, ChangePasswordPage, HomePage, LoginPage, RegisterPage } from "./pages/public";

const P = ({ any, children }: { any: string[]; children: React.ReactNode }) => <RequirePerm any={any}>{children}</RequirePerm>;

function PortalGate({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  // Пользователи без доступа к порталу (кандидаты, новые пользователи) попадают в кабинет
  if (!can("portal.view")) return <Navigate to="/cabinet" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Публичная часть */}
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/change-password" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} />

      {/* Личный кабинет и анкета */}
      <Route element={<CabinetLayout />}>
        <Route path="/apply" element={<ApplyPage />} />
      </Route>
      <Route path="/cabinet" element={<RequireAuth><CabinetLayout /></RequireAuth>}>
        <Route index element={<CabinetHome />} />
        <Route path="password" element={<PasswordTab />} />
        <Route path="appeals" element={<MyAppealsPage />} />
        <Route path="appeals/new" element={<NewAppealPage />} />
        <Route path="appeals/:id" element={<AppealThread />} />
      </Route>

      {/* Служебный портал */}
      <Route path="/portal" element={<RequireAuth><PortalGate><Shell nav={PORTAL_NAV} /></PortalGate></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="divisions" element={<DivisionsPage />} />
        <Route path="divisions/:id" element={<DivisionDetailPage />} />
        <Route path="employees" element={<P any={["employees.view"]}><EmployeesPage /></P>} />
        <Route path="employees/:id" element={<P any={["employees.view"]}><EmployeeDetailPage /></P>} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="documents" element={<P any={["documents.create", "documents.review"]}><DocumentsPage /></P>} />
        <Route path="documents/new/:type" element={<P any={["documents.create"]}><DocumentEditorPage /></P>} />
        <Route path="documents/:id" element={<DocumentViewPage />} />
        <Route path="documents/:id/edit" element={<P any={["documents.create"]}><DocumentEditorPage /></P>} />
        <Route path="hr" element={<P any={["hr.view"]}><HrPage /></P>} />
        <Route path="events" element={<EventsPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="reports" element={<P any={["reports.create", "reports.review"]}><ReportsPage /></P>} />
        <Route path="audit" element={<P any={["audit.view"]}><AuditPage /></P>} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Административная панель */}
      <Route path="/admin" element={<RequireAuth admin><P any={["admin.access"]}><Shell nav={ADMIN_NAV} admin /></P></RequireAuth>}>
        <Route index element={<AdminOverview />} />
        <Route path="employees" element={<P any={["employees.manage"]}><EmployeesPage admin /></P>} />
        <Route path="divisions" element={<P any={["divisions.manage"]}><DivisionsPage admin /></P>} />
        <Route path="applications" element={<P any={["applications.review"]}><ApplicationsAdmin /></P>} />
        <Route path="access" element={<P any={["users.manage", "admins.manage"]}><AccessPage /></P>} />
        <Route path="roles" element={<P any={["roles.manage", "admins.manage"]}><RolesPage /></P>} />
        <Route path="orders" element={<P any={["orders.create", "orders.publish"]}><OrdersPage admin /></P>} />
        <Route path="documents" element={<P any={["templates.manage", "documents.review"]}><DocumentsPage admin /></P>} />
        <Route path="news" element={<P any={["news.manage"]}><NewsPage admin /></P>} />
        <Route path="events" element={<P any={["events.manage"]}><EventsPage admin /></P>} />
        <Route path="reports" element={<P any={["reports.review"]}><ReportsPage admin /></P>} />
        <Route path="appeals/*" element={<P any={["appeals.handle"]}><AppealsAdmin /></P>} />
        <Route path="audit" element={<P any={["audit.view"]}><AuditPage /></P>} />
        <Route path="settings" element={<P any={["settings.manage"]}><SettingsPage /></P>} />
        <Route path="design" element={<P any={["design.manage"]}><DesignPage /></P>} />
        <Route path="security" element={<P any={["security.manage"]}><SecurityPage /></P>} />
        <Route path="forbidden" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
