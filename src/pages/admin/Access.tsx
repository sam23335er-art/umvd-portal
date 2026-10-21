import { useQuery } from "@tanstack/react-query";
import { Crown, History, KeyRound, Plus, ShieldCheck, ShieldOff, UserCog, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Checkbox, DictBadge, EmptyState, ErrorState, FilterSelect, Loading, Modal, PageHeader, Panel, SearchBox, SelectInput, Tabs, TableWrap, TextInput, useConfirm } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { get, patch, post, put, qs } from "../../lib/api";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { useAction, useDebounced } from "../../lib/hooks";
import { ROLE } from "../../lib/labels";

type Perm = { key: string; label: string; group: string; critical: boolean };
type Catalog = { permissions: Perm[]; roles: { key: string; label: string }[]; assignableRoles: string[]; grantable: string[]; ownerOnly: string[] };
type UserRow = {
  id: string; login: string; nickname: string; role: string; roleLabel: string; status: string; createdAt: string; lastLoginAt: string | null; adminSince: string | null;
  adminAssignedBy: { nickname: string } | null; permissions: string[]; employee: { rank: string; position: string; division: { shortName: string } | null } | null;
};
type UserFull = Omit<UserRow, "permissions" | "employee"> & {
  permissions: { permission: string; grantedAt: string; grantedBy: { nickname: string } | null }[];
  effectivePermissions: string[];
  employee: { id: string; rank: string; position: string; status: string; division: { name: string } | null } | null;
  roleChangesOn: RoleChange[];
};
type RoleChange = { id: string; previousRole: string; newRole: string; granted: string[]; revoked: string[]; result: "SUCCESS" | "DENIED"; reason: string | null; createdAt: string; actor: { nickname: string } | null; target?: { nickname: string; login: string } };

const useCatalog = () => useQuery({ queryKey: ["access-catalog"], queryFn: () => get<Catalog>("/admin/access/catalog"), staleTime: 300_000 });

export function AccessPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"users" | "admins" | "history">(can("admins.manage") ? "admins" : "users");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const dq = useDebounced(q);
  const catalog = useCatalog();
  const roleFilter = tab === "admins" ? "ADMIN" : role;
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["access-users", dq, roleFilter], queryFn: () => get<{ items: UserRow[] }>(`/admin/access/users${qs({ q: dq, role: roleFilter })}`), enabled: tab !== "history" });
  const [selected, setSelected] = useState<string | null>(null);
  const [assign, setAssign] = useState(false);
  const [create, setCreate] = useState(false);

  return (
    <>
      <PageHeader
        title="Администраторы и доступ"
        description="Назначение администраторов, роли пользователей и история изменения полномочий. Все проверки выполняются при каждой операции; каждое изменение попадает в журнал."
        actions={<>
          {can("users.manage") && <button className="btn-secondary" onClick={() => setCreate(true)}><Plus className="h-4 w-4" /> Учётная запись</button>}
          {can("admins.manage") && <button className="btn-primary" onClick={() => setAssign(true)}><ShieldCheck className="h-4 w-4" /> Назначить администратором</button>}
        </>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} items={[
          ...(can("admins.manage") ? [{ value: "admins" as const, label: "Администраторы" }] : []),
          { value: "users", label: "Все пользователи" },
          { value: "history", label: "История полномочий" },
        ]} />
        {tab !== "history" && <SearchBox className="min-w-[200px] flex-1" value={q} onChange={setQ} placeholder="Игровой ник или логин" />}
        {tab === "users" && <FilterSelect label="Роль" value={role} onChange={setRole} all="Все роли" options={(catalog.data?.roles ?? []).map((r) => ({ value: r.key, label: ROLE[r.key]?.label ?? r.label }))} />}
      </div>
      {tab === "history" ? <RoleHistory /> : (
        <Panel pad={false}>
          {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : data!.items.length === 0 ? (
            <EmptyState icon={<Users />} title={tab === "admins" ? "Администраторов пока нет" : "Пользователи не найдены"} text={tab === "admins" ? "Назначьте администратора из числа зарегистрированных пользователей." : undefined} />
          ) : (
            <div className="p-4 pt-0 sm:p-5 sm:pt-0">
              <TableWrap>
                <table className="table-base">
                  <thead><tr><th>Пользователь</th><th>Роль</th><th className="hidden md:table-cell">Регистрация</th><th>Статус</th>{tab === "admins" ? <><th className="hidden lg:table-cell">Назначен</th><th className="hidden xl:table-cell">Разрешения</th></> : <th className="hidden lg:table-cell">Последний вход</th>}<th /></tr></thead>
                  <tbody>
                    {data!.items.map((u) => (
                      <tr key={u.id}>
                        <td><p className="font-medium">{u.nickname}</p><p className="text-[12.5px] text-muted">{u.login}</p></td>
                        <td>{u.role === "OWNER" ? <Badge tone="gold"><Crown className="h-3 w-3" /> Владелец</Badge> : <DictBadge dict={ROLE} value={u.role} />}</td>
                        <td className="hidden text-muted md:table-cell">{fmtDate(u.createdAt)}</td>
                        <td>{u.status === "ACTIVE" ? <Badge tone="ok">Активна</Badge> : <Badge tone="bad">Отключена</Badge>}</td>
                        {tab === "admins" ? (
                          <>
                            <td className="hidden text-[13px] text-muted lg:table-cell">{fmtDate(u.adminSince)}{u.adminAssignedBy && <><br />{u.adminAssignedBy.nickname}</>}</td>
                            <td className="hidden max-w-[320px] xl:table-cell"><PermChips keys={u.permissions} catalog={catalog.data} /></td>
                          </>
                        ) : <td className="hidden text-muted lg:table-cell">{fmtDateTime(u.lastLoginAt)}</td>}
                        <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => setSelected(u.id)}><UserCog className="h-4 w-4" /> Управление</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          )}
        </Panel>
      )}
      {selected && <UserDrawer id={selected} onClose={() => setSelected(null)} />}
      {assign && <AssignAdmin onClose={() => setAssign(false)} />}
      {create && <CreateUser onClose={() => setCreate(false)} />}
    </>
  );
}

function PermChips({ keys, catalog }: { keys: string[]; catalog?: Catalog }) {
  if (!keys.length) return <span className="text-[12.5px] text-muted">Только базовый доступ</span>;
  const label = (k: string) => catalog?.permissions.find((p) => p.key === k)?.label ?? k;
  return <div className="flex flex-wrap gap-1">{keys.map((k) => <span key={k} className="rounded border border-line bg-surface2 px-1.5 py-0.5 text-[11.5px]">{label(k)}</span>)}</div>;
}

/** Выбор разрешений администратора, сгруппированных по разделам. */
function PermissionPicker({ value, onChange, catalog }: { value: string[]; onChange: (v: string[]) => void; catalog: Catalog }) {
  const groups = useMemo(() => {
    const m = new Map<string, Perm[]>();
    for (const p of catalog.permissions) {
      if (p.key === "admin.access") continue; // выдаётся ролью ADMIN
      m.set(p.group, [...(m.get(p.group) ?? []), p]);
    }
    return [...m.entries()];
  }, [catalog]);
  const toggle = (k: string, on: boolean) => onChange(on ? [...value, k] : value.filter((x) => x !== k));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map(([g, perms]) => (
        <fieldset key={g} className="rounded-item border border-line p-3">
          <legend className="px-1 text-[13px] font-medium text-muted">{g}</legend>
          <div className="space-y-2">
            {perms.map((p) => {
              const allowed = catalog.grantable.includes(p.key);
              return (
                <Checkbox key={p.key} checked={value.includes(p.key)} disabled={!allowed} onChange={(on) => toggle(p.key, on)}
                  label={<>{p.label}{p.critical && <span className="ml-1.5 text-[11.5px] text-warn">критическое</span>}</>}
                  hint={!allowed ? (catalog.ownerOnly.includes(p.key) ? "Выдаёт только владелец" : "Нет у вас — выдать нельзя") : undefined} />
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function AssignAdmin({ onClose }: { onClose: () => void }) {
  const catalog = useCatalog();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const users = useQuery({ queryKey: ["access-users", dq, "pick"], queryFn: () => get<{ items: UserRow[] }>(`/admin/access/users${qs({ q: dq, status: "ACTIVE" })}`) });
  const [target, setTarget] = useState<UserRow | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const assign = useAction(() => post(`/admin/access/users/${target!.id}/admin`, { permissions: perms, confirm: true }), {
    success: `${target?.nickname} назначен(а) администратором`,
    invalidate: [["access-users"], ["role-changes"]],
    onDone: onClose,
  });
  const candidates = (users.data?.items ?? []).filter((u) => u.role !== "OWNER" && u.role !== "ADMIN");
  const label = (k: string) => catalog.data?.permissions.find((p) => p.key === k)?.label ?? k;

  return (
    <Modal open onClose={onClose} wide title={`Назначение администратора · шаг ${step} из 3`}
      footer={<>
        {step > 1 && <button className="btn-secondary" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>Назад</button>}
        {step === 1 && <button className="btn-primary" disabled={!target} onClick={() => setStep(2)}>Далее: разрешения</button>}
        {step === 2 && <button className="btn-primary" onClick={() => setStep(3)}>Далее: подтверждение</button>}
        {step === 3 && <button className="btn-primary" disabled={!confirmed || assign.pending} onClick={() => assign.run()}><ShieldCheck className="h-4 w-4" /> Назначить администратором</button>}
      </>}>
      {step === 1 && (
        <div>
          <p className="mb-3 text-sm text-muted">Выберите существующего зарегистрированного пользователя.</p>
          <SearchBox value={q} onChange={setQ} placeholder="Игровой ник или логин" />
          <div className="mt-3 max-h-[340px] overflow-y-auto rounded-item border border-line">
            {users.isLoading ? <Loading /> : candidates.length === 0 ? <p className="p-4 text-center text-sm text-muted">Подходящих пользователей нет</p> : candidates.map((u) => (
              <button key={u.id} onClick={() => setTarget(u)} className={`flex w-full items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5 text-left last:border-0 ${target?.id === u.id ? "bg-primary/15" : "hover:bg-primary/5"}`}>
                <span><span className="font-medium">{u.nickname}</span> <span className="text-[12.5px] text-muted">{u.login}</span></span>
                <DictBadge dict={ROLE} value={u.role} />
              </button>
            ))}
          </div>
          {target && (
            <div className="mt-4 rounded-item border border-line bg-surface2 p-3 text-sm">
              <p className="font-medium">Профиль: {target.nickname}</p>
              <p className="text-muted">Логин {target.login} · зарегистрирован {fmtDate(target.createdAt)} · последний вход {fmtDateTime(target.lastLoginAt)}</p>
              {target.employee && <p className="text-muted">{target.employee.rank}, {target.employee.position}{target.employee.division && ` (${target.employee.division.shortName})`}</p>}
            </div>
          )}
        </div>
      )}
      {step === 2 && catalog.data && (
        <div>
          <p className="mb-4 text-sm text-muted">Администратор получит только отмеченные полномочия. Вход в админ-панель выдаётся ролью автоматически.</p>
          <PermissionPicker value={perms} onChange={setPerms} catalog={catalog.data} />
        </div>
      )}
      {step === 3 && target && (
        <div className="space-y-4 text-sm">
          <p>Пользователь <b>{target.nickname}</b> ({target.login}) получит роль <b>Администратор</b>.</p>
          <div><p className="mb-1.5 font-medium">Разрешения:</p>{perms.length ? <ul className="list-disc space-y-0.5 pl-5">{perms.map((p) => <li key={p}>{label(p)}</li>)}</ul> : <p className="text-muted">Только вход в админ-панель и просмотр обзора.</p>}</div>
          <p className="text-muted">Назначение будет записано в журнал аудита и историю полномочий, пользователь получит уведомление.</p>
          <Checkbox checked={confirmed} onChange={setConfirmed} label="Подтверждаю назначение администратора" />
        </div>
      )}
    </Modal>
  );
}

function UserDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { user: me, can } = useAuth();
  const confirm = useConfirm();
  const catalog = useCatalog();
  const { data, isLoading } = useQuery({ queryKey: ["access-user", id], queryFn: () => get<{ user: UserFull }>(`/admin/access/users/${id}`) });
  const u = data?.user;
  const [perms, setPerms] = useState<string[] | null>(null);
  const [newRole, setNewRole] = useState("");
  const inv = [["access-users"], ["access-user", id], ["role-changes"]];
  const savePerms = useAction(() => post(`/admin/access/users/${id}/admin`, { permissions: perms ?? [], confirm: true }), { success: "Права администратора обновлены", invalidate: inv });
  const revoke = useAction((role: string) => post(`/admin/access/users/${id}/admin/revoke`, { newRole: role, confirm: true }), { success: "Права администратора сняты", invalidate: inv, onDone: onClose });
  const changeRole = useAction((role: string) => patch(`/admin/access/users/${id}/role`, { role, confirm: true }), { success: "Роль изменена", invalidate: inv });
  const setStatus = useAction((status: string) => patch(`/admin/access/users/${id}/status`, { status }), { success: "Статус учётной записи изменён", invalidate: inv });
  const revokeSessions = useAction(() => post(`/admin/security/users/${id}/revoke-all`), { success: "Все сессии пользователя завершены" });

  const isSelf = u?.id === me?.id;
  const isOwner = u?.role === "OWNER";
  const label = (k: string) => catalog.data?.permissions.find((p) => p.key === k)?.label ?? k;
  const currentPerms = perms ?? u?.permissions.map((p) => p.permission) ?? [];
  const assignable = (catalog.data?.assignableRoles ?? []).map((r) => ({ value: r, label: ROLE[r]?.label ?? r }));

  return (
    <Modal open onClose={onClose} wide title={u ? `Управление: ${u.nickname}` : "Пользователь"}>
      {isLoading || !u ? <Loading /> : (
        <div className="space-y-6 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">Логин</dt><dd>{u.login}</dd>
              <dt className="text-muted">Роль</dt><dd>{isOwner ? <Badge tone="gold"><Crown className="h-3 w-3" /> Владелец</Badge> : <DictBadge dict={ROLE} value={u.role} />}</dd>
              <dt className="text-muted">Статус</dt><dd>{u.status === "ACTIVE" ? "Активна" : "Отключена"}</dd>
              <dt className="text-muted">Регистрация</dt><dd>{fmtDateTime(u.createdAt)}</dd>
              <dt className="text-muted">Последний вход</dt><dd>{fmtDateTime(u.lastLoginAt)}</dd>
              {u.adminSince && (<><dt className="text-muted">Администратор с</dt><dd>{fmtDate(u.adminSince)}{u.adminAssignedBy && ` (назначил ${u.adminAssignedBy.nickname})`}</dd></>)}
            </dl>
            <div className="rounded-item border border-line bg-surface2 p-3">
              <p className="font-medium">Карточка сотрудника</p>
              {u.employee ? <p className="text-muted">{u.employee.rank}, {u.employee.position}{u.employee.division && `, ${u.employee.division.name}`}</p> : <p className="text-muted">Не привязана</p>}
            </div>
          </div>

          {isOwner && <p className="rounded-item border border-gold/40 bg-gold/10 p-3">Роль и права владельца нельзя изменить через портал. Если пароль владельца забыт — «Настройки портала» → «Данные портала» → «Сбросить» (с другого входа это недоступно) или восстановление из резервной копии.</p>}
          {isSelf && !isOwner && <p className="rounded-item border border-warn/40 bg-warn/10 p-3">Собственную роль и полномочия изменить нельзя — обратитесь к владельцу.</p>}

          {!isOwner && !isSelf && (
            <>
              {u.role === "ADMIN" && can("admins.manage") && catalog.data && (
                <section>
                  <h3 className="mb-3 font-semibold">Разрешения администратора</h3>
                  <PermissionPicker value={currentPerms} onChange={setPerms} catalog={catalog.data} />
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button className="btn-primary btn-sm" disabled={!perms || savePerms.pending} onClick={async () => (await confirm({ title: "Изменить права администратора?", text: <>Новый набор разрешений для <b>{u.nickname}</b>: {currentPerms.length ? currentPerms.map(label).join(", ") : "только базовый доступ"}.</>, confirm: "Сохранить права" })) && savePerms.run()}>Сохранить разрешения</button>
                  </div>
                </section>
              )}
              {u.role === "ADMIN" && can("admins.manage") && (
                <section className="rounded-item border border-bad/30 p-4">
                  <h3 className="font-semibold text-bad">Снять права администратора</h3>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <SelectInput className="min-w-[220px]" label="Новая роль" value={newRole || "USER"} onChange={(e) => setNewRole(e.target.value)} options={assignable} />
                    <button className="btn-danger" disabled={revoke.pending} onClick={async () => {
                      const role = newRole || "USER";
                      const ok = await confirm({
                        title: `Снять права администратора с ${u.nickname}?`, danger: true, confirm: "Снять права",
                        text: (
                          <ul className="list-disc space-y-1 pl-5">
                            <li>Роль изменится на «{ROLE[role]?.label}».</li>
                            <li>Все индивидуальные разрешения ({u.permissions.length}) будут отозваны.</li>
                            <li>Все активные сессии пользователя будут завершены.</li>
                            <li>Учётная запись не удаляется. Изменение попадёт в журнал аудита.</li>
                          </ul>
                        ),
                      });
                      if (ok) revoke.run(role);
                    }}><ShieldOff className="h-4 w-4" /> Снять права</button>
                  </div>
                </section>
              )}
              {u.role !== "ADMIN" && can("users.manage") && (
                <section>
                  <h3 className="mb-2 font-semibold">Роль пользователя</h3>
                  <div className="flex flex-wrap items-end gap-2">
                    <SelectInput className="min-w-[240px]" label="Роль" value={newRole || u.role} onChange={(e) => setNewRole(e.target.value)} options={assignable} />
                    <button className="btn-primary" disabled={!newRole || newRole === u.role || changeRole.pending} onClick={async () => (await confirm({ title: "Изменить роль?", text: <>{u.nickname}: «{ROLE[u.role]?.label}» → «{ROLE[newRole]?.label}».</> })) && changeRole.run(newRole)}>Изменить роль</button>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-muted">Администраторы назначаются отдельной кнопкой «Назначить администратором».</p>
                </section>
              )}
              {can("users.manage") && (
                <section className="flex flex-wrap gap-2 border-t border-line pt-4">
                  {u.status === "ACTIVE"
                    ? <button className="btn-secondary" onClick={async () => (await confirm({ title: "Отключить учётную запись?", text: "Пользователь не сможет войти, его сессии будут завершены.", danger: true, confirm: "Отключить" })) && setStatus.run("DISABLED")}>Деактивировать</button>
                    : <button className="btn-secondary" onClick={() => setStatus.run("ACTIVE")}>Активировать</button>}
                  {can("security.manage") && <button className="btn-secondary" onClick={async () => (await confirm({ title: "Завершить все сессии?", text: "Пользователю придётся войти заново на всех устройствах." })) && revokeSessions.run()}><KeyRound className="h-4 w-4" /> Завершить сессии</button>}
                </section>
              )}
            </>
          )}

          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold"><History className="h-4 w-4" /> История полномочий</h3>
            <RoleChangeList items={u.roleChangesOn} />
          </section>
        </div>
      )}
    </Modal>
  );
}

function RoleChangeList({ items, showTarget = false }: { items: RoleChange[]; showTarget?: boolean }) {
  if (!items.length) return <p className="text-sm text-muted">Изменений не было.</p>;
  return (
    <TableWrap>
      <table className="table-base">
        <thead><tr><th>Дата</th>{showTarget && <th>Пользователь</th>}<th>Изменение</th><th className="hidden md:table-cell">Разрешения</th><th>Инициатор</th><th>Результат</th></tr></thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap text-muted">{fmtDateTime(c.createdAt)}</td>
              {showTarget && <td>{c.target?.nickname}<span className="block text-[12px] text-muted">{c.target?.login}</span></td>}
              <td className="whitespace-nowrap">{ROLE[c.previousRole]?.label} → {ROLE[c.newRole]?.label}</td>
              <td className="hidden text-[12.5px] md:table-cell">
                {c.granted.length > 0 && <span className="text-ok">+ {c.granted.join(", ")}</span>}
                {c.revoked.length > 0 && <span className="block text-bad">− {c.revoked.join(", ")}</span>}
                {!c.granted.length && !c.revoked.length && <span className="text-muted">—</span>}
              </td>
              <td>{c.actor?.nickname ?? "Сервер"}</td>
              <td>{c.result === "SUCCESS" ? <Badge tone="ok">Выполнено</Badge> : <Badge tone="bad" className="whitespace-normal">Отказ{c.reason && `: ${c.reason}`}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function RoleHistory() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["role-changes"], queryFn: () => get<{ items: RoleChange[] }>("/admin/access/role-changes") });
  return (
    <Panel>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : <RoleChangeList items={data!.items} showTarget />}
    </Panel>
  );
}

function CreateUser({ onClose }: { onClose: () => void }) {
  const catalog = useCatalog();
  const [v, setV] = useState({ login: "", nickname: "", password: "", role: "EMPLOYEE" });
  const save = useAction(() => post("/admin/access/users", v), { success: "Учётная запись создана. При первом входе пользователь сменит пароль.", invalidate: [["access-users"]], onDone: onClose });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} title="Новая учётная запись" footer={<><button className="btn-secondary" onClick={onClose}>Отмена</button><button className="btn-primary" disabled={save.pending} onClick={() => save.run()}>Создать</button></>}>
      <div className="space-y-4">
        <TextInput label="Логин" value={v.login} onChange={set("login")} error={save.fieldErrors.login} required />
        <TextInput label="Игровой ник" value={v.nickname} onChange={set("nickname")} error={save.fieldErrors.nickname} required />
        <TextInput label="Временный пароль" type="password" autoComplete="new-password" value={v.password} onChange={set("password")} error={save.fieldErrors.password} hint="Не короче 10 символов, буквы и цифры" required />
        <SelectInput label="Роль" value={v.role} onChange={set("role")} options={(catalog.data?.assignableRoles ?? []).map((r) => ({ value: r, label: ROLE[r]?.label ?? r }))} />
      </div>
    </Modal>
  );
}

// ─────────── Матрица ролей ───────────
export function RolesPage() {
  const { user, can } = useAuth();
  const confirm = useConfirm();
  const catalog = useCatalog();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["roles-matrix"], queryFn: () => get<{ matrix: Record<string, string[]>; roles: { key: string; label: string }[] }>("/admin/access/roles") });
  const [role, setRole] = useState("EMPLOYEE");
  const [draft, setDraft] = useState<string[] | null>(null);
  const save = useAction(async (c: boolean) => put(`/admin/access/roles/${role}`, { permissions: draft, confirm: c }), { success: "Матрица ролей сохранена", invalidate: [["roles-matrix"], ["me"]], onDone: () => setDraft(null) });
  if (isLoading || !catalog.data) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const current = draft ?? data.matrix[role] ?? [];
  const editable = can("roles.manage") && role !== "OWNER" && role !== user?.role;
  const crit = catalog.data.permissions.filter((p) => p.critical).map((p) => p.key);
  const changedCritical = draft && crit.some((k) => draft.includes(k) !== (data.matrix[role] ?? []).includes(k));
  const groups = [...new Set(catalog.data.permissions.map((p) => p.group))];

  return (
    <>
      <PageHeader title="Роли и права доступа" description="Базовые разрешения каждой роли. Индивидуальные права администраторов назначаются в разделе «Администраторы и доступ»." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Panel pad={false}>
          <ul className="py-1">
            {data.roles.map((r) => (
              <li key={r.key}>
                <button onClick={() => { setRole(r.key); setDraft(null); }} className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${role === r.key ? "bg-primary/15 text-ink" : "text-muted hover:bg-primary/5 hover:text-ink"}`}>
                  {ROLE[r.key]?.label ?? r.label}
                  <span className="text-[12px] tabular-nums">{data.matrix[r.key]?.length ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={`Роль «${ROLE[role]?.label}»`} actions={editable && draft && (
          <>
            <button className="btn-secondary btn-sm" onClick={() => setDraft(null)}>Отменить</button>
            <button className="btn-primary btn-sm" disabled={save.pending} onClick={async () => {
              if (changedCritical && !(await confirm({ title: "Изменить критические разрешения?", text: "Вы меняете разрешения администрирования. Изменение будет отмечено в журнале как критическое.", confirm: "Сохранить" }))) return;
              save.run(!!changedCritical);
            }}>Сохранить</button>
          </>
        )}>
          {role === "OWNER" && <p className="mb-4 rounded-item border border-gold/40 bg-gold/10 p-3 text-sm">Владелец всегда имеет все разрешения. Изменить их нельзя.</p>}
          {role === user?.role && role !== "OWNER" && <p className="mb-4 rounded-item border border-warn/40 bg-warn/10 p-3 text-sm">Разрешения собственной роли изменить нельзя.</p>}
          {!can("roles.manage") && <p className="mb-4 text-sm text-muted">Просмотр. Для изменения нужно право «Матрица ролей и разрешений».</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((g) => (
              <fieldset key={g} className="rounded-item border border-line p-3">
                <legend className="px-1 text-[13px] font-medium text-muted">{g}</legend>
                <div className="space-y-2">
                  {catalog.data!.permissions.filter((p) => p.group === g).map((p) => {
                    const ownerOnly = catalog.data!.ownerOnly.includes(p.key);
                    const allowed = editable && !ownerOnly && (user?.role === "OWNER" || (catalog.data!.grantable.includes(p.key) && p.key !== "roles.manage"));
                    return (
                      <Checkbox key={p.key} checked={current.includes(p.key)} disabled={!allowed}
                        onChange={(on) => setDraft(on ? [...current, p.key] : current.filter((x) => x !== p.key))}
                        label={<>{p.label}{p.critical && <span className="ml-1.5 text-[11.5px] text-warn">критическое</span>}</>}
                        hint={ownerOnly ? "Выдаётся только индивидуально владельцем" : undefined} />
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
