/**
 * Dispatch: cancel a posted note, transport update after posting, e-way limit
 * setting, manual-movement refusal (docs/specs/dispatch/spec.md v1:
 * BR-DSP-17, 25..27, 29..36, 42; CR-INV-1). Real DB, full HTTP stack.
 * Fixtures TEST_dspc_ prefixed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fyOf, istDay, makeDispatchFx } from "../helpers/dispatchFixtures";

const fx = makeDispatchFx("dspc");

beforeAll(async () => {
  await fx.setupCompany();
});
afterAll(async () => {
  await fx.cleanup();
});

const soLine = async (soId: number, lineId: number) =>
  (await fx.soDetail(soId)).lines.find((l: { id: number }) => l.id === lineId);

/** Posted note of 600 of 1000 with an e-way bill (needed). */
async function posted(over: Parameters<typeof fx.scenario>[0] = {}) {
  const s = await fx.scenario({ transport: fx.roadTransport(), ...over });
  const p = await fx.mustPost(s.note.id);
  return { ...s, p };
}

describe("cancel a posted note (BR-DSP-30, 31, 33, 36)", () => {
  test("BR-DSP-30 back_office and floor_supervisor get 403 PERMISSION_DENIED and the note stays posted", async () => {
    const s = await posted();
    for (const role of ["back_office", "floor_supervisor"] as const) {
      const r = await fx.cancelPosted(s.note.id, "wrong part loaded", role);
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("PERMISSION_DENIED");
    }
    expect((await fx.noteDetail(s.note.id)).status).toBe("posted");
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(1);
  });

  test("BR-DSP-30 the owner cancels with a reason; the note is cancelled with the reason stored", async () => {
    const s = await posted();
    const r = await fx.cancelPosted(s.note.id, "wrong part loaded");
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("cancelled");
    expect(r.json.data.cancelReason).toBe("wrong part loaded");
    expect(r.json.data.cancelledAt).toBeTruthy();
  });

  test("BR-DSP-30 a reason of 1 or 501 characters, or none, is 400 and the note stays posted", async () => {
    const s = await posted();
    expect((await fx.cancelPosted(s.note.id, "x")).status).toBe(400);
    expect((await fx.cancelPosted(s.note.id, "x".repeat(501))).status).toBe(
      400,
    );
    expect(
      (await fx.dsp("owner", "POST", `/notes/${s.note.id}/cancel`, {})).status,
    ).toBe(400);
    expect((await fx.noteDetail(s.note.id)).status).toBe("posted");
  });

  test("BR-DSP-31 cancel posts one in row at the same location, reference delivery_note_cancel, at the cost the line went out at, net value 0", async () => {
    const s = await posted();
    await fx.cancelPosted(s.note.id);
    const rows = await fx.ledgerOfNote(s.note.id);
    expect(rows).toHaveLength(2);
    const out = rows.find((r) => r.referenceType === "delivery_note");
    const back = rows.find((r) => r.referenceType === "delivery_note_cancel");
    expect(back?.transactionType).toBe("in");
    expect(back?.quantityChange).toBe(600);
    expect(back?.locationId).toBe(s.loc);
    expect(back?.unitCostPaise).toBe(out?.unitCostPaise as number);
    expect(back?.unitCostPaise).toBe(9800);
    expect(back?.referenceLineId).toBe(s.note.lines[0].id);
    expect(
      (out?.totalValueChangePaise as number) +
        (back?.totalValueChangePaise as number),
    ).toBe(0);
    expect(await fx.balance(s.item, s.loc)).toBe(700);
  });

  test("BR-DSP-31 cancel lowers the SO line's delivered qty by the note qty", async () => {
    const s = await posted();
    expect((await soLine(s.so.soId, s.lineId)).deliveredQty).toBe(600);
    await fx.cancelPosted(s.note.id);
    const l = await soLine(s.so.soId, s.lineId);
    expect(l.deliveredQty).toBe(0);
    expect(l.openQty).toBe(1000);
  });

  test("BR-DSP-33 a second cancel is 409 DISPATCH_NOTE_STATUS and posts no second row", async () => {
    const s = await posted();
    await fx.cancelPosted(s.note.id);
    const r = await fx.cancelPosted(s.note.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DISPATCH_NOTE_STATUS");
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(2);
    expect((await soLine(s.so.soId, s.lineId)).deliveredQty).toBe(0);
  });

  test("BR-DSP-33 two cancels at once: one 200, one 409, delivered qty lowered once", async () => {
    const s = await posted();
    const [a, b] = await Promise.all([
      fx.cancelPosted(s.note.id),
      fx.cancelPosted(s.note.id),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(2);
    expect((await soLine(s.so.soId, s.lineId)).deliveredQty).toBe(0);
  });

  test("BR-DSP-30 a draft cannot be cancelled through the posted-cancel route (409)", async () => {
    const s = await fx.scenario({ qty: 10 });
    const r = await fx.cancelPosted(s.note.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DISPATCH_NOTE_STATUS");
  });

  test("BR-DSP-36 cancelling a posted note writes an audit row dispatch.cancel with the reason", async () => {
    const s = await posted();
    await fx.cancelPosted(s.note.id, "wrong part loaded");
    const d = await fx.noteDetail(s.note.id);
    const row = d.activity.find(
      (a: { action: string }) => a.action === "dispatch.cancel",
    );
    expect(row?.reason).toBe("wrong part loaded");
  });

  test("BR-DSP-17 a cancelled note keeps its number: the next note gets the next number", async () => {
    const a = await posted({ qty: 10, transport: undefined });
    const n1 = Number(a.p.dnNumber.split("/")[2]);
    await fx.cancelPosted(a.note.id);
    const b = await fx.scenario({ qty: 10 });
    const pb = await fx.mustPost(b.note.id);
    expect(pb.dnNumber.startsWith(`DN/${fyOf(istDay(0))}/`)).toBe(true);
    expect(Number(pb.dnNumber.split("/")[2])).toBe(n1 + 1);
    expect((await fx.noteDetail(a.note.id)).dnNumber).toBe(a.p.dnNumber);
  });

  test("BR-DSP-26 cancelling a posted note frees its e-way number", async () => {
    const no = fx.ewayNo();
    const a = await posted({ transport: fx.roadTransport({ ewayBillNo: no }) });
    await fx.cancelPosted(a.note.id);
    const b = await fx.scenario({
      transport: fx.roadTransport({ ewayBillNo: no }),
    });
    expect(b.note.transport.ewayBillNo).toBe(no);
  });
});

describe("cancel and the SO (BR-DSP-32)", () => {
  test("BR-DSP-32 SO on hold: cancel works, the SO stays on hold, open qty is back", async () => {
    const s = await posted();
    await fx.soOp(s.so.soId, "hold");
    const r = await fx.cancelPosted(s.note.id);
    expect(r.status).toBe(200);
    expect((await fx.soDetail(s.so.soId)).status).toBe("on_hold");
    expect((await soLine(s.so.soId, s.lineId)).openQty).toBe(1000);
  });

  test("BR-DSP-32 SO closed 'fully delivered': cancel moves it back to confirmed", async () => {
    const s = await posted({
      soQty: 100,
      qty: 100,
      stockQty: 100,
      transport: undefined,
    });
    expect((await fx.soDetail(s.so.soId)).status).toBe("closed");
    const r = await fx.cancelPosted(s.note.id);
    expect(r.status).toBe(200);
    const so = await fx.soDetail(s.so.soId);
    expect(so.status).toBe("confirmed");
    expect(so.closeKind).toBeNull();
    expect((await soLine(s.so.soId, s.lineId)).openQty).toBe(100);
    expect(r.json.data.soStatus).toBe("confirmed");
  });

  test("BR-DSP-32 SO closed by hand: cancel is 409 DISPATCH_SO_CLOSED_MANUALLY and the note stays posted", async () => {
    const s = await posted();
    await fx.soOp(s.so.soId, "close");
    const r = await fx.cancelPosted(s.note.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DISPATCH_SO_CLOSED_MANUALLY");
    expect((await fx.noteDetail(s.note.id)).status).toBe("posted");
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(1);
    expect((await soLine(s.so.soId, s.lineId)).deliveredQty).toBe(600);
  });

  test("BR-DSP-32 an SO with a posted note cannot be cancelled (sale-order BR-SO-18)", async () => {
    const s = await posted();
    const d = await fx.soDetail(s.so.soId);
    const r = await fx.call(
      "back_office",
      "POST",
      `/api/sale-orders/${s.so.soId}/cancel`,
      {
        editVersion: d.editVersion,
        reason: "try cancel",
      },
    );
    expect(r.status).toBe(409);
  });
});

describe("transport after posting (BR-DSP-25, 26, 27, 36)", () => {
  const patch = (
    id: number,
    body: Record<string, unknown>,
    role: "floor_supervisor" | "owner" = "floor_supervisor",
  ) => fx.dsp(role, "PATCH", `/notes/${id}/transport`, body);
  const history = async (id: number) => {
    const r = await fx.dsp("owner", "GET", `/notes/${id}/transport-history`);
    expect(r.status).toBe(200);
    return r.json.data as Array<{
      field: string;
      oldValue: string | null;
      newValue: string;
      changedByName: string | null;
    }>;
  };

  test("BR-DSP-27 a vehicle change is saved normalised, keeps a history row (old, new, who) and an audit row", async () => {
    const s = await posted();
    const r = await patch(s.note.id, { vehicleNo: "mh 14-cd 5678" });
    expect(r.status).toBe(200);
    expect(r.json.data.transport.vehicleNo).toBe("MH14CD5678");
    const h = await history(s.note.id);
    expect(h).toHaveLength(1);
    expect(h[0]?.field).toBe("vehicleNo");
    expect(h[0]?.oldValue).toBe("MH12AB1234");
    expect(h[0]?.newValue).toBe("MH14CD5678");
    expect(h[0]?.changedByName).toBeTruthy();
    const d = await fx.noteDetail(s.note.id);
    expect(d.activity.map((a: { action: string }) => a.action)).toContain(
      "dispatch.transport",
    );
  });

  test("BR-DSP-27 a value equal to the stored one is ignored: no history row", async () => {
    const s = await posted();
    const r = await patch(s.note.id, { vehicleNo: "MH12AB1234" });
    expect(r.status).toBe(200);
    expect(await history(s.note.id)).toHaveLength(0);
  });

  test("BR-DSP-27 history is newest first", async () => {
    const s = await posted();
    await patch(s.note.id, { vehicleNo: "MH14CD5678" });
    await patch(s.note.id, { vehicleNo: "MH15EF9012" });
    const h = await history(s.note.id);
    expect(h.map((x) => x.newValue)).toEqual(["MH15EF9012", "MH14CD5678"]);
  });

  test("BR-DSP-27 transporter ID, name and transport document fields may change after posting", async () => {
    const s = await posted();
    const r = await patch(s.note.id, {
      transporterId: "27ABCDE1234F1Z5",
      transporterName: "Fast Cargo",
      transportDocNo: "LR-9",
      transportDocDate: istDay(0),
    });
    expect(r.status).toBe(200);
    expect(r.json.data.transport.transporterName).toBe("Fast Cargo");
    expect((await history(s.note.id)).map((h) => h.field).sort()).toEqual([
      "transportDocDate",
      "transportDocNo",
      "transporterId",
      "transporterName",
    ]);
  });

  test("BR-DSP-27 the transport mode is locked: any mode key, even unchanged, is 409 DISPATCH_NOTE_FIELD_LOCKED", async () => {
    const s = await posted();
    for (const mode of ["rail", "road"]) {
      const r = await patch(s.note.id, { mode });
      expect(r.status).toBe(409);
      expect(r.json.code).toBe("DISPATCH_NOTE_FIELD_LOCKED");
    }
  });

  test("BR-DSP-27 an existing e-way number, date or distance cannot change (409)", async () => {
    const s = await posted();
    const a = await patch(s.note.id, {
      ewayBillNo: fx.ewayNo(),
      ewayBillDate: istDay(0),
    });
    expect(a.status).toBe(409);
    const b = await patch(s.note.id, { distanceKm: 100 });
    expect(b.status).toBe(409);
    expect(
      (await history(s.note.id)).filter((h) => h.field === "ewayBillNo"),
    ).toHaveLength(0);
  });

  test("BR-DSP-27 an optional note can add e-way number, date and distance once, together", async () => {
    const s = await posted({ qty: 100, transport: undefined });
    const no = fx.ewayNo();
    const r = await patch(s.note.id, {
      ewayBillNo: no,
      ewayBillDate: istDay(0),
      distanceKm: 120,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.transport.ewayBillNo).toBe(no);
    expect(r.json.data.transport.distanceKm).toBe(120);
    expect(r.json.data.ewayValidUntil).toBeTruthy();
    const fields = (await history(s.note.id)).map((h) => h.field);
    expect(fields).toContain("ewayBillNo");
    expect(fields).toContain("ewayBillDate");
    expect(fields).toContain("distanceKm");
    const again = await patch(s.note.id, {
      ewayBillNo: fx.ewayNo(),
      ewayBillDate: istDay(0),
    });
    expect(again.status).toBe(409);
  });

  test("BR-DSP-27 an e-way number without its date is 400", async () => {
    const s = await posted({ qty: 100, transport: undefined });
    const r = await patch(s.note.id, { ewayBillNo: fx.ewayNo() });
    expect(r.status).toBe(400);
  });

  test("BR-DSP-27 on a road note that needs an e-way bill, clearing the vehicle with no transporter ID is 400 and the vehicle stays", async () => {
    const s = await posted();
    const r = await patch(s.note.id, { vehicleNo: null });
    expect(r.status).toBe(400);
    expect((await fx.noteDetail(s.note.id)).transport.vehicleNo).toBe(
      "MH12AB1234",
    );
  });

  test("BR-DSP-27 clearing the vehicle is allowed when a transporter ID is set in the same change", async () => {
    const s = await posted();
    const r = await patch(s.note.id, {
      vehicleNo: null,
      transporterId: "27ABCDE1234F1Z5",
    });
    expect(r.status).toBe(200);
    expect(r.json.data.transport.vehicleNo).toBeNull();
  });

  test("BR-DSP-27 qty, price or status keys on the transport route are 400 and change nothing", async () => {
    const s = await posted();
    for (const body of [
      { qty: 1 },
      { status: "draft" },
      { unitPricePaise: 1 },
    ]) {
      expect((await patch(s.note.id, body)).status).toBe(400);
    }
    expect((await fx.noteDetail(s.note.id)).lines[0].qty).toBe(600);
  });

  test("BR-DSP-27 an empty body is 400", async () => {
    const s = await posted();
    expect((await patch(s.note.id, {})).status).toBe(400);
  });

  test("BR-DSP-25 a bad vehicle or transporter format on the transport route is 400", async () => {
    const s = await posted();
    expect((await patch(s.note.id, { vehicleNo: "MH12" })).status).toBe(400);
    expect((await patch(s.note.id, { transporterId: "BAD" })).status).toBe(400);
  });

  test("BR-DSP-26 adding an e-way number that sits on another live note is 409 DISPATCH_EWAY_REUSED", async () => {
    const used = await posted();
    const s = await posted({ qty: 100, transport: undefined });
    const r = await patch(s.note.id, {
      ewayBillNo: used.note.transport.ewayBillNo,
      ewayBillDate: istDay(0),
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DISPATCH_EWAY_REUSED");
  });

  test("BR-DSP-27 the transport route on a draft or cancelled note is 409 DISPATCH_NOTE_STATUS", async () => {
    const d = await fx.scenario({ qty: 10 });
    const r = await patch(d.note.id, { vehicleNo: "MH12AB1234" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DISPATCH_NOTE_STATUS");
    const c = await posted();
    await fx.cancelPosted(c.note.id);
    expect((await patch(c.note.id, { vehicleNo: "MH14CD5678" })).status).toBe(
      409,
    );
  });

  test("BR-DSP-35 qa_inspector gets 403 on the transport route", async () => {
    const s = await posted();
    const r = await fx.dsp(
      "qa_inspector",
      "PATCH",
      `/notes/${s.note.id}/transport`,
      {
        vehicleNo: "MH14CD5678",
      },
    );
    expect(r.status).toBe(403);
  });
});

describe("e-way limit setting (BR-DSP-42, 23)", () => {
  const company = (over: Record<string, unknown> = {}) => ({
    name: "Plant Works",
    address: "1 Plant Road, Pune",
    gstin: "27AAACD1234E1Z5",
    stateCode: "27",
    ...over,
  });
  const save = (
    role: "owner" | "floor_supervisor",
    body: Record<string, unknown>,
  ) => fx.call(role, "PATCH", "/api/company/settings", body);
  const hist = async () => {
    const r = await fx.call("owner", "GET", "/api/company/settings/history");
    expect(r.status).toBe(200);
    return r.json.data as Array<{
      field: string;
      oldValue: string | null;
      newValue: string;
    }>;
  };

  test("BR-DSP-42 the owner raises the limit; it is returned by the settings routes and a history row (old, new) is added", async () => {
    await fx.setLimit(5_000_000);
    const r = await save("owner", company({ ewayIntraLimitPaise: 10_000_000 }));
    expect(r.status).toBe(200);
    const got = await fx.call("owner", "GET", "/api/company/settings");
    expect(got.json.data.ewayIntraLimitPaise).toBe(10_000_000);
    const d = await fx.dsp("floor_supervisor", "GET", "/settings");
    expect(d.status).toBe(200);
    expect(d.json.data.ewayIntraLimitPaise).toBe(10_000_000);
    expect(d.json.data.plantStateCode).toBe("27");
    const row = (await hist()).find(
      (h) => h.field === "ewayIntraLimitPaise" && h.newValue === "10000000",
    );
    expect(row?.oldValue).toBe("5000000");
    await fx.setLimit(5_000_000);
  });

  test("BR-DSP-42 a save without the field leaves the limit unchanged and adds no e-way history row", async () => {
    await fx.setLimit(7_000_000);
    const before = (await hist()).filter(
      (h) => h.field === "ewayIntraLimitPaise",
    ).length;
    const r = await save("owner", company({ name: "Plant Works Two" }));
    expect(r.status).toBe(200);
    const got = await fx.call("owner", "GET", "/api/company/settings");
    expect(got.json.data.ewayIntraLimitPaise).toBe(7_000_000);
    expect(
      (await hist()).filter((h) => h.field === "ewayIntraLimitPaise").length,
    ).toBe(before);
    await fx.setLimit(5_000_000);
  });

  test("BR-DSP-42 a limit of 0 or above 10,000,000,000 paise is 400", async () => {
    expect(
      (await save("owner", company({ ewayIntraLimitPaise: 0 }))).status,
    ).toBe(400);
    expect(
      (await save("owner", company({ ewayIntraLimitPaise: 10_000_000_001 })))
        .status,
    ).toBe(400);
  });

  test("BR-DSP-35 floor_supervisor cannot change the e-way limit (company.manage): 403", async () => {
    const r = await save(
      "floor_supervisor",
      company({ ewayIntraLimitPaise: 100 }),
    );
    expect(r.status).toBe(403);
    const got = await fx.call("owner", "GET", "/api/company/settings");
    expect(got.json.data.ewayIntraLimitPaise).not.toBe(100);
  });
});

describe("manual stock movement refuses the dispatch reference types (CR-INV-1, BR-DSP-12)", () => {
  test("CR-INV-1 delivery_note and delivery_note_cancel are 400 on the manual movement route and post nothing", async () => {
    const loc = await fx.mkLoc();
    const item = await fx.mkItem();
    await fx.stock(item, loc, 100);
    const before = (await fx.ledgerOfItem(item)).length;
    for (const referenceType of ["delivery_note", "delivery_note_cancel"]) {
      const r = await fx.call(
        "owner",
        "POST",
        "/api/asset/inventory/movements",
        {
          itemId: item,
          locationId: loc,
          referenceType,
          countedQty: 5,
          reason: "try",
        },
      );
      expect(r.status).toBe(400);
      const r2 = await fx.call(
        "owner",
        "POST",
        "/api/asset/inventory/movements",
        {
          itemId: item,
          locationId: loc,
          referenceType,
          qty: 5,
          unitCostPaise: 100,
          reason: "try",
        },
      );
      expect(r2.status).toBe(400);
    }
    expect((await fx.ledgerOfItem(item)).length).toBe(before);
  });

  test("CR-INV-1 the movement list can be filtered by the delivery_note reference type", async () => {
    const s = await posted({ qty: 100, transport: undefined });
    const r = await fx.call(
      "owner",
      "GET",
      `/api/asset/inventory/movements?itemId=${s.item}&referenceType=delivery_note&pageSize=100`,
    );
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(1);
    expect(r.json.data[0].quantityChange).toBe(-100);
  });
});
