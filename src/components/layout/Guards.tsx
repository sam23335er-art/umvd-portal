import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Loading } from "../ui";

/** Требует входа. Права дополнительно проверяются в каждой операции (src/local). */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`${admin ? "/admin/login" : "/login"}?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (user.mustChangePassword && loc.pathname !== "/change-password") return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

export function RequirePerm({ any, children }: { any: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!any.some(can)) return <Forbidden />;
  return <>{children}</>;
}

export function Forbidden() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <ShieldAlert className="mx-auto h-12 w-12 text-warn" />
      <h1 className="mt-4 font-serif text-2xl font-bold">Раздел недоступен</h1>
      <p className="mt-2 text-muted">Для этого раздела у вашей учётной записи нет нужных полномочий. Если они вам положены по должности, обратитесь к руководству или администрации.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/cabinet" className="btn-secondary">В личный кабинет</Link>
        <Link to="/cabinet/appeals/new" className="btn-primary">Написать обращение</Link>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-serif text-6xl font-bold text-primary">404</p>
      <h1 className="mt-3 font-serif text-2xl font-bold">Страница не найдена</h1>
      <p className="mt-2 text-muted">Проверьте адрес или вернитесь на главную страницу портала.</p>
      <Link to="/" className="btn-primary mt-6">На главную</Link>
    </div>
  );
}
