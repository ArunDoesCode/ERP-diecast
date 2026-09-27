// "use client";

// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Switch } from "@/components/ui/switch";
// import type { ApprovalPolicyDetails as ApprovalPolicyDetailsType } from "@/types/approval";
// import { toAmountLabel } from "./approval-policy-helpers";

// type ApprovalPolicyDetailsProps = {
// 	selectedPolicyId: number | undefined;
// 	isLoading: boolean;
// 	policy: ApprovalPolicyDetailsType | undefined;
// 	isToggling: boolean;
// 	onToggleActive: (isActive: boolean) => void;
// 	onEdit: () => void;
// };

// export function ApprovalPolicyDetails({
// 	selectedPolicyId,
// 	isLoading,
// 	policy,
// 	isToggling,
// 	onToggleActive,
// 	onEdit,
// }: ApprovalPolicyDetailsProps) {
// 	const chain = policy?.approvalChain ?? [];

// 	return (
//     <Card>
//       <CardHeader className="gap-2">
//         <CardTitle>Policy Details</CardTitle>
//       </CardHeader>
//       <CardContent>
//         {!selectedPolicyId ? (
//           <p className="text-sm text-muted-foreground">No policy selected.</p>
//         ) : isLoading ? (
//           <p className="text-sm text-muted-foreground">Loading details...</p>
//         ) : policy ? (
//           <div className="space-y-4">
//             <div className="flex flex-wrap items-center gap-3">
//               <Badge variant="outline">{policy.docType.toUpperCase()}</Badge>
//               <h3 className="text-base font-medium text-foreground">
//                 {policy.name}
// 									</h3>
//             </div>

//             <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
//               <p>
//                 <span className="text-muted-foreground">Priority:</span>{" "}
//                 {policy.priority}
//               </p>
//               <p>
//                 <span className="text-muted-foreground">Amount rule:</span>{" "}
//                 {toAmountLabel(policy.minAmountPaise, policy.maxAmountPaise)}
//               </p>
//               <p>
//                 <span className="text-muted-foreground">Auto approve:</span>{" "}
//                 {policy.autoApprove ? "Yes" : "No"}
//               </p>
//             </div>

//             <div className="flex items-center gap-2">
//               <Button type="button" variant="outline" onClick={onEdit}>
//                 Edit Policy
//               </Button>
//             </div>

//             {policy.description ? (
//               <p className="text-muted-foreground">{policy.description}</p>
//             ) : null}

//             <div className="space-y-2">
//               <p className="font-medium text-foreground">Approval chain</p>
//               {policy.autoApprove ? (
//                 <p className="text-muted-foreground">
//                   No chain. Auto-approved.
//                 </p>
//               ) : chain.length > 0 ? (
//                 <ul className="space-y-1">
//                   {chain.map((level) => (
//                     <li key={level.level} className="text-muted-foreground">
//                       L{level.level}:{" "}
//                       {level.approverType === "role"
//                         ? level.role
//                         : `employee #${level.employeeId}`}
//                     </li>
//                   ))}
//                 </ul>
//               ) : (
//                 <p className="text-muted-foreground">No chain levels found.</p>
//               )}
//             </div>
//           </div>
//         ) : (
//           <p className="text-sm text-muted-foreground">
//             Unable to load selected policy details.
//           </p>
//         )}
//       </CardContent>
//     </Card>
//   );
// }
