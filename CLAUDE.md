# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Expo dev server (use Expo Go to scan QR)
npx expo start         # same
npx expo install <pkg> # add a dep — preferred over `npm install` so versions match the Expo SDK
npx tsc --noEmit       # typecheck (no test or lint scripts are configured)
```

This is an Expo managed workflow project — there is no native iOS/Android source. `npx expo run:ios|android` are not part of the dev loop unless the user has set up a custom dev client.

## Architecture

### Stack-only navigation, no tabs

Defined in [App.tsx](App.tsx). Flow:

```
Setup → People → PersonItems
              ↘ SharedItems
              ↘ Summary → Receipts → ReceiptDetail
                        (Setup also links directly to Receipts)
```

`RootStackParamList` in [src/types/navigation.ts](src/types/navigation.ts) is the single source of truth for routes — add new screens there and in `App.tsx`.

### Two AsyncStorage-backed contexts

Both wrap the navigator. Order matters: `BillProvider` outside, `ReceiptsProvider` inside.

- **[BillContext](src/context/BillContext.tsx)** — the *in-progress* bill. Holds people, items, shared items, tax/tip prefs, and the cross-screen `recentItems` autocomplete cache. `resetBill` clears people/items but keeps tax/tip prefs. Storage keys: `bill-splitter:prefs:v1`, `bill-splitter:recent-items:v1`.
- **[ReceiptsContext](src/context/ReceiptsContext.tsx)** — *saved* receipts and the global owner name. `saveReceipt` takes a `SavedReceipt` minus `id`/`createdAt` and prepends it to the list. Storage keys: `bill-splitter:receipts:v1`, `bill-splitter:owner-name:v1`.

When bumping a storage schema, change the `:vN` suffix rather than mutating in place — old installs still have the old shape.

### `SavedReceipt` is a snapshot

[src/types/bill.ts](src/types/bill.ts) — a `SavedReceipt` embeds the entire `Bill` plus the computed `breakdown` and grand totals at save time. **Never recompute historical receipts from current tax/tip settings** — those settings change, and historical receipts must not. `ReceiptDetailScreen` reads totals straight off the receipt; only the live `SummaryScreen` calls `calculateBreakdown`.

### Owner identification by name match

`ownerName` is a single global string. On each new bill, [SummaryScreen](src/screens/SummaryScreen.tsx) tries to find a `Person` whose name matches `ownerName` (case-insensitive, trimmed) and pre-selects them in the save form. When the user saves a receipt, the picked person's name overwrites the global `ownerName`. Past receipts store `ownerPersonId` against their own snapshotted people list, so renaming the user later doesn't break old receipts.

The "Your spend this month" total in [ReceiptsScreen](src/screens/ReceiptsScreen.tsx) and the "Your share" line in [ReceiptDetailScreen](src/screens/ReceiptDetailScreen.tsx) both come from `receipt.breakdown.find(b => b.personId === receipt.ownerPersonId).total` — they intentionally show $0 / "you weren't tagged" when no owner was set on that receipt rather than guessing.

### Tip math has two modes

[src/utils/calculate.ts](src/utils/calculate.ts) — when `bill.tipMode === 'percent'`, each person's tip is `subtotal * (tipValue / 100)`. When `'amount'`, the dollar tip is split *proportionally to each person's share of the global subtotal*, not evenly. Tax is always `subtotal * taxRate` per person. Don't change this without thinking about both modes.

### Shared items are split evenly among selected `personIds`

A `SharedItem` carries a `totalPrice` and an array of `personIds`. The per-person share is `totalPrice / personIds.length`. When people are removed via `setPeople`, `BillContext` also prunes the removed ids out of every shared item's `personIds` — keep that invariant if you touch shared-item logic.

### State tax rates

[src/data/stateTaxRates.ts](src/data/stateTaxRates.ts) holds combined state + main-metro rates. Selecting a state on Setup pre-fills the rate; the user can override. When DC/HI/etc. behave specially (DC uses the restaurant meals rate, HI uses GET), the comments in that file explain why — preserve them.

### Keyboard handling

All scroll/list containers use `keyboardShouldPersistTaps="handled"` and `keyboardDismissMode="on-drag"`. Buttons fire on the first tap with the keyboard up; scrolling dismisses. New screens with inputs should set both. Numeric keyboards on iOS have no Done key, so this is the user's primary dismiss path — don't regress it.

### Safe-area bottoms

Screens with a fixed bottom bar use `useSafeAreaInsets()` and add `insets.bottom` to the bar's `paddingBottom`. iPhones with a home indicator otherwise tuck the bar under it. Currently in [PersonItemsScreen](src/screens/PersonItemsScreen.tsx) and [PeopleScreen](src/screens/PeopleScreen.tsx) — apply the same pattern to any new screen with a fixed footer.

### Deployment

Expo Go for development, Render + TestFlight for production. Default to the Expo managed workflow — don't introduce native modules without a clear reason.
