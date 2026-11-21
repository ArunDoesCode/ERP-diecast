import { type Actor, can } from "../lib/auth-middleware";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import { grnQaSummaryOfStatuses } from "../lib/grn-qa-summary";
import type { PermissionKey } from "../lib/permissions";
import { approvalRepository } from "../repository/approvalRepository";
import {
  documentRepository,
  type GrnLinkedRow,
  HISTORY_SOURCE_LIMIT,
  type LinkedRow,
  type RawHistoryRow,
} from "../repository/documentRepository";
import type {
  panelParamSchemaType,
  panelSchemaType,
} from "../types/document.types";
import {
  DOC_ACCESS_DENIED_MESSAGE,
  type DocReadAccess,
  resolveDocReadAccess,
} from "./approvalService";

type PanelActor = { actorId: number; actor: Actor };
type Panel = panelSchemaType;
type Linked = Panel["linked"][number];

const OPEN_KEYS: Record<"pr" | "po" | "grn", PermissionKey> = {
  pr: "pr.manage",
  po: "po.manage",
  grn: "grn.view",
};

const TRAIL_EVENTS: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  require_more_info: "Sent back",
  auto_approved: "Auto-approved",
  cancelled: "Approval cancelled",
};

const KIND_EVENTS: Record<string, string> = {
  created: "Created",
  cancelled_doc: "Cancelled",
  line_cancelled: "Line cancelled",
  comm_po_sent: "Sent to supplier",
  comm_reminder: "Reminder",
  comm_escalation: "Escalation",
  comm_confirmation: "Supplier confirmation",
  invoiced: "Invoiced",
  closed: "Closed",
  short_closed: "Short-closed",
  qa_passed: "QA accepted",
  qa_failed: "QA rejected",
  qa_waived: "QA waived",
  qa_pending: "QA logged",
  qa_bypass: "QA bypassed",
  correction: "Correction",
};

// BR-FF-94, SEC-05: supplier-communication notes never reach via-approval readers.
const SUPPLIER_COMM_KINDS = new Set([
  "comm_po_sent",
  "comm_reminder",
  "comm_escalation",
  "comm_confirmation",
]);

function eventName(kind: string) {
  return TRAIL_EVENTS[kind] ?? KIND_EVENTS[kind] ?? kind;
}

/** Merge sources, newest first, cut to 200 (BR-FF-54). */
function buildHistory(
  sources: { rows: RawHistoryRow[]; trail?: boolean }[],
  hideCommNotes: boolean,
): Pick<Panel, "history" | "historyTruncated"> {
  let truncated = false;
  const merged: (RawHistoryRow & { event: string })[] = [];
  for (const source of sources) {
    if (source.rows.length >= HISTORY_SOURCE_LIMIT) {
      truncated = true;
    }
    for (const row of source.rows) {
      merged.push({
        ...row,
        event: source.trail
          ? (TRAIL_EVENTS[row.kind] ?? row.kind)
          : eventName(row.kind),
      });
    }
  }
  merged.sort((a, b) => b.at.getTime() - a.at.getTime());
  if (merged.length > HISTORY_SOURCE_LIMIT) {
    truncated = true;
  }
  const history = merged.slice(0, HISTORY_SOURCE_LIMIT).map((row) => {
    const withheld = hideCommNotes && SUPPLIER_COMM_KINDS.has(row.kind);
    return {
      at: row.at.toISOString(),
      byName: row.byName,
      event: row.event,
      ...(row.note && !withheld ? { note: row.note } : {}),
    };
  });
  return { history, historyTruncated: truncated };
}

function toLinked(actor: Actor, rows: LinkedRow[]): Linked[] {
  return rows.map((row) => ({
    docType: row.docType,
    id: row.id,
    number: row.number,
    status: row.status,
    canOpen: can(actor, OPEN_KEYS[row.docType]),
  }));
}

function toGrnLinked(actor: Actor, rows: GrnLinkedRow[]): Linked[] {
  return rows.map((row) => {
    const qaStatus = grnQaSummaryOfStatuses(row.qaStatuses);
    return {
      docType: "grn" as const,
      id: row.id,
      number: row.number,
      status: row.status,
      ...(qaStatus ? { qaStatus } : {}),
      canOpen: can(actor, OPEN_KEYS.grn),
    };
  });
}

/** Approvals block + the trail the caller may see (latest request only for via-approval readers). */
async function loadApprovals(
  docType: "pr" | "po",
  docId: number,
  access: DocReadAccess,
): Promise<NonNullable<Panel["approvals"]>> {
  const requests = await approvalRepository.listRequestsWithTrailByDoc(
    docType,
    docId,
  );
  const latest = requests[0];
  const source =
    access.mode === "via_approval" && access.latest
      ? requests.filter((item) => item.id === access.latest?.id)
      : requests;
  const trail = source
    .flatMap((item) => item.trail)
    .sort((a, b) => a.actionAt.getTime() - b.actionAt.getTime() || a.id - b.id);
  return {
    status: latest?.status ?? null,
    currentLevel: latest?.currentLevel ?? null,
    totalLevels: latest?.totalLevels ?? null,
    trail,
  };
}

async function prPanel(
  docId: number,
  actor: PanelActor,
  access: DocReadAccess,
): Promise<Panel> {
  const pr = await documentRepository.findPrHeader(docId);
  if (!pr) {
    throw new NotFoundError("Purchase request not found");
  }
  const viaRequestId =
    access.mode === "via_approval" ? access.latest?.id : undefined;
  const [lineCount, approvals, linkedPos, trailEvents, lineEvents, creator] =
    await Promise.all([
      documentRepository.countPrLines(docId),
      loadApprovals("pr", docId, access),
      documentRepository.listPosOfPr(docId),
      documentRepository.listTrailEvents("pr", docId, viaRequestId),
      documentRepository.listPrLineCancelEvents(docId),
      documentRepository.findEmployeeName(pr.requestedBy),
    ]);
  const own: RawHistoryRow[] = [
    { at: pr.createdAt, byName: creator, kind: "created", note: null },
  ];
  if (pr.cancelledAt) {
    own.push({
      at: pr.cancelledAt,
      byName: pr.cancelledByName,
      kind: "cancelled_doc",
      note: pr.cancelReason,
    });
  }
  return {
    totals: { lineCount, estimatedAmountPaise: pr.estimatedAmountPaise },
    approvals,
    linked: toLinked(actor.actor, linkedPos),
    ...buildHistory(
      [{ rows: own }, { rows: trailEvents, trail: true }, { rows: lineEvents }],
      access.mode === "via_approval",
    ),
  };
}

async function poPanel(
  docId: number,
  actor: PanelActor,
  access: DocReadAccess,
): Promise<Panel> {
  const po = await documentRepository.findPoHeader(docId);
  if (!po) {
    throw new NotFoundError("Purchase order not found");
  }
  const viaRequestId =
    access.mode === "via_approval" ? access.latest?.id : undefined;
  const [qty, approvals, linkedPrs, grnRows, trailEvents, commEvents, names] =
    await Promise.all([
      documentRepository.sumPoQty(docId),
      loadApprovals("po", docId, access),
      documentRepository.listPrsOfPo(docId),
      documentRepository.listGrnsOfPo(docId),
      documentRepository.listTrailEvents("po", docId, viaRequestId),
      documentRepository.listPoCommunicationEvents(docId),
      documentRepository.findPoStampNames(docId),
    ]);
  const receivedPct =
    qty.ordered > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((qty.received / qty.ordered) * 100)),
        )
      : 0;
  const own: RawHistoryRow[] = [
    {
      at: po.createdAt,
      byName: names?.createdByName ?? null,
      kind: "created",
      note: null,
    },
  ];
  if (po.cancelledAt) {
    own.push({
      at: po.cancelledAt,
      byName: names?.cancelledByName ?? null,
      kind: "cancelled_doc",
      note: po.cancelReason,
    });
  }
  if (po.invoicedAt) {
    own.push({
      at: po.invoicedAt,
      byName: names?.invoicedByName ?? null,
      kind: "invoiced",
      note: null,
    });
  }
  if (po.closedAt) {
    own.push({
      at: po.closedAt,
      byName: names?.closedByName ?? null,
      kind: po.shortClosed ? "short_closed" : "closed",
      note: po.closeNote,
    });
  }
  return {
    totals: {
      subtotalPaise: po.subtotalPaise,
      taxAmountPaise: po.taxAmountPaise,
      totalAmountPaise: po.totalAmountPaise,
      receivedPct,
    },
    approvals,
    linked: [
      ...toLinked(actor.actor, linkedPrs),
      ...toGrnLinked(actor.actor, grnRows),
    ],
    ...buildHistory(
      [{ rows: own }, { rows: trailEvents, trail: true }, { rows: commEvents }],
      access.mode === "via_approval",
    ),
  };
}

async function grnPanel(docId: number, actor: PanelActor): Promise<Panel> {
  const grn = await documentRepository.findGrnHeader(docId);
  if (!grn) {
    throw new NotFoundError("Goods receipt not found");
  }
  const [lines, poLink, linkedPrs, creator, qaEvents, bypassEvents, fixEvents] =
    await Promise.all([
      documentRepository.listGrnLineQuantities(docId),
      grn.poId !== null
        ? documentRepository.findPoLink(grn.poId)
        : Promise.resolve(undefined),
      grn.poId !== null
        ? documentRepository.listPrsOfPo(grn.poId)
        : Promise.resolve([]),
      documentRepository.findEmployeeName(grn.createdBy),
      documentRepository.listQaEvents(docId),
      documentRepository.listBypassEvents(docId),
      documentRepository.listCorrectionEvents(docId),
    ]);
  const anyPending = lines.some((l) => (l.qaStatus ?? "pending") === "pending");
  const sum = (pick: (l: (typeof lines)[number]) => number | null) =>
    lines.reduce((total, l) => total + (pick(l) ?? 0), 0);
  const own: RawHistoryRow[] = grn.createdAt
    ? [{ at: grn.createdAt, byName: creator, kind: "created", note: null }]
    : [];
  return {
    // Quantities only, never money (BR-FF-51, 55).
    totals: {
      arrivedQty: sum((l) => l.receivedQty),
      acceptedQty: anyPending ? null : sum((l) => l.acceptedQty),
      rejectedQty: anyPending ? null : sum((l) => l.rejectedQty),
      uom: lines.find((l) => l.uom)?.uom ?? "",
    },
    approvals: null,
    linked: toLinked(actor.actor, [...(poLink ? [poLink] : []), ...linkedPrs]),
    ...buildHistory(
      [
        { rows: own },
        { rows: qaEvents },
        { rows: bypassEvents },
        { rows: fixEvents },
      ],
      false,
    ),
  };
}

export const documentService = {
  // BR-FF-42, 50..55. The access check runs before any lookup, so a missing id
  // and a forbidden id give the same 403.
  async getPanel(
    params: panelParamSchemaType,
    actor: PanelActor,
  ): Promise<Panel> {
    if (params.docType === "grn") {
      if (!can(actor.actor, "grn.view")) {
        throw new ForbiddenError(DOC_ACCESS_DENIED_MESSAGE);
      }
      return grnPanel(params.docId, actor);
    }
    const access = await resolveDocReadAccess(
      params.docType,
      params.docId,
      actor,
    );
    return params.docType === "pr"
      ? prPanel(params.docId, actor, access)
      : poPanel(params.docId, actor, access);
  },
};
