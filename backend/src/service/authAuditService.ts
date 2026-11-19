import { NotFoundError } from "../lib/errors";
import { authAuditRepository } from "../repository/authAuditRepository";
import type { accessLogListQuerySchemaType } from "../types/setup.types";

type Rec = Record<string, unknown>;

const asRec = (v: unknown): Rec =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {};

const str = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

const keyList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((k) => String(k)) : [];

/** "label A → B, order 1 → 2" for the fields that differ. */
function fieldChanges(before: Rec, after: Rec, fields: [string, string][]) {
  return fields
    .filter(([field]) => before[field] !== after[field])
    .map(
      ([field, label]) =>
        `${label} ${str(before[field])} → ${str(after[field])}`,
    );
}

/** One-line description of an access-log row, built from before/after (BR-AUTH-31). */
export function summarizeAuditRow(row: {
  action: string;
  target: string;
  before: unknown;
  after: unknown;
}): string {
  const b = asRec(row.before);
  const a = asRec(row.after);

  switch (row.action) {
    case "role.grants": {
      const added = keyList(a.added).map((k) => `+${k}`);
      const removed = keyList(a.removed).map((k) => `−${k}`);
      const role = str(a.role ?? b.role);
      const changes = [...added, ...removed];
      return changes.length
        ? `${role} ${changes.join(" ")}`
        : `${role} no change`;
    }
    case "role.create":
      return `role ${str(a.name)} created`;
    case "role.copy":
      return `role ${str(a.name)} copied from ${str(b.name)}`;
    case "role.rename":
      return `role ${str(b.name)} → ${str(a.name)}`;
    case "role.delete":
      return `role ${str(b.name)} deleted`;
    case "employee.create":
      return `${str(a.name)} added, role ${str(a.roleName)}`;
    case "employee.update": {
      const parts = fieldChanges(b, a, [
        ["name", "name"],
        ["email", "email"],
        ["phone", "phone"],
        ["dailyRatePaise", "daily rate (paise)"],
        ["loginMethod", "login"],
      ]);
      if (a.passwordChanged === true) parts.push("password changed");
      const who = str(a.name ?? b.name);
      return parts.length ? `${who}: ${parts.join(", ")}` : `${who} updated`;
    }
    case "employee.role":
      return `${row.target} role ${str(b.roleName)} → ${str(a.roleName)}`;
    case "employee.deactivate":
      return `${row.target} deactivated`;
    case "employee.qr":
      return `${row.target} QR code regenerated`;
    case "screen.update": {
      const parts = fieldChanges(b, a, [
        ["label", "label"],
        ["sortOrder", "order"],
        ["menuGroup", "group"],
      ]);
      const screen = row.target.replace(/^screen:/, "");
      return parts.length
        ? `${screen}: ${parts.join(", ")}`
        : `${screen} updated`;
    }
    case "catalog.permission_removed":
      return `permission ${row.target} removed from the catalog`;
    case "catalog.screen_removed":
      return `screen ${row.target} removed from the catalog`;
    default:
      return `${row.action} ${row.target}`;
  }
}

export const authAuditService = {
  /** Read-only access log (BR-AUTH-20); rows carry a summary, not before/after (BR-AUTH-31). */
  async list(params: accessLogListQuerySchemaType) {
    const { rows, total } = await authAuditRepository.list(params);
    return {
      data: rows.map(({ before, after, ...row }) => ({
        ...row,
        at: row.at.toISOString(),
        summary: summarizeAuditRow({ ...row, before, after }),
      })),
      meta: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
      },
    };
  },

  /** One row with the full before/after (BR-AUTH-31). */
  async detail(id: number) {
    const row = await authAuditRepository.findById(id);
    if (!row) throw new NotFoundError("Access-log entry not found");
    return {
      ...row,
      at: row.at.toISOString(),
      summary: summarizeAuditRow(row),
    };
  },
};
