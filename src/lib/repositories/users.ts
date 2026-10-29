import { queryOne } from "../db";

export interface UserRow {
  id: string; email: string; password_hash: string; role: "author" | "admin";
  name: string; author_id: string | null;
}

export const findUserByEmail = (email: string) =>
  queryOne<UserRow>(`SELECT id,email,password_hash,role,name,author_id FROM users WHERE email=$1`, [email]);
