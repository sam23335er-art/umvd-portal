/**
 * Модель данных портала. Все данные — один JSON-документ (DB):
 * на Vercel он хранится в Postgres, в автономном режиме — в localStorage.
 */

export type Role = "OWNER" | "ADMIN" | "CHIEF" | "DEPUTY" | "DIV_HEAD" | "HR" | "EMPLOYEE" | "CANDIDATE" | "USER" | "OBSERVER";

export type User = {
  id: string; login: string; nickname: string; passwordHash: string; role: Role; status: "ACTIVE" | "DISABLED"; mustChangePassword: boolean;
  createdAt: string; updatedAt: string; lastLoginAt: string | null; adminSince: string | null; adminAssignedById: string | null;
};
export type UserPermission = { userId: string; permission: string; grantedById: string | null; grantedAt: string };
export type RolePermission = { role: Role; permission: string };
export type Session = { id: string; tokenHash: string; userId: string; createdAt: string; lastSeenAt: string; expiresAt: string; revokedAt: string | null; userAgent: string };
export type LoginAttempt = { id: string; login: string; userId: string | null; success: boolean; reason: string | null; ip: string | null; userAgent: string | null; adminArea: boolean; createdAt: string };
export type AuditLog = { id: string; actorId: string | null; actorName: string; action: string; entity: string; entityId: string | null; summary: string; critical: boolean; meta?: unknown; createdAt: string };
export type RoleChangeLog = { id: string; targetId: string; actorId: string | null; previousRole: Role; newRole: Role; granted: string[]; revoked: string[]; result: "SUCCESS" | "DENIED"; reason: string | null; createdAt: string };
export type Notification = { id: string; userId: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };
export type Division = { id: string; code: string; name: string; shortName: string; description: string; tasks: string; status: "ACTIVE" | "LIMITED" | "INACTIVE"; enabled: boolean; sortOrder: number; headId: string | null; createdAt: string; updatedAt: string };
export type Employee = { id: string; userId: string | null; nickname: string; rank: string; position: string; divisionId: string | null; status: "ACTIVE" | "VACATION" | "SUSPENDED" | "DISMISSED"; joinedAt: string; isDemo: boolean; createdAt: string; updatedAt: string };
export type HrRecord = { id: string; employeeId: string; type: string; fromValue: string | null; toValue: string | null; comment: string | null; orderRef: string | null; actorId: string | null; actorName: string; createdAt: string };
export type Application = { id: string; userId: string; nickname: string; age: number; contact: string; divisionId: string | null; experience: string; motivation: string; status: string; reviewerId: string | null; reviewComment: string | null; createdAt: string; updatedAt: string };
export type Order = { id: string; number: string; title: string; category: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; content: string; authorId: string | null; publishedAt: string | null; isDemo: boolean; createdAt: string; updatedAt: string };
export type TemplateField = { key: string; label: string; type: "text" | "textarea" | "date" | "number" | "select"; required?: boolean; max?: number; options?: string[]; placeholder?: string };
export type DocumentTemplate = { type: string; name: string; description: string; fields: TemplateField[]; enabled: boolean; sortOrder: number; updatedAt: string };
export type Doc = { id: string; type: string; title: string; data: Record<string, string>; status: string; authorId: string; reviewerId: string | null; reviewComment: string | null; isDemo: boolean; createdAt: string; updatedAt: string };
export type News = { id: string; title: string; body: string; category: string; pinned: boolean; isPublic: boolean; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; authorId: string | null; isDemo: boolean; createdAt: string; updatedAt: string };
export type Event = { id: string; title: string; type: string; startsAt: string; endsAt: string | null; location: string; description: string; status: string; organizerId: string | null; divisionId: string | null; isDemo: boolean; createdAt: string; updatedAt: string };
export type EventParticipant = { eventId: string; userId: string; createdAt: string };
export type Report = { id: string; divisionId: string; title: string; periodFrom: string; periodTo: string; tasksDone: string; participants: number; results: string; headComment: string | null; status: string; authorId: string; reviewerId: string | null; isDemo: boolean; createdAt: string; updatedAt: string };
export type Appeal = { id: string; authorId: string; category: string; subject: string; status: string; assigneeId: string | null; createdAt: string; updatedAt: string };
export type AppealMessage = { id: string; appealId: string; authorId: string | null; body: string; isStaff: boolean; createdAt: string };
export type Settings = {
  portalName: string; subtitle: string; description: string; contacts: string; logoUrl: string | null; activeTheme: string; effectsEnabled: boolean; cursorGlow: boolean;
  themeBackgrounds: Record<string, string>; addressTitle: string; addressBody: string; addressAuthor: string; addressEnabled: boolean;
  registrationOpen: boolean; applicationsOpen: boolean; version: number; updatedById: string | null; updatedAt: string;
};

export type DB = {
  schemaVersion: 1;
  users: User[]; userPermissions: UserPermission[]; rolePermissions: RolePermission[]; sessions: Session[]; loginAttempts: LoginAttempt[];
  audit: AuditLog[]; roleChanges: RoleChangeLog[]; notifications: Notification[]; divisions: Division[]; employees: Employee[]; hrRecords: HrRecord[];
  applications: Application[]; orders: Order[]; templates: DocumentTemplate[]; documents: Doc[]; news: News[]; events: Event[]; participants: EventParticipant[];
  reports: Report[]; appeals: Appeal[]; appealMessages: AppealMessage[]; settings: Settings;
};

export const now = () => new Date().toISOString();
export const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 24) : Math.random().toString(36).slice(2) + Date.now().toString(36));
