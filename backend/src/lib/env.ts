import { z } from "zod";

const envSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    APP_ORIGIN: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    ACCESS_TOKEN_SECRET: z.string().min(32),
    REFRESH_TOKEN_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().positive().default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().positive().default(604800),
    // "test" is included because `bun test` sets NODE_ENV=test by default —
    // needed for the route-registry drift test, which imports the full
    // route tree (and therefore this env module) as an import side effect.
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  })
  .refine((v) => v.ACCESS_TOKEN_SECRET !== v.REFRESH_TOKEN_SECRET, {
    message:
      "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must not be identical",
  })
  .refine(
    (v) =>
      !/replace/i.test(v.ACCESS_TOKEN_SECRET) &&
      !/replace/i.test(v.REFRESH_TOKEN_SECRET),
    {
      message:
        "Token secrets look like placeholder values — replace them before running",
    },
  );

export const env = envSchema.parse(process.env);
