import { TextStyle } from 'react-native';

// The receipt look: white paper on a warm grey counter, black ink, and one
// green reserved for stamps and "it adds up" signals. Mockups: the "Split It
// Polish" design canvas, page "Receipt style (full app)".
export const colors = {
  ground: '#EDEBE4', // behind the paper
  paper: '#FFFFFF',
  ink: '#1B1B18',
  muted: '#5E5D57', // secondary text — 4.5:1 on paper and on ground
  faint: '#8A887F', // icons and dashed outlines only, too light for text
  rule: '#BDB9AD', // dashed dividers and dotted leaders
  hairline: '#F0EEE8', // between rows on paper
  shadow: '#D9D6CC', // the 1px edge under a sheet of paper
  photo: '#E3E0D7', // placeholder behind images
  stamp: '#23805F',
  danger: '#B3261E',
  warn: '#8A5A00', // "not assigned" notes
} as const;

// Loaded in App.tsx; until then the splash screen stays up, so these names are
// always available to screens.
export const fonts = {
  mono: 'IBMPlexMono_400Regular',
  monoSemi: 'IBMPlexMono_600SemiBold',
  monoBold: 'IBMPlexMono_700Bold',
  sans: 'IBMPlexSans_400Regular',
  sansSemi: 'IBMPlexSans_600SemiBold',
  sansBold: 'IBMPlexSans_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

// Phone-width column, centred, so iPad gets a readable receipt rather than a
// stretched one. Summary and All items use two columns instead (see the iPad
// mockup).
export const MAX_COLUMN_WIDTH = 600;

/**
 * Text presets. Typewriter mono is for names, numbers and labels; anything
 * people read as a sentence (hints, explanations, what they type) is sans.
 * Capitals come from `textTransform`, never from the string, so VoiceOver reads
 * "Alice" rather than spelling A-L-I-C-E.
 */
export const text = {
  label: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.monoBold,
    fontSize: 20,
    letterSpacing: 2,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  line: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  lineBold: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  amount: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
} satisfies Record<string, TextStyle>;

// Shared with the receipts calendar so both pickers look the same.
export const calendarTheme = {
  calendarBackground: colors.paper,
  dayTextColor: colors.ink,
  textDisabledColor: colors.faint,
  monthTextColor: colors.ink,
  arrowColor: colors.ink,
  todayTextColor: colors.stamp,
  selectedDayBackgroundColor: colors.ink,
  selectedDayTextColor: colors.paper,
  dotColor: colors.stamp,
  selectedDotColor: colors.paper,
  textSectionTitleColor: colors.muted,
  textDayFontFamily: fonts.mono,
  textMonthFontFamily: fonts.monoBold,
  textDayHeaderFontFamily: fonts.mono,
  textMonthFontSize: 15,
};
