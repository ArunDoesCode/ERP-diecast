import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";

export type PresignResponse = {
  success: true;
  data: {
    uploadUrl: string;
    fileKey: string;
  };
};

export function createPresignUrl() {
  return api.post<PresignResponse>(API_ROUTES.files.presign);
}
