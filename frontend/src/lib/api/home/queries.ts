"use client";

import { useQuery } from "@tanstack/react-query";

import { getHomeCounts } from "./fetchers";
import type { HomeTileKey } from "./types";

/** Every home count query starts with ["home"], so one invalidation refreshes Home and the badge. */
export const homeKeys = {
	all: ["home"] as const,
	counts: (tiles?: HomeTileKey[]) =>
		tiles
			? (["home", "counts", tiles] as const)
			: (["home", "counts"] as const),
};

const REFRESH_MS = 60_000; // BR-FF-32

export function useHomeCountsQuery(tiles?: HomeTileKey[], enabled = true) {
	return useQuery({
		queryKey: homeKeys.counts(tiles),
		queryFn: () => getHomeCounts(tiles),
		select: (res) => res.data,
		enabled,
		refetchOnWindowFocus: true,
		refetchInterval: REFRESH_MS,
		staleTime: 0,
	});
}

/** Pending approvals for the menu badge (BR-FF-85). */
export function useApprovalsBadgeCount(enabled: boolean) {
	const query = useHomeCountsQuery(["approvals"], enabled);
	const tile = query.data?.tiles.find((t) => t.key === "approvals");
	return tile?.error ? 0 : (tile?.count ?? 0);
}
