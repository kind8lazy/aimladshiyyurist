export const Roles = {
  OWNER: "OWNER",
  LEGAL_MANAGER: "LEGAL_MANAGER",
  ANALYST: "ANALYST",
  VIEWER: "VIEWER",
};

const permissions = {
  [Roles.OWNER]: new Set([
    "matters:read",
    "matters:write",
    "matters:status:update",
    "matters:audit:read",
    "matters:attachments:read",
    "reports:generate",
    "rag:read",
    "rag:write",
    "transcribe:use",
    "users:read",
  ]),
  [Roles.LEGAL_MANAGER]: new Set([
    "matters:read",
    "matters:write",
    "matters:status:update",
    "matters:audit:read",
    "matters:attachments:read",
    "reports:generate",
    "rag:read",
    "rag:write",
    "transcribe:use",
  ]),
  [Roles.ANALYST]: new Set([
    "matters:read",
    "matters:write",
    "matters:status:update",
    "matters:audit:read",
    "matters:attachments:read",
    "reports:generate",
    "rag:read",
    "transcribe:use",
  ]),
  [Roles.VIEWER]: new Set(["matters:read", "matters:audit:read", "matters:attachments:read", "reports:generate", "rag:read"]),
};

export function can(role, permission) {
  return permissions[role]?.has(permission) || false;
}
