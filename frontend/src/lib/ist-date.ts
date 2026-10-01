const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** Today's calendar date (YYYY-MM-DD) in the plant's zone (IST), whatever the browser zone. */
export function istTodayIso() {
	return IST_DAY.format(new Date());
}

/** A plain YYYY-MM-DD date as an IST-midnight timestamp, for the API. */
export function istMidnightIso(date: string) {
	return `${date}T00:00:00+05:30`;
}
