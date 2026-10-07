# Bill Splitter

A simple bill splitter for restaurant meals — built with Expo + React Native.

Each person gets their own items, shared dishes are divided among whoever ate them, tax is prefilled per US state, and tip can be a percentage or a fixed dollar amount split proportionally. You can save receipts to your phone and look back at past meals on a list or calendar.

## Features

- **Scan the receipt** — add everyone who ate, photograph the receipt, and the items are read off it. You then walk through them one at a time saying who had what (or tap several people to split it). Tax and tip printed on the receipt can be applied to the bill.
- **Per-person items** — each person has their own tab; tap a name to add what they ordered.
- **Shared items** — pick which people split a dish; the total is divided evenly among them.
- **State-aware tax** — pick your state on the Setup screen and the typical combined rate prefills. Override if you're outside the main metro.
- **Two tip modes** — flat percentage or a specific dollar amount (the dollar amount is split proportionally to each person's subtotal).
- **Receipt total verifier** — type the total from the actual receipt to check the math.
- **Recent items** — items you've added before show as quick-tap chips so you don't retype "Diet Coke" four times.
- **Quantity stepper** — add N copies of the same item in one shot.
- **Saved receipts** — optionally save a receipt with a restaurant name and notes; tag which person was you.
- **Receipt history** — list view + calendar view per month, with your monthly spend at the top.

All saved data lives on your device (AsyncStorage). The one exception is receipt scanning: if you use it, that photo is uploaded to Anthropic's Claude API to be read. Everything else — people, items, saved receipts — stays on the phone.

## Running it

```bash
npm install
cp .env.example .env.local   # then paste in an Anthropic API key
npm start
```

Then scan the QR code with Expo Go on your phone.

Receipt scanning needs an Anthropic API key from the [Claude Console](https://platform.claude.com/settings/keys) in `.env.local`. It's pay-as-you-go — there's no free tier — so a scan costs a few cents. Without one the rest of the app works normally and the scan screen tells you the key is missing. For EAS builds the key has to exist at build time too — set it as an EAS environment variable, since `.env.local` is not uploaded with the build.

## Stack

- Expo (managed workflow), React Native, TypeScript
- React Navigation (native stack)
- AsyncStorage for persistence
- react-native-calendars for the calendar view

## Project layout

```
src/
  context/        # BillContext (in-progress bill) and ReceiptsContext (saved history)
  screens/        # Setup, People, PersonItems, SharedItems, ScanReceipt, AssignItems,
                  # Summary, Receipts, ReceiptDetail
  components/     # shared UI (RecentItemsRow)
  data/           # state tax rates
  types/          # bill + scan + navigation types
  utils/          # calculate.ts — tax/tip math; parseReceipt.ts — receipt OCR
```

See [CLAUDE.md](CLAUDE.md) for a deeper architecture rundown.
