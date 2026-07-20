---
name: ui-form-standards
description: "Use when writing a form, adding validation, using shadcn components, wiring toast notifications, handling loading or disabled states, styling with Tailwind, using cn(), or composing shadcn Form/Input/Button/Select/Sheet. Triggers: form, validation, zod schema, react hook form, toast, loading state, disabled button, shadcn, input styling, label, modal, sheet, dialog, skeleton, error message, isPending, useMutation form, submit button. DO NOT USE for folder placement, data fetching, or store design."
argument-hint: "Describe the form or UI component you are building."
---

# UI & Form Standards

## Owns

- shadcn form wiring (RHF + Zod + `Form`, `FormField`, `FormItem`, `FormControl`, `FormMessage`)
- floating-label inputs via `FloatingLabelInput` from `@/components/ui/floating-label` (this repo's default text field — replaces separate `FormLabel` + `Input`)
- consistent field height: every `FormItem` uses `className="min-h-19"` so inline `FormMessage` errors don't shift layout
- Zod schema source and type inference
- Toast placement — mutation hook, not form component
- Loading / disabled state via `useMutation`
- Tailwind styling conventions and `cn()` usage
- shadcn component composition

## Never Touches

- Where the form file lives → `structure-guard`
- What data function the form calls → `client-data-state`
- PWA or offline behavior → `pwa-runtime-ux` (shelved)

## ⚠️ Form Rules (this repo)

| Rule                             | Detail                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Zod schemas                      | From `@/types/[feature].ts` — never inline, never redefined in the component.                                                 |
| `isPending`                      | From `useMutation` — no separate `useState` for loading.                                                                      |
| Text fields                      | `FloatingLabelInput` (`id` + `label` props) — not raw `Input` + `FormLabel`.                                                  |
| Field spacing                    | Each `FormItem` gets `className="min-h-19"` to reserve space for `FormMessage`.                                               |
| Toasts                           | In the mutation's `onSuccess`/`onError` (in `lib/api/[feature]/queries.ts`) — not in the form component.                      |
| Response contract                | API may return HTTP 200 with `{ success: false, message }`; check `result.success` in `onSuccess` and toast `result.message`. |
| Form submit                      | `mutate(data, { onSuccess: () => onClose?.() })` — form itself stays dumb.                                                    |
| No `useTransition` for mutations | `useMutation` handles pending state.                                                                                          |
| No `packages/validators` imports | That path doesn't exist in this repo — schemas are local to `src/types/`.                                                     |

## shadcn `ui/` components in this repo

`bunx shadcn@latest add <component>` hangs silently against this repo's custom "radix-mira"
registry style — don't rely on it. When a new primitive is needed, hand-author it in
`components/ui/` matching the conventions already used in `button.tsx`, `input.tsx`,
`label.tsx` (import `radix-ui`'s unified package, e.g. `import { Label as LabelPrimitive } from "radix-ui"`,
and `cn()` from `@/lib/utils`). `form.tsx` was added this way — use it as the reference.

## Key Checklist

- [ ] Zod schema imported from `@/types/[feature]` — `import { loginSchema, type LoginInput } from "@/types/auth"`
- [ ] `useForm` with `zodResolver` and typed `defaultValues`
- [ ] Mutation from `lib/api/[feature]/queries.ts` — `const loginMutation = useLoginMutation()`
- [ ] Submit button `disabled={mutation.isPending}` with a pending label (e.g. `"Signing in..."`)
- [ ] Every `FormItem` has `className="min-h-19"` to reserve space for `FormMessage`
- [ ] Text fields use `FloatingLabelInput` (`id` + `label`) — not raw `Input` + `FormLabel`
- [ ] `FormMessage` under every `FormField` for inline Zod errors
- [ ] No inline `useState` mirroring form field values — RHF owns field state

## Canonical Form Pattern

Real implementation: `src/components/pages/login/LoginForm.tsx` (called from
`src/components/views/login/LoginView.tsx`). Shape:

```tsx
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { FloatingLabelInput } from "@/components/ui/floating-label";
import { useLoginMutation } from "@/lib/api/auth/queries";
import { type LoginInput, loginSchema } from "@/types/auth";

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const loginMutation = useLoginMutation(); // toast handled inside the mutation hook

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(data: LoginInput) {
    loginMutation.mutate(data, { onSuccess });
    // Do NOT add a toast here — the mutation hook owns that
  }

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="min-h-19">
              <FormControl>
                <FloatingLabelInput
                  {...field}
                  id="email"
                  label="Email"
                  type="email"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          className="w-full"
          type="submit"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </Form>
  );
}
```

## Toast Rules

- Sonner only — `import { toast } from "sonner"`. No custom toast components.
- Toasts belong in `useMutation`'s `onSuccess`/`onError` — not in form submit handlers.
- Handle the two-shape response: backend can return HTTP 200 with `{ success: false, message }`.
  In `onSuccess`, guard on `result.success` first — toast `result.message` on false and return
  before running success side-effects. `onError` only covers rejected/thrown requests (network,
  timeout, non-2xx via `ApiClientError`).
- Prefer the server `message`: `toast.success(result.message || "Signed in")` /
  `toast.error(result.message || "Login failed")`.
- Provider lives in `src/lib/Providers.tsx` only (`<Toaster />`) — all providers centralize there.
- Messages: short, sentence case, user-friendly.

## Styling Rules

- Tailwind only. No CSS modules.
- Conditional classes: always `cn()` from `@/lib/utils`.
- Semantic tokens first (`bg-background`, `text-foreground`, `text-muted-foreground`).
- Icons: `@tabler/icons-react` only (this repo's configured icon library — not lucide-react).
- Mobile-first: `sm:`, `md:`, `lg:` breakpoints.

## Handoff

- Form shell done → `client-data-state` for the mutation hook.
- File needs placing → `structure-guard`.
