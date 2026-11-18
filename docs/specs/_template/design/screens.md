# <Module> — screens

> Written by ui-ux-designer from `../spec.md` and `api.md`. Checked by design-reviewer before freeze.
> Patterns, components and tokens come from the `design-system` skill
> (`frontend/.claude/skills/design-system/SKILL.md`) — never invented here. Max 200 lines.

## Screen list
| Screen | Route | Pattern | Picture |
|---|---|---|---|
| <name> | `/<module>` | list | `screens/<screen>.png` |

One block per screen:

### <Screen name>
- **Purpose:** one line — who uses it, to do what.
- **Pattern:** list | detail | form | dashboard.
- **Fields:** name · source (`api.md` endpoint + field) · format (date, money, quantity + unit).
- **Actions:** label · permission key · what it calls · confirm dialog yes/no · rule id.
- **States:** empty (text + one action) · loading · error (text + retry) · no permission.
- **Permissions:** key to open the screen; which fields or actions hide for which key.
- **Picture:** `screens/<screen>.png` (mock screenshot) or the wireframe below.

```
+--------------------------------------------------+
| <Title>                              [ Action ]  |
| filter: [status v] [search........]              |
| No. | Date | Party | Qty | Status                |
+--------------------------------------------------+
```

## Choices made
Design choices not asked of the owner. spec-analyst moves these rows into `../assumptions.md`.
| Question | Choice | Source |
|---|---|---|
