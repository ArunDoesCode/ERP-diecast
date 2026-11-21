"use client";

import { DnField } from "@/components/pages/delivery-notes/DnField";
import {
	distanceError,
	ewayNoError,
	groupEway,
	normaliseEway,
	normaliseTransporterId,
	normaliseVehicle,
	type TransportDraft,
	transporterIdError,
	vehicleError,
} from "@/components/pages/delivery-notes/dn-format";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DN_MODES, type DnMode } from "@/types/delivery-note";

/** Transport and e-way fields of the note form. Fields marked * are needed to post when the e-way bill is needed. */
export function DnTransportFields({
	draft,
	onChange,
	needed,
	disabled,
	showErrors,
	serverErrors,
}: {
	draft: TransportDraft;
	onChange: (patch: Partial<TransportDraft>) => void;
	needed: boolean;
	disabled: boolean;
	showErrors: boolean;
	serverErrors: Record<string, string>;
}) {
	const star = needed ? " *" : "";
	const required = needed ? "Required to post" : undefined;
	const road = draft.mode === "road";
	const err = (key: string, own: string | null) =>
		serverErrors[key] ??
		(draft[key as keyof TransportDraft] || showErrors ? own : null);

	return (
		<div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 min-[1100px]:grid-cols-3">
			<DnField id="dn-mode" label={`Mode${star}`} hint={required}>
				<Select
					value={draft.mode}
					disabled={disabled}
					onValueChange={(value) => onChange({ mode: value as DnMode })}
				>
					<SelectTrigger id="dn-mode" className="h-10 w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{DN_MODES.map((mode) => (
							<SelectItem key={mode.value} value={mode.value}>
								{mode.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</DnField>
			{road ? (
				<>
					<DnField
						id="dn-vehicle"
						label={`Vehicle no.${star}`}
						hint={needed ? "Vehicle no. or transporter ID" : undefined}
						error={err("vehicleNo", vehicleError(draft.vehicleNo))}
					>
						<Input
							id="dn-vehicle"
							className="h-10 font-mono"
							value={draft.vehicleNo}
							maxLength={20}
							disabled={disabled}
							onChange={(event) => onChange({ vehicleNo: event.target.value })}
							onBlur={() =>
								onChange({ vehicleNo: normaliseVehicle(draft.vehicleNo) })
							}
						/>
					</DnField>
					<DnField
						id="dn-transporter-id"
						label="Transporter ID"
						error={err(
							"transporterId",
							transporterIdError(draft.transporterId),
						)}
					>
						<Input
							id="dn-transporter-id"
							className="h-10 font-mono"
							value={draft.transporterId}
							maxLength={20}
							disabled={disabled}
							onChange={(event) =>
								onChange({ transporterId: event.target.value })
							}
							onBlur={() =>
								onChange({
									transporterId: normaliseTransporterId(draft.transporterId),
								})
							}
						/>
					</DnField>
				</>
			) : (
				<>
					<DnField
						id="dn-doc-no"
						label={`Transport doc no.${star}`}
						error={serverErrors.transportDocNo}
					>
						<Input
							id="dn-doc-no"
							className="h-10"
							value={draft.transportDocNo}
							maxLength={30}
							disabled={disabled}
							onChange={(event) =>
								onChange({ transportDocNo: event.target.value })
							}
						/>
					</DnField>
					<DnField
						id="dn-doc-date"
						label={`Transport doc date${star}`}
						error={serverErrors.transportDocDate}
					>
						<Input
							id="dn-doc-date"
							type="date"
							className="h-10"
							value={draft.transportDocDate}
							disabled={disabled}
							onChange={(event) =>
								onChange({ transportDocDate: event.target.value })
							}
						/>
					</DnField>
				</>
			)}
			<DnField
				id="dn-transport-name"
				label="Transport name"
				error={serverErrors.transporterName}
			>
				<Input
					id="dn-transport-name"
					className="h-10"
					value={draft.transporterName}
					maxLength={100}
					disabled={disabled}
					onChange={(event) =>
						onChange({ transporterName: event.target.value })
					}
				/>
			</DnField>
			<DnField
				id="dn-distance"
				label={`Distance km${star}`}
				hint={required}
				error={err("distanceKm", distanceError(draft.distanceKm))}
			>
				<Input
					id="dn-distance"
					className="h-10 text-right tabular-nums"
					inputMode="numeric"
					value={draft.distanceKm}
					disabled={disabled}
					onChange={(event) => onChange({ distanceKm: event.target.value })}
				/>
			</DnField>
			<DnField
				id="dn-eway-no"
				label={`E-way bill no.${star}`}
				hint={required}
				error={err("ewayBillNo", ewayNoError(draft.ewayBillNo))}
			>
				<Input
					id="dn-eway-no"
					className="h-10 font-mono"
					inputMode="numeric"
					value={draft.ewayBillNo}
					maxLength={14}
					disabled={disabled}
					onChange={(event) => onChange({ ewayBillNo: event.target.value })}
					onBlur={() =>
						onChange({
							ewayBillNo: groupEway(normaliseEway(draft.ewayBillNo)).replace(
								/^–$/,
								"",
							),
						})
					}
				/>
			</DnField>
			<DnField
				id="dn-eway-date"
				label={`E-way bill date${star}`}
				hint={required}
				error={serverErrors.ewayBillDate}
			>
				<Input
					id="dn-eway-date"
					type="date"
					className="h-10"
					value={draft.ewayBillDate}
					disabled={disabled}
					onChange={(event) => onChange({ ewayBillDate: event.target.value })}
				/>
			</DnField>
		</div>
	);
}
