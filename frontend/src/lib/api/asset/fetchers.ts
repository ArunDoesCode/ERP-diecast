import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
  AssetItem,
  AssetItemCreatePayload,
  AssetItemListParams,
  AssetItemUpdatePayload,
  AssetLocation,
  AssetLocationCreatePayload,
  AssetLocationListParams,
  AssetLocationUpdatePayload,
  AssetMachine,
  AssetMachineCreatePayload,
  AssetMachineListParams,
  AssetMachineUpdatePayload,
  AssetMovement,
  AssetMovementCreatePayload,
  AssetMovementListParams,
  AssetService,
  AssetServiceCreatePayload,
  AssetServiceListParams,
  AssetServiceUpdatePayload,
  Ok,
  PaginatedResponse,
} from "@/types/asset";

function toQueryString(params?: Record<string, unknown>) {
  if (!params) return "";

  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );

  if (entries.length === 0) return "";

  return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getMachines(params?: AssetMachineListParams) {
  return api.get<PaginatedResponse<AssetMachine>>(
    `${API_ROUTES.assets.machines.list}${toQueryString(params)}`,
  );
}

export function createMachine(payload: AssetMachineCreatePayload) {
  return api.post<Ok<AssetMachine>, AssetMachineCreatePayload>(
    API_ROUTES.assets.machines.create,
    payload,
  );
}

export function updateMachine(
  machineId: number,
  payload: AssetMachineUpdatePayload,
) {
  return api.patch<Ok<AssetMachine>, AssetMachineUpdatePayload>(
    API_ROUTES.assets.machines.update(machineId),
    payload,
  );
}

export function getLocations(params?: AssetLocationListParams) {
  return api.get<PaginatedResponse<AssetLocation>>(
    `${API_ROUTES.assets.locations.list}${toQueryString(params)}`,
  );
}

export function createLocation(payload: AssetLocationCreatePayload) {
  return api.post<Ok<AssetLocation>, AssetLocationCreatePayload>(
    API_ROUTES.assets.locations.create,
    payload,
  );
}

export function updateLocation(
  locationId: number,
  payload: AssetLocationUpdatePayload,
) {
  return api.patch<Ok<AssetLocation>, AssetLocationUpdatePayload>(
    API_ROUTES.assets.locations.update(locationId),
    payload,
  );
}

export function getMovements(params?: AssetMovementListParams) {
  return api.get<PaginatedResponse<AssetMovement>>(
    `${API_ROUTES.assets.inventory.movements.list}${toQueryString(params)}`,
  );
}

export function createMovement(payload: AssetMovementCreatePayload) {
  return api.post<Ok<AssetMovement>, AssetMovementCreatePayload>(
    API_ROUTES.assets.inventory.movements.create,
    payload,
  );
}

export function getItems(params?: AssetItemListParams) {
  return api.get<PaginatedResponse<AssetItem>>(
    `${API_ROUTES.assets.items}${toQueryString(params)}`,
  );
}

export function createItem(payload: AssetItemCreatePayload) {
  return api.post<Ok<AssetItem>, AssetItemCreatePayload>(
    API_ROUTES.assets.items,
    payload,
  );
}

export function updateItem(itemId: number, payload: AssetItemUpdatePayload) {
  return api.patch<Ok<AssetItem>, AssetItemUpdatePayload>(
    `${API_ROUTES.assets.items}/${itemId}`,
    payload,
  );
}

export function getServices(params?: AssetServiceListParams) {
  return api.get<PaginatedResponse<AssetService>>(
    `${API_ROUTES.assets.services}${toQueryString(params)}`,
  );
}

export function createService(payload: AssetServiceCreatePayload) {
  return api.post<Ok<AssetService>, AssetServiceCreatePayload>(
    API_ROUTES.assets.services,
    payload,
  );
}

export function updateService(
  serviceId: number,
  payload: AssetServiceUpdatePayload,
) {
  return api.patch<Ok<AssetService>, AssetServiceUpdatePayload>(
    `${API_ROUTES.assets.services}/${serviceId}`,
    payload,
  );
}
