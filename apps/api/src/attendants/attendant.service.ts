import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Attendant, AttendantRole } from "./attendant.repository";
import { AttendantRepository } from "./attendant.repository";

export const createAttendantSchema = z.object({
  username: z.string().min(2).max(80),
  email: z.string().email().max(160),
  displayName: z.string().min(2).max(120),
  password: z.string().min(4).max(200),
  role: z.enum(["master", "manager", "attendant"]),
});

const scryptParams = { N: 16384, r: 8, p: 1 } as const;
const keyLength = 64;

export const hashAttendantPassword = (password: string): string => {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, keyLength, scryptParams);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
};

export const verifyAttendantPassword = (password: string, stored: string): boolean => {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const hash = scryptSync(password, salt, expected.length, scryptParams);
    return timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
};

export type AttendantPublic = Omit<Attendant, "passwordHash">;

const toPublic = (row: Attendant): AttendantPublic => {
  const { passwordHash: _p, ...rest } = row;
  return rest;
};

export class AttendantService {
  constructor(private readonly repository: AttendantRepository) {}

  listByTenant(tenantId: string): AttendantPublic[] {
    return this.repository.listByTenant(tenantId).map(toPublic);
  }

  create(tenantId: string, input: z.infer<typeof createAttendantSchema>): AttendantPublic {
    const username = input.username.trim();
    if (this.repository.findByUsername(tenantId, username)) {
      throw new Error("Já existe um usuário com este nome neste assinante.");
    }
    const row: Attendant = {
      id: randomUUID(),
      tenantId,
      username,
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      passwordHash: hashAttendantPassword(input.password),
      role: input.role as AttendantRole,
      createdAt: new Date().toISOString(),
    };
    this.repository.create(row);
    return toPublic(row);
  }

  delete(tenantId: string, attendantId: string): boolean {
    const list = this.repository.listByTenant(tenantId);
    if (!list.some((row) => row.id === attendantId)) return false;
    return this.repository.deleteById(attendantId);
  }
}
