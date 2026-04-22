export type StateTaxRate = {
  code: string;
  name: string;
  rate: number;
};

// Typical combined sales tax rates (state + local) for each state's largest metro.
// These reflect what you'd actually see on a restaurant receipt — override on Setup
// screen if you're outside the default metro (e.g. NY 8.875 for NYC; upstate varies).
export const STATE_TAX_RATES: StateTaxRate[] = [
  { code: 'AL', name: 'Alabama', rate: 9.25 },         // Birmingham
  { code: 'AK', name: 'Alaska', rate: 0.0 },           // Anchorage (no sales tax)
  { code: 'AZ', name: 'Arizona', rate: 8.6 },          // Phoenix
  { code: 'AR', name: 'Arkansas', rate: 9.5 },         // Little Rock
  { code: 'CA', name: 'California', rate: 9.5 },       // Los Angeles
  { code: 'CO', name: 'Colorado', rate: 8.81 },        // Denver
  { code: 'CT', name: 'Connecticut', rate: 6.35 },     // flat statewide
  { code: 'DE', name: 'Delaware', rate: 0.0 },
  { code: 'DC', name: 'District of Columbia', rate: 10.0 }, // restaurant meals
  { code: 'FL', name: 'Florida', rate: 7.0 },          // Miami
  { code: 'GA', name: 'Georgia', rate: 8.9 },          // Atlanta
  { code: 'HI', name: 'Hawaii', rate: 4.712 },         // Honolulu (GET)
  { code: 'ID', name: 'Idaho', rate: 6.0 },            // Boise
  { code: 'IL', name: 'Illinois', rate: 10.25 },       // Chicago
  { code: 'IN', name: 'Indiana', rate: 7.0 },          // flat statewide
  { code: 'IA', name: 'Iowa', rate: 7.0 },             // Des Moines
  { code: 'KS', name: 'Kansas', rate: 7.5 },           // Wichita
  { code: 'KY', name: 'Kentucky', rate: 6.0 },         // flat statewide
  { code: 'LA', name: 'Louisiana', rate: 9.45 },       // New Orleans
  { code: 'ME', name: 'Maine', rate: 8.0 },            // prepared food / meals rate
  { code: 'MD', name: 'Maryland', rate: 6.0 },         // flat statewide
  { code: 'MA', name: 'Massachusetts', rate: 7.0 },    // Boston meals (6.25 + 0.75 local)
  { code: 'MI', name: 'Michigan', rate: 6.0 },         // flat statewide
  { code: 'MN', name: 'Minnesota', rate: 8.025 },      // Minneapolis
  { code: 'MS', name: 'Mississippi', rate: 7.0 },      // flat statewide
  { code: 'MO', name: 'Missouri', rate: 9.679 },       // St. Louis
  { code: 'MT', name: 'Montana', rate: 0.0 },
  { code: 'NE', name: 'Nebraska', rate: 7.0 },         // Omaha
  { code: 'NV', name: 'Nevada', rate: 8.375 },         // Las Vegas
  { code: 'NH', name: 'New Hampshire', rate: 9.0 },    // meals & rentals tax
  { code: 'NJ', name: 'New Jersey', rate: 6.625 },     // flat statewide
  { code: 'NM', name: 'New Mexico', rate: 7.875 },     // Albuquerque
  { code: 'NY', name: 'New York', rate: 8.875 },       // NYC (4 state + 4.5 city + 0.375 MCTD)
  { code: 'NC', name: 'North Carolina', rate: 7.25 },  // Charlotte
  { code: 'ND', name: 'North Dakota', rate: 7.5 },     // Fargo
  { code: 'OH', name: 'Ohio', rate: 7.5 },             // Cleveland
  { code: 'OK', name: 'Oklahoma', rate: 8.625 },       // Oklahoma City
  { code: 'OR', name: 'Oregon', rate: 0.0 },
  { code: 'PA', name: 'Pennsylvania', rate: 8.0 },     // Philadelphia
  { code: 'RI', name: 'Rhode Island', rate: 8.0 },     // meals tax
  { code: 'SC', name: 'South Carolina', rate: 9.0 },   // Charleston
  { code: 'SD', name: 'South Dakota', rate: 6.5 },     // Sioux Falls
  { code: 'TN', name: 'Tennessee', rate: 9.25 },       // Nashville
  { code: 'TX', name: 'Texas', rate: 8.25 },           // most major cities
  { code: 'UT', name: 'Utah', rate: 7.75 },            // Salt Lake City
  { code: 'VT', name: 'Vermont', rate: 9.0 },          // meals & rooms tax
  { code: 'VA', name: 'Virginia', rate: 6.0 },         // Richmond (incl. prepared food tax varies)
  { code: 'WA', name: 'Washington', rate: 10.25 },     // Seattle
  { code: 'WV', name: 'West Virginia', rate: 7.0 },    // Charleston
  { code: 'WI', name: 'Wisconsin', rate: 5.5 },        // Milwaukee
  { code: 'WY', name: 'Wyoming', rate: 6.0 },          // Cheyenne
];

export const getStateByCode = (code: string): StateTaxRate | undefined =>
  STATE_TAX_RATES.find((s) => s.code === code);
