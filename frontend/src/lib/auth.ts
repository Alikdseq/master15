export type Role = "admin" | "manager" | "master";

export type AuthState = {
  role: Role | null;
  email: string | null;
  userId: number | null;
};

export function emptyAuthState(): AuthState {
  return { role: null, email: null, userId: null };
}
