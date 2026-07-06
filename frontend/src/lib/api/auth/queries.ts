"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/api/client";
import { clearAccessToken, setAccessToken } from "@/lib/auth/token";
import type { LoginInput } from "@/types/auth";

import { getMe, login, logout } from "./fetchers";

export const authKeys = {
  me: () => ["auth", "me"] as const,
};

export function useMeQuery(enabled: boolean) {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: getMe,
    enabled,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginInput) => login(payload),
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || "Login failed");
        return;
      }

      setAccessToken(result.data.accessToken);
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
      toast.success(result.message || "Login successful");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError ? error.message : "Login failed",
      );
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSettled: async () => {
      clearAccessToken();
      await queryClient.removeQueries({ queryKey: authKeys.me() });
    },
  });
}
