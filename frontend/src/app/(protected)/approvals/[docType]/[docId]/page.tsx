import { ApprovalPreviewPageView } from "@/components/views/approval/ApprovalPreviewPageView";

export default async function ApprovalPreviewPage({
	params,
}: {
	params: Promise<{ docType: string; docId: string }>;
}) {
	const { docType, docId } = await params;
	return <ApprovalPreviewPageView docType={docType} docId={docId} />;
}
