import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { qtyDecimals, type SoDetail } from "@/types/sale-order";

export function SoLinesCard({ so }: { so: SoDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Lines</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Item</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead className="text-right">Delivered / open</TableHead>
							<TableHead className="text-right">Unit price</TableHead>
							<TableHead className="text-right">Value</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{so.lines.map((line) => {
							const d = qtyDecimals(line.uom);
							return (
								<TableRow key={line.id}>
									<TableCell className="whitespace-normal">
										<div>
											<span className="text-muted-foreground tabular-nums">
												{line.lineNo}.
											</span>{" "}
											<span className="font-mono">{line.sku}</span>
										</div>
										<div className="text-muted-foreground">{line.itemName}</div>
										<div className="text-[13px] text-muted-foreground">
											Delivery {formatDate(line.deliveryDate)}
										</div>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQty(line.qty, line.uom, d)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQty(line.deliveredQty, null, d)} /{" "}
										{formatQty(line.openQty, null, d)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										<div>{formatMoney(line.unitPricePaise)}</div>
										<div className="text-[13px] text-muted-foreground">
											GST {line.gstPercent}%
										</div>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.lineAmountPaise)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell colSpan={4} className="text-right font-medium">
								SO value
							</TableCell>
							<TableCell className="text-right font-bold tabular-nums">
								{formatMoney(so.totalAmountPaise)}
							</TableCell>
						</TableRow>
					</TableFooter>
				</Table>
			</CardContent>
		</Card>
	);
}
