import bcrypt from "bcryptjs";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
