import type { TokenPayload } from "./token";

export type AppEnv = {
  Variables: {
    user: TokenPayload;
  };
};
