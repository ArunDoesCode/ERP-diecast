import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	AwardPayload,
	AwardResult,
	Comparison,
	DataResponse,
	PagedResponse,
	PrLineRow,
	PrLinesParams,
	QuoteBody,
	QuoteCreatePayload,
	QuoteDetails,
	ReasonPayload,
	RfqCreatePayload,
	RfqDetails,
	RfqHeader,
	RfqListParams,
	RfqListRow,
	RfqPrint,
	RfqSaved,
	RfqUpdatePayload,
} from "@/types/rfq";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

type Empty = Record<string, never>;

export function getPrLines(params?: PrLinesParams) {
	return api.get<PagedResponse<PrLineRow>>(
		`${API_ROUTES.rfq.prLines}${toQueryString(params)}`,
	);
}

export function getRfqs(params?: RfqListParams) {
	return api.get<PagedResponse<RfqListRow>>(
		`${API_ROUTES.rfq.list}${toQueryString(params)}`,
	);
}

export function getRfq(id: number) {
	return api.get<DataResponse<RfqDetails>>(API_ROUTES.rfq.detail(id));
}

export function createRfq(payload: RfqCreatePayload) {
	return api.post<DataResponse<RfqSaved>, RfqCreatePayload>(
		API_ROUTES.rfq.create,
		payload,
	);
}

export function updateRfq(payload: RfqUpdatePayload) {
	return api.patch<DataResponse<RfqSaved>, RfqUpdatePayload>(
		API_ROUTES.rfq.update,
		payload,
	);
}

export function sendRfq(id: number) {
	return api.post<DataResponse<RfqHeader>, Empty>(API_ROUTES.rfq.send(id), {});
}

export function cancelRfq(id: number, payload: ReasonPayload) {
	return api.post<DataResponse<RfqHeader>, ReasonPayload>(
		API_ROUTES.rfq.cancel(id),
		payload,
	);
}

export function closeRfq(id: number, payload: ReasonPayload) {
	return api.post<DataResponse<RfqHeader>, ReasonPayload>(
		API_ROUTES.rfq.close(id),
		payload,
	);
}

export function getRfqPrint(id: number) {
	return api.get<DataResponse<RfqPrint>>(API_ROUTES.rfq.print(id));
}

export function getQuote(quoteId: number) {
	return api.get<DataResponse<QuoteDetails>>(API_ROUTES.rfq.quote(quoteId));
}

export function createQuote(rfqId: number, payload: QuoteCreatePayload) {
	return api.post<DataResponse<QuoteDetails>, QuoteCreatePayload>(
		API_ROUTES.rfq.createQuote(rfqId),
		payload,
	);
}

export function updateQuote(quoteId: number, payload: QuoteBody) {
	return api.patch<DataResponse<QuoteDetails>, QuoteBody>(
		API_ROUTES.rfq.quote(quoteId),
		payload,
	);
}

export function submitQuote(quoteId: number) {
	return api.post<DataResponse<QuoteDetails>, Empty>(
		API_ROUTES.rfq.submitQuote(quoteId),
		{},
	);
}

export function cancelQuote(quoteId: number, payload: ReasonPayload) {
	return api.post<DataResponse<QuoteDetails>, ReasonPayload>(
		API_ROUTES.rfq.cancelQuote(quoteId),
		payload,
	);
}

export function getComparison(id: number) {
	return api.get<DataResponse<Comparison>>(API_ROUTES.rfq.comparison(id));
}

export function awardRfq(id: number, payload: AwardPayload) {
	return api.post<DataResponse<AwardResult>, AwardPayload>(
		API_ROUTES.rfq.award(id),
		payload,
	);
}
