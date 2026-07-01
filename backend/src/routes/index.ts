import { Hono } from "hono";
import { authRoutes } from "./auth";
import { AppEnv } from "../lib/types";

export { authRoutes } from "./auth";

export const mainRouter = new Hono<AppEnv>();


mainRouter.route("/auth", authRoutes);