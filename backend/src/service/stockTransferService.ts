import { isRetryableConflict } from "../lib/db-errors";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { toMilli } from "../lib/milli";
import { postStock } from "../repository/stockPostingRepository";
import {
  stockTransferRepository as repo,
  type StockTransferRow,
  type Tx,
} from "../repository/stockTransferRepository";
import { WHOLE_NUMBER_UNITS } from "../types/grn.types";
import type {
  CreateStockTransferInput,
  ReverseStockTransferInput,
  StockTransferLineInput,
  StockTransferListQuery,
  UpdateStockTransferInput,
} from "../types/stockTransfer.types";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Deadlock or serialization failure: nothing was saved, safe to retry (BR-STR-17).
async function withRetryMapping<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isRetryableConflict(error)) {
      throw new ConflictError(
        "Another change was in progress, try again",
        "STR_RETRY",
      );
    }
    throw error;
  }
}

function assertSameLocationRule(sourceId: number, destinationId: number) {
  if (sourceId === destinationId) {
    throw new BadRequestError(
      "Source and destination must differ",
      "STR_SAME_LOCATION",
    ); // BR-STR-01
  }
}

function assertNoDuplicateItems(lines: StockTransferLineInput[]) {
  const seen = new Set<number>();
  for (const line of lines) {
    if (seen.has(line.itemId)) {
      throw new BadRequestError(
        "Item already on this transfer",
        "STR_DUPLICATE_ITEM",
      ); // BR-STR-04
    }
    seen.add(line.itemId);
  }
}

// BR-STR-02, 03: both locations exist, are active, and are not job-worker premises.
async function checkLocations(sourceId: number, destinationId: number, tx: Tx) {
  const rows = await repo.findLocations([sourceId, destinationId], tx, true);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const source = byId.get(sourceId);
  const destination = byId.get(destinationId);
  if (!source || !destination) {
    throw new NotFoundError("Location not found");
  }
  for (const location of [source, destination]) {
    if (!location.isActive) {
      throw new BadRequestError(
        `Location ${location.name} is inactive`,
        "STR_LOCATION_INACTIVE",
      );
    }
    if (location.type === "vendor_premise") {
      throw new BadRequestError(
        "Use a job work challan",
        "STR_VENDOR_LOCATION",
      );
    }
  }
  return { source, destination };
}

// BR-STR-05, 06, 16: items exist, are active, qty fits the unit, cost is known.
// Rows come back in ascending item id; `lock` row-locks them in that order.
async function checkItems(
  lines: StockTransferLineInput[],
  tx: Tx,
  lock = false,
) {
  const items = await repo.findItems(
    lines.map((l) => l.itemId),
    tx,
    lock,
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item) {
      throw new NotFoundError(`Item ${line.itemId} not found`);
    }
    if (!item.isActive) {
      throw new BadRequestError(`Item ${item.sku} is inactive`);
    }
    const uom = item.uom.trim().toLowerCase();
    if (WHOLE_NUMBER_UNITS.includes(uom) && !Number.isInteger(line.qty)) {
      throw new BadRequestError(
        `Qty must be a whole number for items in ${uom}`,
      );
    }
    if (item.averageCostPaise <= 0) {
      throw new BadRequestError(
        "Item has no cost — fix by stock-take first",
        "STR_ZERO_COST",
      );
    }
  }
  return byId;
}

export const stockTransferService = {
  async list(query: StockTransferListQuery) {
    // CR-002: no sortBy -> createdAt desc; sortBy without sortDir -> asc.
    const sortBy = query.sortBy ?? "createdAt";
    const sortDir = query.sortDir ?? (query.sortBy ? "asc" : "desc");
    const { rows, total } = await repo.list(query, sortBy, sortDir);
    return {
      data: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        postedAt: iso(r.postedAt),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  },

  async getDetails(id: number) {
    const header = await repo.findById(id);
    if (!header) {
      throw new NotFoundError("Stock transfer not found");
    }
    const [locationRows, lines] = await Promise.all([
      repo.findLocations([
        header.sourceLocationId,
        header.destinationLocationId,
      ]),
      repo.findLines(id),
    ]);
    const locById = new Map(locationRows.map((l) => [l.id, l]));
    const source = locById.get(header.sourceLocationId);
    const destination = locById.get(header.destinationLocationId);
    if (!source || !destination) {
      throw new NotFoundError("Location not found");
    }

    const actorIds = [
      header.createdBy,
      header.lastUpdatedBy,
      header.postedBy,
      header.cancelledBy,
      header.reversedBy,
    ].filter((v): v is number => v !== null);
    const [names, balances, ledgerRows] = await Promise.all([
      repo.findEmployeeNames([...new Set(actorIds)]),
      // BR-STR-30: a hint while draft only, one batch query for all lines.
      header.status === "draft"
        ? repo.balancesAt(
            header.sourceLocationId,
            lines.map((l) => l.itemId),
          )
        : Promise.resolve(new Map<number, number>()),
      repo.findLedgerRows(lines.map((l) => l.lineId)),
    ]);
    const actor = (actorId: number | null) =>
      actorId === null
        ? null
        : { id: actorId, name: names.get(actorId) ?? "Unknown" };
    const locationRef = (l: { id: number; name: string; type: string }) => ({
      id: l.id,
      name: l.name,
      type: l.type,
    });

    return {
      id: header.id,
      transferNumber: header.transferNumber,
      status: header.status,
      source: locationRef(source),
      destination: locationRef(destination),
      notes: header.notes,
      createdBy: actor(header.createdBy),
      createdAt: header.createdAt.toISOString(),
      lastUpdatedBy: actor(header.lastUpdatedBy),
      lastUpdatedAt: header.lastUpdatedAt.toISOString(),
      postedBy: actor(header.postedBy),
      postedAt: iso(header.postedAt),
      cancelledBy: actor(header.cancelledBy),
      cancelledAt: iso(header.cancelledAt),
      reversedBy: actor(header.reversedBy),
      reversedAt: iso(header.reversedAt),
      reverseReason: header.reverseReason,
      lines: lines.map((l) => ({
        ...l,
        sourceBalanceQty:
          header.status === "draft" ? (balances.get(l.itemId) ?? 0) : null,
      })),
      ledgerRows: ledgerRows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },

  // BR-STR-01..08
  async create(input: CreateStockTransferInput, actorId: number) {
    assertSameLocationRule(input.sourceLocationId, input.destinationLocationId);
    assertNoDuplicateItems(input.lines);
    return repo.transaction(async (tx) => {
      await checkLocations(
        input.sourceLocationId,
        input.destinationLocationId,
        tx,
      );
      await checkItems(input.lines, tx);
      return repo.insertTransfer(
        {
          sourceLocationId: input.sourceLocationId,
          destinationLocationId: input.destinationLocationId,
          notes: input.notes ?? null,
          createdBy: actorId,
          lastUpdatedBy: actorId,
        },
        input.lines,
        tx,
      );
    });
  },

  // BR-STR-09: only a draft; lines, if sent, replace all lines.
  async update(id: number, input: UpdateStockTransferInput, actorId: number) {
    if (input.lines) {
      assertNoDuplicateItems(input.lines);
    }
    return repo.transaction(async (tx) => {
      const header = await repo.lockById(id, tx);
      if (!header) {
        throw new NotFoundError("Stock transfer not found");
      }
      assertDraft(header);
      const sourceId = input.sourceLocationId ?? header.sourceLocationId;
      const destinationId =
        input.destinationLocationId ?? header.destinationLocationId;
      assertSameLocationRule(sourceId, destinationId);
      await checkLocations(sourceId, destinationId, tx);
      if (input.lines) {
        await checkItems(input.lines, tx);
      }
      await repo.updateHeader(
        id,
        {
          sourceLocationId: sourceId,
          destinationLocationId: destinationId,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          lastUpdatedBy: actorId,
          lastUpdatedAt: new Date(),
        },
        tx,
      );
      if (input.lines) {
        await repo.replaceLines(id, input.lines, tx);
      }
      return {
        id,
        transferNumber: header.transferNumber,
        status: header.status,
      };
    });
  },

  // BR-STR-10
  async cancel(id: number, actorId: number) {
    return repo.transaction(async (tx) => {
      const header = await repo.lockById(id, tx);
      if (!header) {
        throw new NotFoundError("Stock transfer not found");
      }
      assertDraft(header);
      const now = new Date();
      await repo.updateHeader(
        id,
        {
          status: "cancelled",
          cancelledBy: actorId,
          cancelledAt: now,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      return { id, status: "cancelled" as const };
    });
  },

  // BR-STR-11..18. Lock order: header, locations (share, id order), items (id
  // order), then postings in line order. Any throw rolls everything back.
  async post(id: number, actorId: number) {
    return withRetryMapping(() =>
      repo.transaction(async (tx) => {
        const header = await repo.lockById(id, tx);
        if (!header) {
          throw new NotFoundError("Stock transfer not found");
        }
        assertDraft(header);
        const { source } = await checkLocations(
          header.sourceLocationId,
          header.destinationLocationId,
          tx,
        );
        const lines = await repo.findLines(id, tx);
        const itemsById = await checkItems(
          lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
          tx,
          true,
        );
        const balances = await repo.balancesAt(
          header.sourceLocationId,
          lines.map((l) => l.itemId),
          tx,
        );
        lines.forEach((line, index) => {
          if (toMilli(balances.get(line.itemId) ?? 0) < toMilli(line.qty)) {
            throw new ConflictError(
              `Line ${index + 1}: insufficient stock at ${source.name}`,
              "STR_INSUFFICIENT_STOCK",
            ); // BR-STR-12, 13
          }
        });

        const note = `Stock transfer ${header.transferNumber}`;
        const posted: {
          lineId: number;
          itemId: number;
          qty: number;
          unitCostPaise: number;
          valuePaise: number;
        }[] = [];
        for (const line of lines) {
          const unitCostPaise = (
            itemsById.get(line.itemId) as {
              averageCostPaise: number;
            }
          ).averageCostPaise;
          const common = {
            itemId: line.itemId,
            referenceType: "stock_transfer" as const,
            referenceId: id,
            referenceLineId: line.lineId,
            unitCostPaise,
            averageEffect: "none" as const,
            notes: note,
            createdBy: actorId,
          };
          const out = await postStock(tx, {
            ...common,
            locationId: header.sourceLocationId,
            transactionType: "out",
            quantityChange: -line.qty,
            blockNegative: true,
          });
          await postStock(tx, {
            ...common,
            locationId: header.destinationLocationId,
            transactionType: "in",
            quantityChange: line.qty,
          });
          if (!out) {
            throw new InternalServerError("Ledger row was not written");
          }
          const valuePaise = Math.abs(out.totalValueChangePaise);
          await repo.setLinePostedCost(
            line.lineId,
            unitCostPaise,
            valuePaise,
            tx,
          );
          posted.push({
            lineId: line.lineId,
            itemId: line.itemId,
            qty: line.qty,
            unitCostPaise,
            valuePaise,
          });
        }

        const now = new Date();
        await repo.updateHeader(
          id,
          {
            status: "posted",
            postedBy: actorId,
            postedAt: now,
            lastUpdatedBy: actorId,
            lastUpdatedAt: now,
          },
          tx,
        );
        return {
          id,
          status: "posted" as const,
          postedAt: now.toISOString(),
          lines: posted,
        };
      }),
    );
  },

  // BR-STR-19..24: counter rows at the posted cost; refused if the stock has moved on.
  async reverse(id: number, input: ReverseStockTransferInput, actorId: number) {
    return withRetryMapping(() =>
      repo.transaction(async (tx) => {
        const header = await repo.lockById(id, tx);
        if (!header) {
          throw new NotFoundError("Stock transfer not found");
        }
        if (header.status !== "posted") {
          throw new ConflictError(
            "Only a posted transfer can be reversed",
            "STR_NOT_POSTED",
          );
        }
        const locationRows = await repo.findLocations(
          [header.sourceLocationId, header.destinationLocationId],
          tx,
          true,
        );
        for (const location of locationRows) {
          if (!location.isActive) {
            throw new BadRequestError(
              `Location ${location.name} is inactive`,
              "STR_LOCATION_INACTIVE",
            ); // BR-STR-22
          }
        }
        const destination = locationRows.find(
          (l) => l.id === header.destinationLocationId,
        );
        if (!destination) {
          throw new NotFoundError("Location not found");
        }

        const lines = await repo.findLines(id, tx);
        // Items stay lockable even if made inactive since posting (BR-STR-22).
        await repo.findItems(
          lines.map((l) => l.itemId),
          tx,
          true,
        );
        const balances = await repo.balancesAt(
          header.destinationLocationId,
          lines.map((l) => l.itemId),
          tx,
        );
        lines.forEach((line, index) => {
          const left = balances.get(line.itemId) ?? 0;
          if (toMilli(left) < toMilli(line.qty)) {
            throw new ConflictError(
              `Line ${index + 1}: only ${left} ${line.unit} left at ${destination.name}`,
              "STR_REVERSE_SHORT",
            ); // BR-STR-21
          }
        });

        const note = `Reversal of stock transfer ${header.transferNumber}`;
        for (const line of lines) {
          const common = {
            itemId: line.itemId,
            referenceType: "stock_transfer_reversal" as const,
            referenceId: id,
            referenceLineId: line.lineId,
            unitCostPaise: line.postedUnitCostPaise ?? 0,
            averageEffect: "none" as const,
            notes: note,
            createdBy: actorId,
          };
          await postStock(tx, {
            ...common,
            locationId: header.destinationLocationId,
            transactionType: "out",
            quantityChange: -line.qty,
            blockNegative: true,
          });
          await postStock(tx, {
            ...common,
            locationId: header.sourceLocationId,
            transactionType: "in",
            quantityChange: line.qty,
          });
        }

        const now = new Date();
        await repo.updateHeader(
          id,
          {
            status: "reversed",
            reversedBy: actorId,
            reversedAt: now,
            reverseReason: input.reason,
            lastUpdatedBy: actorId,
            lastUpdatedAt: now,
          },
          tx,
        );
        return {
          id,
          status: "reversed" as const,
          reversedAt: now.toISOString(),
        };
      }),
    );
  },
};

function assertDraft(header: StockTransferRow) {
  if (header.status !== "draft") {
    throw new ConflictError(
      "Only a draft transfer can be changed",
      "STR_NOT_DRAFT",
    ); // BR-STR-09, 10, 17, 24
  }
}
