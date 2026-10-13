export type Role = "ADMIN" | "OPERATOR" | "VIEWER";
export type Permission = "VIEW" | "CONFIGURE" | "MANAGE_USERS";

const grants: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  VIEWER: new Set(["VIEW"]),
  OPERATOR: new Set(["VIEW","CONFIGURE"]),
  ADMIN: new Set(["VIEW","CONFIGURE","MANAGE_USERS"])
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return grants[role]?.has(permission) ?? false;
}
