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
							<TableHead className="w-8">#</TableHead>
							<TableHead>Item</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead className="text-right">Delivered</TableHead>
							<TableHead className="text-right">Open</TableHead>
							<TableHead className="text-right">Unit price</TableHead>
							<TableHead className="text-right">GST %</TableHead>
							<TableHead>Delivery</TableHead>
							<TableHead className="text-right">Value</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{so.lines.map((line) => {
							const d = qtyDecimals(line.uom);
							return (
								<TableRow key={line.id}>
									<TableCell className="tabular-nums">{line.lineNo}</TableCell>
									<TableCell>
										<span className="font-mono">{line.sku}</span>{" "}
										<span className="text-muted-foreground">
											{line.itemName}
										</span>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQty(line.qty, line.uom, d)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQty(line.deliveredQty, null, d)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQty(line.openQty, null, d)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.unitPricePaise)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{line.gstPercent}
									</TableCell>
									<TableCell>{formatDate(line.deliveryDate)}</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.lineAmountPaise)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell colSpan={8} className="text-right font-medium">
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
