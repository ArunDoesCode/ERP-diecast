export type PaginationProps = {
	page: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	onPageSizeChange?: (pageSize: number) => void;
};

// Contract stub (BR-DS-17): no logic yet.
export function Pagination(_props: PaginationProps) {
	return null;
}
