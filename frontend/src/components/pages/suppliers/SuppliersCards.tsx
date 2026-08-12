"use client";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Supplier } from "@/types/suppliers";

type SuppliersCardsProps = {
	suppliers: Supplier[];
	isLoading: boolean;
};

const SKELETON_CARDS = 6;

export function SuppliersCards({ suppliers, isLoading }: SuppliersCardsProps) {
	const router = useRouter();

	if (isLoading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: SKELETON_CARDS }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
					<Card key={`supplier-skeleton-${index}`}>
						<CardHeader className="space-y-2">
							<Skeleton className="h-5 w-2/3" />
							<Skeleton className="h-4 w-1/2" />
						</CardHeader>
						<CardContent className="space-y-3">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-5/6" />
							<Skeleton className="h-9 w-full" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (suppliers.length === 0) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					No suppliers found.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{suppliers.map((supplier) => (
				<Card key={supplier.id}>
					<CardHeader className="space-y-2">
						<div className="flex items-start justify-between gap-2">
							<CardTitle>
								<button
									type="button"
									onClick={() => router.push(`/suppliers/${supplier.id}`)}
									className="cursor-pointer text-left text-base hover:underline"
								>
									{supplier.name}
								</button>
							</CardTitle>
							<Badge variant={supplier.isActive ? "default" : "outline"}>
								{supplier.isActive ? "Active" : "Inactive"}
							</Badge>
						</div>
						<p className="text-xs text-muted-foreground">
							Contact: {supplier.contactPerson || "N/A"}
						</p>
					</CardHeader>

					<CardContent className="space-y-3">
						<div className="flex flex-col gap-1 text-xs text-muted-foreground">
							<span>Phone: {supplier.phone || "N/A"}</span>
							<span>Email: {supplier.email || "N/A"}</span>
						</div>

						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">Rating</span>
							<Badge variant="secondary">N/A</Badge>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
