"use client";

import { useMutation } from "@tanstack/react-query";

import { createPresignUrl } from "./fetchers";

export function usePresignMutation() {
	return useMutation({
		mutationFn: createPresignUrl,
	});
}
