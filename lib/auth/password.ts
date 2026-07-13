import bcrypt from "bcryptjs";

const POLICY_REGEX = {
  lower: /[a-z]/,
  upper: /[A-Z]/,
  special: /[^A-Za-z0-9]/,
};

export const PASSWORD_POLICY_MESSAGE =
  "La contraseña debe tener al menos 6 caracteres, con mayúscula, minúscula y un carácter especial.";

export function validatePasswordPolicy(password: string): boolean {
  if (typeof password !== "string" || password.length < 6) return false;
  return (
    POLICY_REGEX.lower.test(password) &&
    POLICY_REGEX.upper.test(password) &&
    POLICY_REGEX.special.test(password)
  );
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
