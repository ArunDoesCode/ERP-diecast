import { type Actor, can } from "../lib/auth-middleware";
import { istDayKey } from "../lib/ist-day";
import type { PermissionKey } from "../lib/permissions";
import { type HomeTileRaw, homeRepository } from "../repository/homeRepository";
import {
  HOME_TILE_KEYS,
  type HomeTileKey,
  type homeCountsSchemaType,
  type homeTileSchemaType,
} from "../types/home.types";

// BR-FF-34: a tile needs its own key AND the key of the list it opens.
// `approvals` needs none (any signed-in).
const TILE_KEYS: Record<HomeTileKey, PermissionKey[]> = {
  approvals: [],
  my_prs_draft: ["pr.manage"],
  my_prs_pending: ["pr.manage"],
  prs_to_order: ["po.manage", "pr.manage"],
  pos_to_send: ["po.manage"],
  my_pos_draft: ["po.manage"],
  pos_late: ["po.manage"],
  goods_expected: ["grn.edit_draft"],
  grns_to_inspect: ["grn.qa_decide", "grn.view"],
  jobwork_due: ["sco.view"],
  stock_low: ["inventory.view"],
};

const DATED: ReadonlySet<HomeTileKey> = new Set([
  "prs_to_order",
  "pos_to_send",
  "goods_expected",
  "grns_to_inspect",
  "jobwork_due",
]);
const WAITING: ReadonlySet<HomeTileKey> = new Set([
  "approvals",
  "my_prs_draft",
  "my_pos_draft",
  "prs_to_order",
  "pos_to_send",
  "grns_to_inspect",
]);
const MOVING: ReadonlySet<HomeTileKey> = new Set([
  "my_prs_pending",
  "goods_expected",
  "jobwork_due",
]);

function toTile(key: HomeTileKey, r: HomeTileRaw): homeTileSchemaType {
  const tile: homeTileSchemaType = { key, count: r.count, tone: "neutral" };
  const dated = DATED.has(key);
  if (dated) {
    tile.late = r.late;
    tile.today = r.today;
    tile.later = r.later;
  }
  // "Orders late" is all late by definition.
  const danger = dated ? r.late > 0 : key === "pos_late" && r.count > 0;
  if (danger) tile.tone = "danger";
  else if (r.count > 0 && WAITING.has(key)) tile.tone = "waiting";
  else if (r.count > 0 && MOVING.has(key)) tile.tone = "moving";

  if (r.count > 0) {
    const date = r.hintDate ?? undefined;
    switch (key) {
      case "approvals":
      case "my_prs_pending":
        if (date) tile.hint = { kind: "oldest_since", date };
        break;
      case "my_prs_draft":
      case "my_pos_draft":
        if (r.sentBack > 0) tile.hint = { kind: "sent_back", n: r.sentBack };
        break;
      case "prs_to_order":
        if (date) tile.hint = { kind: "earliest_required", date };
        break;
      case "pos_to_send":
      case "goods_expected":
      case "jobwork_due":
        if (date) tile.hint = { kind: "earliest_due", date };
        break;
      case "pos_late":
        if (date) tile.hint = { kind: "oldest_due", date };
        break;
      case "grns_to_inspect":
        if (date) tile.hint = { kind: "oldest_received", date };
        break;
      case "stock_low":
        tile.hint = { kind: "items", n: r.count };
        break;
    }
  }
  return tile;
}

export const homeService = {
  // BR-FF-10..33, 85: counts are always the caller's.
  async getCounts(
    actor: Actor,
    actorId: number,
    tiles: HomeTileKey[] | undefined,
  ): Promise<homeCountsSchemaType> {
    const today = istDayKey();
    // Request order is kept when `tiles` is given; otherwise BR-FF-13 order.
    const asked = tiles ?? [...HOME_TILE_KEYS];
    const allowed = asked.filter((k) =>
      TILE_KEYS[k].every((perm) => can(actor, perm)),
    );
    if (allowed.length === 0) return { today, tiles: [] };

    const results = await homeRepository.getTileCounts(allowed, {
      actorId,
      roleName: actor.roleName,
      today,
    });
    return {
      today,
      tiles: allowed.map((key) => {
        const r = results.get(key);
        return !r || r === "error" ? { key, error: true } : toTile(key, r);
      }),
    };
  },
};
