import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type { HomeCountsResponse, HomeTileKey } from "./types";

export const getHomeCounts = (tiles?: HomeTileKey[]) =>
	api.get<HomeCountsResponse>(
		`${API_ROUTES.home.getCounts}${tiles?.length ? `?tiles=${tiles.join(",")}` : ""}`,
	);
