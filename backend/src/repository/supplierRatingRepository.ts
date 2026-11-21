import { and, eq, type SQL, sql } from "drizzle-orm";
import { db } from "../db/client";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { safeSearch } from "../lib/safe-search";
import type {
  RATING_LINES_SORT_FIELDS,
  SUPPLIER_RATING_LIST_SORT_FIELDS,
} from "../types/supplierRating.types";

// Supplier rating (BR-SRT-01..41): live SQL, no stored score. Each endpoint is
// one statement over the same CTE chain (a list or lines page is a rows
// statement plus a count statement, not one snapshot). All dates are IST
// plant days (D-022): timestamps are stored as UTC wall time.

type Dir = "asc" | "desc";
type ListSortField = (typeof SUPPLIER_RATING_LIST_SORT_FIELDS)[number];
type OnTimeSort = (typeof RATING_LINES_SORT_FIELDS.on_time)[number];
type RejectionSort = (typeof RATING_LINES_SORT_FIELDS.rejection)[number];
type PriceSort = (typeof RATING_LINES_SORT_FIELDS.price)[number];

const rowsOf = <T>(result: unknown) => result as unknown as T[];

/** Arrival timestamp of a GRN line: a NULL received_date falls back to the line's created_at. */
const arrived = (g: string, gi: string) =>
  `coalesce(${g}.received_date, ${gi}.created_at)`;
const ARRIVED = arrived("g", "gi");

/** IST plant day of a `timestamp` column. */
const IST = (col: string) =>
  `((${col} at time zone 'UTC') at time zone 'Asia/Kolkata')::date`;

// Statuses of POs that were sent to the supplier (BR-SRT-04, 16).
const COUNTED_STATUSES = sql.raw(
  "('dispatched','partial_received','fully_received','invoiced','closed')",
);

/** CTE chain, no leading `with`. `supWhere` picks the suppliers (table `supplier_master`). */
function baseCtes(today: string, supWhere: SQL) {
  return sql`
params as (
  select ${today}::date as today,
         ((${today}::date - interval '12 months')::date + 1) as wfrom
),
sup as (
  select supplier_master.id, supplier_master.name, supplier_master.is_active
  from supplier_master where ${supWhere}
),
po_lines as (
  select poi.id as po_item_id, po.id as po_id, po.po_number, po.supplier_id,
    po.status::text as status, po.short_closed, (po.status = 'cancelled') as cancelled,
    poi.item_id, poi.uom, poi.unit_price_paise as rate,
    round(poi.qty::numeric, 3) as ordered,
    ${sql.raw(IST("po.expected_delivery_date"))} as due,
    ${sql.raw(IST("po.revised_delivery_date"))} as revised,
    ${sql.raw(IST("po.closed_at"))} as closed_day,
    ${sql.raw(IST("po.cancelled_at"))} as cancel_day,
    ${sql.raw(IST("po.created_at"))} as po_date
  from sup s
  join purchase_orders po on po.supplier_id = s.id
  join purchase_order_items poi on poi.po_id = po.id
  cross join params p
  where (
      po.status in ${COUNTED_STATUSES}
      or (po.status = 'cancelled' and exists (
        select 1 from po_communications pc
        where pc.po_id = po.id and pc.type = 'po_sent' and pc.status <> 'failed'))
    )
    and (
      po.created_at >= p.wfrom - 2
      or po.expected_delivery_date >= p.wfrom - 2
      or po.closed_at >= p.wfrom - 2
      or po.cancelled_at >= p.wfrom - 2
      or exists (
        select 1 from grn_items gx join grns g2 on g2.id = gx.grn_id
        where gx.po_item_id = poi.id and ${sql.raw(arrived("g2", "gx"))} >= p.wfrom - 2)
    )
),
arr_rows as (
  select pl.po_item_id, pl.ordered,
    ${sql.raw(IST(ARRIVED))} as arr_day,
    round(gi.received_qty::numeric, 3) as q,
    sum(round(gi.received_qty::numeric, 3)) over (
      partition by pl.po_item_id order by ${sql.raw(ARRIVED)}, g.id, gi.id) as running
  from po_lines pl
  join grn_items gi on gi.po_item_id = pl.po_item_id
  join grns g on g.id = gi.grn_id and g.po_id = pl.po_id
),
arr as (
  select po_item_id, ordered, sum(q) as arrived,
    min(arr_day) filter (where running >= ordered) as completion
  from arr_rows group by po_item_id, ordered
),
jl1 as (
  select pl.*, coalesce(a.arrived, 0) as arrived, a.completion,
    case
      when pl.due is null then 'no_due_date'
      when a.completion is not null then 'complete'
      when pl.short_closed and coalesce(a.arrived, 0) < pl.ordered
           and pl.closed_day is not null then 'short_closed'
      -- BR-SRT-04 / A-42: cancelled after the due date = late; on or before = ignored
      when pl.cancelled and pl.cancel_day > pl.due then 'cancelled_after_dispatch'
      when pl.cancelled then 'ignored'
      when pl.due + 1 <= p.today then 'open_past_due'
      else 'open'
    end as state
  from po_lines pl
  left join arr a on a.po_item_id = pl.po_item_id
  cross join params p
),
jl2 as (
  select j.*,
    case j.state
      when 'complete' then j.completion
      when 'short_closed' then j.closed_day
      when 'cancelled_after_dispatch' then j.cancel_day
      when 'open_past_due' then j.due + 1
      when 'no_due_date' then coalesce(j.completion, j.closed_day, j.cancel_day, j.po_date)
    end as jdate
  from jl1 j
),
jv as (
  select j.*,
    case when j.state in ('no_due_date', 'open') then null
         when j.jdate <= j.due then 'on_time' else 'late' end as verdict,
    case when j.state = 'open_past_due' then p.today - j.due
         when j.state not in ('no_due_date', 'open') and j.jdate > j.due then j.jdate - j.due
    end as days_late
  from jl2 j cross join params p
  where j.state <> 'ignored'
),
rej_facts as (
  select gi.id as grn_item_id, g.id as grn_id, po.id as po_id, g.grn_number, po.po_number, po.supplier_id, im.sku,
    poi.uom, poi.unit_price_paise as rate,
    ${sql.raw(IST(ARRIVED))} as rday,
    round(gi.received_qty::numeric, 3) as recv,
    round(coalesce(gi.rejected_qty, 0)::numeric, 3) as rej,
    case
      when gi.qa_status in ('passed', 'failed') and not coalesce(gi.is_qa_bypassed, false) then 'decided'
      when gi.qa_status = 'waived' or coalesce(gi.is_qa_bypassed, false) then 'not_inspected'
      else 'pending'
    end as insp
  from sup s
  join purchase_orders po on po.supplier_id = s.id
  join purchase_order_items poi on poi.po_id = po.id
  join grn_items gi on gi.po_item_id = poi.id
  join grns g on g.id = gi.grn_id and g.po_id = po.id
  join item_master im on im.id = poi.item_id
  cross join params p
  where g.status <> 'draft' and ${sql.raw(ARRIVED)} >= p.wfrom - 2
),
price_facts as (
  select pl.po_item_id, pl.po_id, pl.po_number, pl.supplier_id, pl.po_date, im.sku, pl.uom,
    pl.ordered as qty, pl.rate,
    case when coalesce(im.standard_rate_paise, 0) > 0 then im.standard_rate_paise else prev.rate end as ref_rate,
    case when coalesce(im.standard_rate_paise, 0) > 0 then 'standard_rate'
         when prev.rate is not null then 'previous_po' else 'none' end as ref_source,
    case when coalesce(im.standard_rate_paise, 0) > 0 then im.uom else prev.uom end as ref_uom
  from po_lines pl
  join item_master im on im.id = pl.item_id
  cross join params p
  left join lateral (
    select p2.unit_price_paise as rate, p2.uom
    from purchase_order_items p2
    join purchase_orders o2 on o2.id = p2.po_id
    join purchase_orders o1 on o1.id = pl.po_id
    where coalesce(im.standard_rate_paise, 0) = 0
      and o2.supplier_id = pl.supplier_id and p2.item_id = pl.item_id
      and o2.status in ${COUNTED_STATUSES} and p2.unit_price_paise > 0
      and (o2.created_at, p2.id) < (o1.created_at, pl.po_item_id)
    order by o2.created_at desc, p2.id desc limit 1
  ) prev on true
  where pl.status <> 'cancelled' and pl.po_date between p.wfrom and p.today
),
pf as (
  select f.*,
    (f.ref_rate is not null and f.ref_uom = f.uom) as compared,
    case when f.ref_rate is null then 'no_reference'
         when f.ref_uom <> f.uom then 'uom_differs' end as reason
  from price_facts f
)`;
}

// ---- aggregate column lists (same list for the window and for a month) ----
const OT_COLS = sql.raw(`
  (count(*) filter (where verdict is not null))::int as ot_judged,
  (count(*) filter (where verdict = 'on_time'))::int as ot_on_time,
  (count(*) filter (where verdict = 'late'))::int as ot_late,
  (count(*) filter (where state = 'open_past_due'))::int as ot_open_late,
  (count(*) filter (where state = 'short_closed' and verdict = 'late'))::int as ot_sc_late,
  (count(*) filter (where state = 'cancelled_after_dispatch' and verdict = 'late'))::int as ot_ca_late,
  (count(*) filter (where state = 'no_due_date'))::int as ot_no_due,
  case when count(*) filter (where verdict is not null) = 0 then null
       else round((count(*) filter (where verdict = 'on_time'))::numeric * 1000
            / (count(*) filter (where verdict is not null)))::int end as ot_pct`);

const RJ_COLS = sql.raw(`
  (count(*) filter (where insp = 'decided'))::int as rj_decided,
  (count(*) filter (where insp = 'decided' and rej > 0))::int as rj_with_rejects,
  (count(*) filter (where insp = 'not_inspected'))::int as rj_not_insp,
  case when coalesce(sum(recv * rate) filter (where insp = 'decided'), 0) > 0
       then round(sum(rej * rate) filter (where insp = 'decided') * 1000
            / (sum(recv * rate) filter (where insp = 'decided')))::int end as rj_pct`);

const PR_COLS = sql.raw(`
  count(*)::int as pr_lines,
  (count(*) filter (where compared))::int as pr_compared,
  (count(*) filter (where not compared))::int as pr_not_compared,
  case when coalesce(sum(ref_rate * qty) filter (where compared), 0) > 0
       then round(sum((rate - ref_rate) * qty) filter (where compared) * 1000
            / (sum(ref_rate * qty) filter (where compared)))::int end as pr_pct`);

const scoreExpr = (withMinimum: boolean) =>
  sql.raw(`case when ot.ot_pct is not null and rj.rj_pct is not null
    ${withMinimum ? "and ot.ot_judged >= 5 and rj.rj_decided >= 5" : ""}
    then round((ot.ot_pct + 1000 - rj.rj_pct)::numeric / 20)::int end`);

// ---- window rating (list + card) ----
const WINDOW_CTES = sql`
ot as (
  select supplier_id, ${OT_COLS} from jv cross join params p
  where jdate between p.wfrom and p.today group by supplier_id
),
rj as (
  select supplier_id, ${RJ_COLS} from rej_facts cross join params p
  where rday between p.wfrom and p.today group by supplier_id
),
rj_ni as (
  select supplier_id, uom, sum(rej) as q from rej_facts cross join params p
  where insp = 'not_inspected' and rday between p.wfrom and p.today
  group by supplier_id, uom having sum(rej) > 0
),
pr as (
  select supplier_id, ${PR_COLS} from pf group by supplier_id
)`;

const RATING_SELECT = sql`
select s.id as supplier_id, s.name as supplier_name, s.is_active,
  to_char(p.wfrom, 'YYYY-MM-DD') as window_from, to_char(p.today, 'YYYY-MM-DD') as window_to,
  coalesce(ot.ot_judged, 0) as ot_judged, coalesce(ot.ot_on_time, 0) as ot_on_time,
  coalesce(ot.ot_late, 0) as ot_late, coalesce(ot.ot_open_late, 0) as ot_open_late,
  coalesce(ot.ot_sc_late, 0) as ot_sc_late, coalesce(ot.ot_ca_late, 0) as ot_ca_late,
  coalesce(ot.ot_no_due, 0) as ot_no_due, ot.ot_pct,
  coalesce(rj.rj_decided, 0) as rj_decided, coalesce(rj.rj_with_rejects, 0) as rj_with_rejects,
  coalesce(rj.rj_not_insp, 0) as rj_not_insp, rj.rj_pct,
  coalesce((select jsonb_agg(jsonb_build_object('uom', n.uom, 'qty', n.q::text) order by n.uom)
            from rj_ni n where n.supplier_id = s.id), '[]'::jsonb)::text as rj_ni_qty,
  coalesce(pr.pr_lines, 0) as pr_lines, coalesce(pr.pr_compared, 0) as pr_compared,
  coalesce(pr.pr_not_compared, 0) as pr_not_compared, pr.pr_pct,
  ${scoreExpr(true)} as score
from sup s cross join params p
left join ot on ot.supplier_id = s.id
left join rj on rj.supplier_id = s.id
left join pr on pr.supplier_id = s.id`;

export type RatingRow = {
  supplier_id: number;
  supplier_name: string;
  is_active: boolean;
  window_from: string;
  window_to: string;
  ot_judged: number;
  ot_on_time: number;
  ot_late: number;
  ot_open_late: number;
  ot_sc_late: number;
  ot_ca_late: number;
  ot_no_due: number;
  ot_pct: number | null;
  rj_decided: number;
  rj_with_rejects: number;
  rj_not_insp: number;
  rj_pct: number | null;
  rj_ni_qty: string | unknown[];
  pr_lines: number;
  pr_compared: number;
  pr_not_compared: number;
  pr_pct: number | null;
  score: number | null;
};

const LIST_SORT_COLUMN: Record<ListSortField, string> = {
  name: "supplier_name",
  score: "score",
  onTimePct: "ot_pct",
  rejectionPct: "rj_pct",
  priceVariancePct: "pr_pct",
  judgedLines: "ot_judged",
  decidedLines: "rj_decided",
};

export type TrendRow = {
  month: string;
  ot_judged: number;
  ot_pct: number | null;
  rj_decided: number;
  rj_pct: number | null;
  pr_lines: number;
  pr_pct: number | null;
  score: number | null;
};

export type OnTimeLineRow = {
  po_item_id: number;
  po_number: string;
  pr_id: number | null;
  sku: string;
  item_name: string;
  uom: string;
  ordered_qty: string;
  arrived_qty: string;
  due: string | null;
  revised: string | null;
  completion: string | null;
  judgement: string | null;
  verdict: "on_time" | "late" | null;
  days_late: number | null;
  state: string;
};

export type RejectionLineRow = {
  grn_item_id: number;
  grn_id: number;
  grn_number: string;
  po_number: string;
  pr_id: number | null;
  sku: string;
  received_date: string;
  arrived_qty: string;
  rejected_qty: string;
  uom: string;
  rate: number | string;
  rejected_value: number | string;
  arrived_value: number | string;
  inspection: string;
};

export type PriceLineRow = {
  po_item_id: number;
  po_number: string;
  pr_id: number | null;
  po_date: string;
  sku: string;
  uom: string;
  qty: string;
  rate: number | string;
  ref_rate: number | string | null;
  ref_source: string;
  variance: number | string | null;
  variance_pct: number | string | null;
  line_variance: number | string | null;
  compared: boolean;
  reason: string | null;
};

type Paging = { page: number; pageSize: number };
const offsetOf = ({ page, pageSize }: Paging) => (page - 1) * pageSize;
const dirSql = (dir: Dir) => sql.raw(dir === "asc" ? "asc" : "desc");

/**
 * Rows carry `total_count` (count(*) over ()). A page past the end has no rows,
 * so the total comes from a separate count then.
 */
async function pageOf<T>(
  result: unknown,
  paging: Paging,
  countQuery: () => SQL,
) {
  const all = rowsOf<T & { total_count?: number }>(result);
  let total = Number(all[0]?.total_count ?? 0);
  if (all.length === 0 && paging.page > 1) {
    const totals = await db.execute(countQuery());
    total = Number(rowsOf<{ total: number }>(totals)[0]?.total ?? 0);
  }
  const rows = all.map(({ total_count: _t, ...rest }) => rest);
  return { rows: rows as unknown as T[], total };
}

export const supplierRatingRepository = {
  async supplierExists(supplierId: number) {
    const [row] = await db
      .select({ id: supplierMaster.id })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, supplierId));
    return row !== undefined;
  },

  /** List: one statement over all matched suppliers, sorted in SQL, plus a plain count. */
  async list(
    today: string,
    query: Paging & {
      status: "active" | "inactive" | "all";
      q?: string | undefined;
      sortBy: ListSortField;
      sortDir: Dir;
    },
  ) {
    const conds: SQL[] = [];
    if (query.status !== "all") {
      conds.push(eq(supplierMaster.isActive, query.status === "active"));
    }
    const search = safeSearch(query.q, supplierMaster.name);
    if (search) conds.push(search);
    const where = and(...conds) ?? sql`true`;
    const column = sql.raw(LIST_SORT_COLUMN[query.sortBy]);
    const rowsQuery = sql`with ${baseCtes(today, where)}, ${WINDOW_CTES}
      select * from (${RATING_SELECT}) r
      order by ${column} ${dirSql(query.sortDir)} nulls last, supplier_id asc
      limit ${query.pageSize} offset ${offsetOf(query)}`;
    const [rows, totals] = await Promise.all([
      db.execute(rowsQuery),
      db.execute(
        sql`select count(*)::int as total from supplier_master where ${where}`,
      ),
    ]);
    return {
      rows: rowsOf<RatingRow>(rows),
      total: Number(rowsOf<{ total: number }>(totals)[0]?.total ?? 0),
    };
  },

  async card(today: string, supplierId: number) {
    const where = eq(supplierMaster.id, supplierId);
    const rows = await db.execute(
      sql`with ${baseCtes(today, where)}, ${WINDOW_CTES} ${RATING_SELECT}`,
    );
    return rowsOf<RatingRow>(rows)[0] ?? null;
  },

  /** 12 IST months (oldest first) in one statement; empty months give nulls. */
  async trend(today: string, supplierId: number) {
    const where = eq(supplierMaster.id, supplierId);
    const rows = await db.execute(sql`
      with ${baseCtes(today, where)},
      months as (
        select to_char(m, 'YYYY-MM') as mk, m::date as ms
        from params p,
          generate_series(date_trunc('month', p.today::timestamp) - interval '11 months',
                          date_trunc('month', p.today::timestamp), interval '1 month') m
      ),
      ot as (
        select to_char(jdate, 'YYYY-MM') as mk, ${OT_COLS} from jv cross join params p
        where jdate <= p.today group by 1
      ),
      rj as (
        select to_char(rday, 'YYYY-MM') as mk, ${RJ_COLS} from rej_facts cross join params p
        where rday <= p.today group by 1
      ),
      pr as (
        select to_char(po_date, 'YYYY-MM') as mk, ${PR_COLS} from pf group by 1
      )
      select m.mk as month,
        coalesce(ot.ot_judged, 0) as ot_judged, ot.ot_pct,
        coalesce(rj.rj_decided, 0) as rj_decided, rj.rj_pct,
        coalesce(pr.pr_lines, 0) as pr_lines, pr.pr_pct,
        ${scoreExpr(false)} as score
      from months m
      left join ot on ot.mk = m.mk
      left join rj on rj.mk = m.mk
      left join pr on pr.mk = m.mk
      order by m.ms`);
    return rowsOf<TrendRow>(rows);
  },

  // ---- lines ----
  async onTimeLines(
    today: string,
    supplierId: number,
    query: Paging & {
      verdict: "all" | "late" | "on_time" | "no_due_date";
      sortBy: OnTimeSort;
      sortDir: Dir;
    },
  ) {
    const sortColumn: Record<OnTimeSort, string> = {
      dueDate: "j.due",
      completionDate: "j.completion",
      daysLate: "j.days_late",
      poNumber: "j.po_number",
      itemSku: "im.sku",
    };
    const verdictFilter = {
      all: sql`j.state not in ('open')`,
      late: sql`j.verdict = 'late'`,
      on_time: sql`j.verdict = 'on_time'`,
      no_due_date: sql`j.state = 'no_due_date'`,
    }[query.verdict];
    const where = eq(supplierMaster.id, supplierId);
    const from = sql`from jv j
      join item_master im on im.id = j.item_id
      cross join params p
      where j.jdate between p.wfrom and p.today and ${verdictFilter}`;
    const rows = await db.execute(sql`with ${baseCtes(today, where)}
        select count(*) over ()::int as total_count, j.po_item_id, j.po_number, (select min(pr_i.pr_id) from purchase_order_items pr_poi join pr_po_item_links pr_l on pr_l.po_item_id = pr_poi.id join purchase_request_items pr_i on pr_i.id = pr_l.pr_item_id where pr_poi.po_id = j.po_id) as pr_id, im.sku, im.name as item_name, j.uom,
          j.ordered::text as ordered_qty, round(j.arrived, 3)::text as arrived_qty,
          to_char(j.due, 'YYYY-MM-DD') as due, to_char(j.revised, 'YYYY-MM-DD') as revised,
          to_char(j.completion, 'YYYY-MM-DD') as completion,
          to_char(case when j.state = 'no_due_date' then null else j.jdate end, 'YYYY-MM-DD') as judgement,
          j.verdict, j.days_late, j.state
        ${from}
        order by ${sql.raw(sortColumn[query.sortBy])} ${dirSql(query.sortDir)} nulls last, j.po_item_id asc
        limit ${query.pageSize} offset ${offsetOf(query)}`);
    return pageOf<OnTimeLineRow>(
      rows,
      query,
      () =>
        sql`with ${baseCtes(today, where)} select count(*)::int as total ${from}`,
    );
  },

  async rejectionLines(
    today: string,
    supplierId: number,
    query: Paging & { sortBy: RejectionSort; sortDir: Dir },
  ) {
    const sortColumn: Record<RejectionSort, string> = {
      receivedDate: "f.rday",
      grnNumber: "f.grn_number",
      rejectedValuePaise: "rejected_value",
      itemSku: "f.sku",
    };
    const where = eq(supplierMaster.id, supplierId);
    const from = sql`from rej_facts f cross join params p
      where f.rday between p.wfrom and p.today and f.insp in ('decided', 'not_inspected')`;
    const rows = await db.execute(sql`with ${baseCtes(today, where)}
        select count(*) over ()::int as total_count, f.grn_item_id, f.grn_id, f.grn_number, f.po_number, (select min(pr_i.pr_id) from purchase_order_items pr_poi join pr_po_item_links pr_l on pr_l.po_item_id = pr_poi.id join purchase_request_items pr_i on pr_i.id = pr_l.pr_item_id where pr_poi.po_id = f.po_id) as pr_id, f.sku,
          to_char(f.rday, 'YYYY-MM-DD') as received_date,
          f.recv::text as arrived_qty, f.rej::text as rejected_qty, f.uom, f.rate,
          round(f.rej * f.rate)::bigint as rejected_value,
          round(f.recv * f.rate)::bigint as arrived_value, f.insp as inspection
        ${from}
        order by ${sql.raw(sortColumn[query.sortBy])} ${dirSql(query.sortDir)} nulls last, f.grn_item_id asc
        limit ${query.pageSize} offset ${offsetOf(query)}`);
    return pageOf<RejectionLineRow>(
      rows,
      query,
      () =>
        sql`with ${baseCtes(today, where)} select count(*)::int as total ${from}`,
    );
  },

  async priceLines(
    today: string,
    supplierId: number,
    query: Paging & { sortBy: PriceSort; sortDir: Dir },
  ) {
    const sortColumn: Record<PriceSort, string> = {
      poDate: "f.po_date",
      poNumber: "f.po_number",
      variancePaise: "variance",
      itemSku: "f.sku",
    };
    const where = eq(supplierMaster.id, supplierId);
    const rows = await db.execute(sql`with ${baseCtes(today, where)}
        select count(*) over ()::int as total_count, f.po_item_id, f.po_number, (select min(pr_i.pr_id) from purchase_order_items pr_poi join pr_po_item_links pr_l on pr_l.po_item_id = pr_poi.id join purchase_request_items pr_i on pr_i.id = pr_l.pr_item_id where pr_poi.po_id = f.po_id) as pr_id, to_char(f.po_date, 'YYYY-MM-DD') as po_date,
          f.sku, f.uom, f.qty::text as qty, f.rate,
          f.ref_rate, f.ref_source,
          case when f.compared then f.rate - f.ref_rate end as variance,
          case when f.compared then round((f.rate - f.ref_rate)::numeric * 1000 / f.ref_rate)::int end as variance_pct,
          case when f.compared then round((f.rate - f.ref_rate) * f.qty)::bigint end as line_variance,
          f.compared, f.reason
        from pf f
        order by ${sql.raw(sortColumn[query.sortBy])} ${dirSql(query.sortDir)} nulls last, f.po_item_id asc
        limit ${query.pageSize} offset ${offsetOf(query)}`);
    return pageOf<PriceLineRow>(
      rows,
      query,
      () =>
        sql`with ${baseCtes(today, where)} select count(*)::int as total from pf`,
    );
  },
};
