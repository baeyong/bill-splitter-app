# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Expo dev server (use Expo Go to scan QR)
npx expo start         # same
npx expo install <pkg> # add a dep — preferred over `npm install` so versions match the Expo SDK
npx tsc --noEmit       # typecheck (no test or lint scripts are configured)
```

The dev loop is **Expo Go**, and keeping it that way is a live constraint — every dependency so far is either pure JS or an Expo SDK module that Expo Go already bundles. Adding a third-party native module would force everyone onto a custom dev client, so don't, without saying so explicitly.

`ios/` **is** committed, despite that. It's generated output, not hand-maintained: the [prebuild-ios workflow](.github/workflows/prebuild-ios.yml) runs `expo prebuild` on a Linux runner and pushes the result, working around an SDK 54 EAS prebuild bug (and `expo prebuild` refuses to run from Windows). Re-run that workflow by hand after any `app.json` change that affects native config — including adding a config plugin — or EAS will build stale native config. Never edit `ios/` directly.

Receipt scanning needs `EXPO_PUBLIC_ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`). Without it the app runs fine and only the scan screen complains.

## Architecture

### Stack-only navigation, no tabs

Defined in [App.tsx](App.tsx). Flow:

```
Home  ──► People ──► PersonItems
   │           ↘ SharedItems
   │           ↘ ScanReceipt ──► AssignItems ──┐
   │           ↘ Summary ◄─────────────────────┘
   │                 │
   │                 ▼
   │              Receipts ──► ReceiptDetail
   │                                │
   │                                ▼
   │                    (Edit) ──► Summary  (edit mode)
   │
   ├─► Setup           (gear icon — settings only; "Done" goes back)
   └─► Receipts        (skip-the-bill shortcut from Home)
```

`Home` is the initial route — it's the entry point with two big CTAs ("New bill" → People; "View receipts" → Receipts) and a settings gear → Setup. Setup is no longer a flow step; it's a settings screen reached only via the gear or via the People screen's "Edit" link. `RootStackParamList` in [src/types/navigation.ts](src/types/navigation.ts) is the single source of truth for routes — add new screens there and in `App.tsx`.

ReceiptDetail can re-enter Summary in **edit mode** by calling `loadFromReceipt(receipt)` (see BillContext) — Summary then shows a yellow banner and the save button calls `updateReceipt` instead of `saveReceipt`. See `editingReceiptId` and the prefill effect in [SummaryScreen](src/screens/SummaryScreen.tsx).

### Two AsyncStorage-backed contexts

Both wrap the navigator. Order matters: `BillProvider` outside, `ReceiptsProvider` inside.

- **[BillContext](src/context/BillContext.tsx)** — the *in-progress* bill. Holds people, items, shared items, tax/state prefs, and the bill's tip. **Tax/state persist** to AsyncStorage (`bill-splitter:prefs:v1`); **tip is per-bill** — defaults to 18% percent, reset to that on every `resetBill`, and lives only on `bill` (never written to AsyncStorage). The `recentItems` field on the context is **derived** (via `useMemo`) from `bill.people[*].items` + `bill.sharedItems` — there's no separate cache to manage. Items are deduped by lowercased name and sorted newest-first using the timestamp embedded in each item's id. Removing an item also removes its chip suggestion.
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

### Receipt scanning is a funnel into the normal bill model

[ScanReceiptScreen](src/screens/ScanReceiptScreen.tsx) → [AssignItemsScreen](src/screens/AssignItemsScreen.tsx) produces nothing new in the data model — it ends by creating ordinary `Item`s and `SharedItem`s. Everything downstream (calculate, Summary, saving) is untouched by this feature, and it should stay that way.

[parseReceipt.ts](src/utils/parseReceipt.ts) downsizes the photo to 1400px JPEG and sends it to Claude (`claude-opus-5-5`) through `@anthropic-ai/sdk`, using structured outputs (`output_config.format`) so the reply is guaranteed to match `RECEIPT_SCHEMA`. Things to know about it:

- **Quantity is expanded client-side.** The model returns `{name, price, quantity}` with `price` as the *unit* price; `toScannedItems` emits `quantity` separate `ScannedItem`s. That's deliberate — it's what lets two beers on one receipt line go to two different people during assignment. Don't collapse it back into a quantity field.
- **Effort is `low` on purpose.** Reading printed text is extraction, not reasoning, and the user is waiting on a spinner. Raise `EFFORT` before reaching for a different model if receipts start misreading.
- **Refusal fallback is on** (`fallbacks: 'default'` + the `server-side-fallback-2026-07-01` beta), so a safety-classifier false positive is retried on another model inside the same call instead of failing the scan. That's why it calls `client.beta.messages.create`.
- **Every object in `RECEIPT_SCHEMA` needs `additionalProperties: false`** — structured outputs rejects the schema otherwise.

Scan types live in [src/types/scan.ts](src/types/scan.ts) separately from `bill.ts` because none of them are persisted — a scan is transient, converted, and dropped.

`applyScannedItems` on BillContext commits the whole assignment in **one** `setBill`. A scan is routinely 30+ lines and calling `addItem` per line would re-render that many times. One `personId` becomes an `Item`, two or more becomes a `SharedItem` — that mapping is the only place the two item kinds are chosen automatically, so keep it in sync with what the manual screens do.

`setTaxFromAmount` back-computes `taxRatePercent` from the receipt's printed tax so it fits the existing percent-based model. It persists like any other rate override (see the prefs note above), which is why the toggle that triggers it is labelled as replacing the saved rate rather than applied silently.

**This is the only feature that sends anything off the device.** The README says so explicitly; if you change what's uploaded, change that line too.

### State tax rates

[src/data/stateTaxRates.ts](src/data/stateTaxRates.ts) holds combined state + main-metro rates. Selecting a state on Setup pre-fills the rate; the user can override. When DC/HI/etc. behave specially (DC uses the restaurant meals rate, HI uses GET), the comments in that file explain why — preserve them.

### Keyboard handling

All scroll/list containers use `keyboardShouldPersistTaps="handled"` and `keyboardDismissMode="on-drag"`. Buttons fire on the first tap with the keyboard up; scrolling dismisses. New screens with inputs should set both. Numeric keyboards on iOS have no Done key, so this is the user's primary dismiss path — don't regress it.

### Safe-area bottoms

Screens with a fixed bottom bar use `useSafeAreaInsets()` and add `insets.bottom` to the bar's `paddingBottom`. iPhones with a home indicator otherwise tuck the bar under it. Currently in [PersonItemsScreen](src/screens/PersonItemsScreen.tsx) and [PeopleScreen](src/screens/PeopleScreen.tsx) — apply the same pattern to any new screen with a fixed footer.

### Deployment

Expo Go for development, EAS Build + TestFlight for production. Default to the Expo managed workflow — don't introduce third-party native modules without a clear reason (see Commands above for why).

`EXPO_PUBLIC_*` vars are inlined into the bundle at build time, so `EXPO_PUBLIC_ANTHROPIC_API_KEY` must be set as an EAS environment variable for production builds — `.env.local` is not uploaded. It also means the key ships inside the IPA and is extractable, and unlike a Google key it **can't be restricted to the app's bundle ID** — anyone who pulls it out can spend on the account. Mitigation is a dedicated Claude Console workspace with a low spend limit. If this app ever gets distributed beyond a small group, that key needs to move behind a proxy.
