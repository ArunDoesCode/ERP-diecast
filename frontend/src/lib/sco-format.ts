export function formatDaysLeft(daysLeft: number) {
	if (daysLeft < 0) return `${Math.abs(daysLeft)} days overdue`;
	if (daysLeft === 0) return "Due today";
	return `${daysLeft} days left`;
}
