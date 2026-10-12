# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Expo dev server (use Expo Go to scan QR)
npx expo start         # same
npx expo install <pkg> # add a dep — preferred over `npm install` so versions match the Expo SDK
npx tsc --noEmit       # typecheck (no lint script is configured)
npm test               # Jest (jest-expo): pure logic + BillContext via renderHook
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
   │           ↘ AllItems   (also from Summary)
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

ReceiptDetail can re-enter Summary in **edit mode** by calling `loadFromReceipt(receipt)` (see BillContext) — Summary then shows a yellow banner and the save button calls `updateReceipt` instead of `saveReceipt`. See `editingReceiptId` and the prefill effect in [SummaryScreen](src/screens/SummaryScreen.tsx). Every exit from edit mode (Save, Cancel, back arrow, swipe) goes through one `usePreventRemove` handler that asks before discarding unsaved edits and resets the bill once Summary unmounts — so an edited receipt never leaks into the next new bill.

Saving a *new* receipt resets the stack to `Home → Receipts → ReceiptDetail` and clears the bill. Until then, an unsaved bill stays in memory and Home offers "Continue bill" rather than reopening it as new.

**`navigate()` pushes in React Navigation 7** — it does not go back to a screen already lower in the stack. Use `popTo` / `goBack` / `reset` when the intent is "return to".

### Two AsyncStorage-backed contexts

Both wrap the navigator. Order matters: `BillProvider` outside, `ReceiptsProvider` inside.

- **[BillContext](src/context/BillContext.tsx)** — the *in-progress* bill. Holds people, items, shared items, tax/state prefs, and the bill's tip. **Tax/state persist** to AsyncStorage (`bill-splitter:prefs:v1`) via a separate `prefs` state — changes made while editing a saved receipt apply to that receipt only and never become the default; **tip is per-bill** — defaults to 18% percent, reset to that on every `resetBill`, and lives only on `bill` (never written to AsyncStorage). The `recentItems` field on the context is **derived** (via `useMemo`) from `bill.people[*].items` + `bill.sharedItems` — there's no separate cache to manage. Items are deduped by lowercased name and sorted newest-first using the timestamp embedded in each item's id. Removing an item also removes its chip suggestion.
- **[ReceiptsContext](src/context/ReceiptsContext.tsx)** — *saved* receipts and the global owner name. `saveReceipt` takes a `SavedReceipt` minus `id`/`createdAt` and prepends it to the list. Storage keys: `bill-splitter:receipts:v1`, `bill-splitter:owner-name:v1`.

When bumping a storage schema, change the `:vN` suffix rather than mutating in place — old installs still have the old shape.

### `SavedReceipt` is a snapshot

[src/types/bill.ts](src/types/bill.ts) — a `SavedReceipt` embeds the entire `Bill` plus the computed `breakdown` and grand totals at save time. **Never recompute historical receipts from current tax/tip settings** — those settings change, and historical receipts must not. `ReceiptDetailScreen` reads totals straight off the receipt; only the live `SummaryScreen` calls `calculateBreakdown`.

### Owner identification by name match

`ownerName` is a single global string. On each new bill, [SummaryScreen](src/screens/SummaryScreen.tsx) tries to find a `Person` whose name matches `ownerName` (case-insensitive, trimmed) and pre-selects them in the save form. When the user saves a receipt, the picked person's name overwrites the global `ownerName`. Past receipts store `ownerPersonId` against their own snapshotted people list, so renaming the user later doesn't break old receipts.

The "Your spend this month" total in [ReceiptsScreen](src/screens/ReceiptsScreen.tsx) and the "Your share" line in [ReceiptDetailScreen](src/screens/ReceiptDetailScreen.tsx) both come from `receipt.breakdown.find(b => b.personId === receipt.ownerPersonId).total` — they intentionally show $0 / "you weren't tagged" when no owner was set on that receipt rather than guessing.

### Tip and tax each have two modes

[src/utils/calculate.ts](src/utils/calculate.ts) — when `bill.tipMode === 'percent'`, each person's tip is `subtotal * (tipValue / 100)`. When `'amount'`, the dollar tip is split *proportionally to each person's share of the global subtotal*, not evenly. Tax works the same way: `taxMode` `'percent'` (the default, and what any bill without the field means) is `subtotal * taxRate`; `'amount'` splits `taxAmount` dollars by share, so a receipt's printed tax is matched to the cent. Don't change this without thinking about all four combinations. Each column (shared share, tax, tip) is rounded with `roundPreservingSum`, so a person's line adds up and the people add up to the grand total — a $10 dish shared three ways is $3.34 / $3.33 / $3.33, with ties going to whoever is listed first.

### Shared items are split evenly among selected `personIds`

A `SharedItem` carries a `totalPrice` and an array of `personIds`. The per-person share is `totalPrice / personIds.length`. When people are removed via `setPeople`, `BillContext` also prunes the removed ids out of every shared item's `personIds` — keep that invariant if you touch shared-item logic.

### Receipt scanning is a funnel into the normal bill model

[ScanReceiptScreen](src/screens/ScanReceiptScreen.tsx) → [AssignItemsScreen](src/screens/AssignItemsScreen.tsx) ends by creating ordinary `Item`s and `SharedItem`s, so `calculate` and the per-person Summary work exactly as for a hand-entered bill — keep it that way. The one addition is for *display*: each unit carries an optional `lineId`, and `bill.scan` keeps the receipt's lines (skipped ones too) and printed totals, so [AllItemsScreen](src/screens/AllItemsScreen.tsx) can show the bill laid out like the paper receipt. Both are optional and ignored by `calculate`; older bills without them fall back to grouping items by name + price.

[parseReceipt.ts](src/utils/parseReceipt.ts) downsizes the photo to 1400px JPEG and sends it to Claude (`claude-haiku-5-5`) through `@anthropic-ai/sdk`, using structured outputs (`output_config.format`) so the reply is guaranteed to match `RECEIPT_SCHEMA`. Things to know about it:

- **A receipt line stays one `ScannedItem` with a `quantity`.** `price` is the *unit* price. AssignItems shows "3 × Soda" as one card and lets the user hand units out per person ("Alice 2, Bob 1"), or switch to sharing the whole line evenly. Only at commit is each unit expanded into its own entry — the same shape the manual quantity stepper produces — so nothing downstream knows about quantity.
- **Haiku on purpose, for cost.** It's ~0.1¢ a scan versus ~2–4¢ on Opus; the user reviews every line on AssignItems and All items checks the total against the receipt, which is the safety net for misreads. Moving up to Sonnet/Opus was judged too expensive — don't switch models without asking.
- **Effort is `low` on purpose.** Reading printed text is extraction, not reasoning, and the user is waiting on a spinner. Haiku's default is `medium`; raise `EFFORT` before reaching for a different model if receipts start misreading.
- **No refusal fallback.** Haiku 5.5 has no server-side fallback (`fallbacks` would be ignored or 400), so a safety-classifier decline surfaces as a retryable error. It uses the plain `client.messages.create`.
- **Every object in `RECEIPT_SCHEMA` needs `additionalProperties: false`** — structured outputs rejects the schema otherwise.
- **[metro.config.js](metro.config.js) forces the SDK's CommonJS build.** The ESM build has a circular import that crashes dev builds at startup (`Cannot read property 'BetaToolRunner' of undefined`) when React Refresh reads its exports mid-cycle. Don't remove the override without re-testing in Expo Go.

Scan types live in [src/types/scan.ts](src/types/scan.ts) separately from `bill.ts` because none of them are persisted — a scan is transient, converted, and dropped.

The photo and result live on BillContext as `pendingScan` (memory only), not in ScanReceiptScreen's state, so backing out to add a person doesn't throw away a result that cost an API call. It's cleared by `applyScannedItems`, `resetBill` and `loadFromReceipt`; picking a new photo over an existing result asks first. It also carries `progress` — everything done on AssignItems (current line, picks, unit counts, skips, edits) — which AssignItems mirrors on every change and restores on mount, so backing out mid-assignment resumes rather than restarting.

`applyScannedItems` on BillContext commits the whole assignment in **one** `setBill`. A scan is routinely 30+ lines and calling `addItem` per line would re-render that many times. One `personId` becomes an `Item`, two or more becomes a `SharedItem` — that mapping lives in `foldEntries` and is the only place the two item kinds are chosen automatically, so keep it in sync with what the manual screens do.

[receiptRows.ts](src/utils/receiptRows.ts) folds units back into receipt lines — from the bill (`rowsFromBill`) or from in-progress assignment (`rowsFromProgress`) — and [ReceiptView](src/components/ReceiptView.tsx) renders them, for both All items and AssignItems' "See all" panel. Edits go through `changeLine`, which swaps every unit of a line (and corrects `bill.scan`'s copy of it) in one update. The photo outlives `pendingScan` as `scanPhotoUri`, memory only — it's never saved with a receipt.

`applyReceiptTax` puts the receipt's printed tax on the bill as an exact dollar amount (`taxMode: 'amount'`). It used to back-compute a rate from tax ÷ subtotal, which went wrong whenever the printed subtotal included comps and missed by cents from rounding. It applies to **this bill only**. Summary edits the bill's tax (% or $) through `setBillTax`, also bill-only; Settings edits `savedTax` (the default) and flags a rate that differs from the state's with a Reset link. Only Settings ever writes the saved default.

The prompt defines "subtotal" as after comps and item discounts (receipts often print it above the comp lines), and folds gratuity / service charge into "tip", so the printed figures line up with what the bill can represent.

**This is the only feature that sends anything off the device.** The README says so explicitly; if you change what's uploaded, change that line too.

### State tax rates

[src/data/stateTaxRates.ts](src/data/stateTaxRates.ts) holds combined state + main-metro rates. Selecting a state on Setup pre-fills the rate; the user can override. When DC/HI/etc. behave specially (DC uses the restaurant meals rate, HI uses GET), the comments in that file explain why — preserve them.

### Typed numbers and names

Never `parseFloat` user input — it reads "4,50" (comma-decimal keypads) as 4 and "12abc" as 12. Use [money.ts](src/utils/money.ts): `parseAmount` for tip/tax/totals, `parsePrice` for item prices (also enforces the $10,000-per-item cap), and `priceError` for the inline warning. Add buttons stay disabled until input is valid rather than failing silently. Name inputs use `MAX_PERSON_NAME` / `MAX_ITEM_NAME` as `maxLength`. An empty tip box means no tip.

### Tests

`npm test` runs Jest via `jest-expo`. Pure logic lives in `src/utils` and is tested directly; BillContext is tested through `renderHook` with the AsyncStorage jest mock. Screens aren't unit-tested, so logic worth testing gets pulled out of them — that's why AssignItems' commit step lives in [assignProgress.ts](src/utils/assignProgress.ts). `tsconfig.json` lists `"types": ["jest"]` because TS 6 no longer picks up `@types` packages automatically.

### Keyboard handling

All scroll/list containers use `keyboardShouldPersistTaps="handled"` and `keyboardDismissMode="on-drag"`. Buttons fire on the first tap with the keyboard up; scrolling dismisses. New screens with inputs should set both. Numeric keyboards on iOS have no Done key, so this is the user's primary dismiss path — don't regress it.

### Safe-area bottoms

Screens with a fixed bottom bar use `useSafeAreaInsets()` and add `insets.bottom` to the bar's `paddingBottom`. iPhones with a home indicator otherwise tuck the bar under it. Currently in [PersonItemsScreen](src/screens/PersonItemsScreen.tsx), [PeopleScreen](src/screens/PeopleScreen.tsx), [ScanReceiptScreen](src/screens/ScanReceiptScreen.tsx), [AssignItemsScreen](src/screens/AssignItemsScreen.tsx) and [AllItemsScreen](src/screens/AllItemsScreen.tsx) — apply the same pattern to any new screen with a fixed footer.

### Deployment

Expo Go for development, EAS Build + TestFlight for production. Default to the Expo managed workflow — don't introduce third-party native modules without a clear reason (see Commands above for why).

`EXPO_PUBLIC_*` vars are inlined into the bundle at build time, so `EXPO_PUBLIC_ANTHROPIC_API_KEY` must be set as an EAS environment variable for production builds — `.env.local` is not uploaded. It also means the key ships inside the IPA and is extractable, and unlike a Google key it **can't be restricted to the app's bundle ID** — anyone who pulls it out can spend on the account. Mitigation is a dedicated Claude Console workspace with a low spend limit. If this app ever gets distributed beyond a small group, that key needs to move behind a proxy.
