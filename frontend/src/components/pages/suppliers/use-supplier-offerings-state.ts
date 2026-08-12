import { useState } from "react";

import type { SupplierItem, SupplierService } from "@/types/suppliers";

export type OfferingsTab = "items" | "services";

export type OfferingsDialogState = {
	open: boolean;
	tab: OfferingsTab;
	item?: SupplierItem;
	service?: SupplierService;
};

export function useSupplierOfferingsState() {
	const [offeringsTab, setOfferingsTab] = useState<OfferingsTab>("items");
	const [itemsPage, setItemsPage] = useState(1);
	const [servicesPage, setServicesPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [offeringsSearch, setOfferingsSearch] = useState("");
	const [dialogState, setDialogState] = useState<OfferingsDialogState>({
		open: false,
		tab: "items",
	});

	function onTabChange(value: OfferingsTab) {
		setOfferingsTab(value);
		setOfferingsSearch("");
		setItemsPage(1);
		setServicesPage(1);
	}

	function onSearchChange(value: string) {
		setOfferingsSearch(value);
		setItemsPage(1);
		setServicesPage(1);
	}

	function onPageSizeChange(nextPageSize: number) {
		setPageSize(nextPageSize);
		setItemsPage(1);
		setServicesPage(1);
	}

	function openCreateDialog() {
		setDialogState({
			open: true,
			tab: offeringsTab,
			item: undefined,
			service: undefined,
		});
	}

	function openEditItemDialog(item: SupplierItem) {
		setDialogState({
			open: true,
			tab: "items",
			item,
			service: undefined,
		});
	}

	function openEditServiceDialog(service: SupplierService) {
		setDialogState({
			open: true,
			tab: "services",
			service,
			item: undefined,
		});
	}

	function onDialogOpenChange(open: boolean) {
		setDialogState((prev) => ({
			...prev,
			open,
			item: open ? prev.item : undefined,
			service: open ? prev.service : undefined,
		}));
	}

	return {
		offeringsTab,
		itemsPage,
		servicesPage,
		pageSize,
		offeringsSearch,
		dialogState,
		setItemsPage,
		setServicesPage,
		onTabChange,
		onSearchChange,
		onPageSizeChange,
		openCreateDialog,
		openEditItemDialog,
		openEditServiceDialog,
		onDialogOpenChange,
	};
}
