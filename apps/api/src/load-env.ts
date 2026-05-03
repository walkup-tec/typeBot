import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "apps/api/.env"),
  path.resolve(process.cwd(), "../.env"),
];

for (const envPath of candidates) {
  if (!fs.existsSync(envPath)) continue;
  dotenv.config({ path: envPath, override: false });
}

const apiEnvPath = path.resolve(process.cwd(), "apps/api/.env");
if (fs.existsSync(apiEnvPath)) {
  dotenv.config({ path: apiEnvPath, override: true });
}
