import type { PlayerRow } from "../repositories/playersRepo.js";

// Hand-curated popularity priors. Names not listed default to
// `rotation`. Edit this list as players rise / fall in recognition;
// the Bayesian smoothing in leaderboardService lets accumulated votes
// override the prior over time, so over-tiered players self-correct
// from data, and under-tiered players need only ~20 votes to start
// trusting the data.
export const POPULARITY_TIERS = {
  superstar: 1320, // MVP candidates / top All-NBA tier
  star: 1280, // All-Stars + clear top-30 names
  starter: 1240, // Solid starters / household names
  rotation: 1200, // Default for any name not explicitly tiered
  bench: 1180, // Reserved; not currently used (asymmetric upside)
} as const;

const SUPERSTAR_NAMES: readonly string[] = [
  "Nikola Jokic",
  "Shai Gilgeous-Alexander",
  "Giannis Antetokounmpo",
  "Luka Doncic",
  "Jayson Tatum",
  "Anthony Edwards",
  "Victor Wembanyama",
  "Stephen Curry",
  "Kevin Durant",
  "LeBron James",
  "Joel Embiid",
];

const STAR_NAMES: readonly string[] = [
  "Cooper Flagg",
  "Devin Booker",
  "Donovan Mitchell",
  "Jaylen Brown",
  "Jalen Brunson",
  "Tyrese Haliburton",
  "Karl-Anthony Towns",
  "Bam Adebayo",
  "Trae Young",
  "Ja Morant",
  "Damian Lillard",
  "Paul George",
  "Kawhi Leonard",
  "Anthony Davis",
  "Pascal Siakam",
  "Jamal Murray",
  "DeMar DeRozan",
  "James Harden",
  "Domantas Sabonis",
  "Chet Holmgren",
  "Paolo Banchero",
  "Scottie Barnes",
  "Jalen Williams",
  "Tyrese Maxey",
  "Zion Williamson",
];

const STARTER_NAMES: readonly string[] = [
  "Brandon Miller",
  "Reed Sheppard",
  "Alperen Sengun",
  "Jalen Green",
  "Cade Cunningham",
  "Klay Thompson",
  "Russell Westbrook",
  "Kyrie Irving",
  "Bradley Beal",
  "Mikal Bridges",
  "OG Anunoby",
  "Jaren Jackson Jr.",
  "Desmond Bane",
  "LaMelo Ball",
  "RJ Barrett",
  "Andrew Wiggins",
  "Dejounte Murray",
  "Kristaps Porzingis",
  "Kyle Kuzma",
  "Jalen Suggs",
  "Franz Wagner",
  "Evan Mobley",
  "Dyson Daniels",
  "CJ McCollum",
  "Kyle Lowry",
  "Jrue Holiday",
];

// Strip diacritics so "Nikola Jokic" in this file matches the
// "Nikola Jokić" string stored in players.json without us having to
// type unicode in the source.
function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const POPULARITY_MAP = new Map<string, number>();
for (const name of SUPERSTAR_NAMES) {
  POPULARITY_MAP.set(normalizeName(name), POPULARITY_TIERS.superstar);
}
for (const name of STAR_NAMES) {
  POPULARITY_MAP.set(normalizeName(name), POPULARITY_TIERS.star);
}
for (const name of STARTER_NAMES) {
  POPULARITY_MAP.set(normalizeName(name), POPULARITY_TIERS.starter);
}

export function getPopularityPrior(
  player: PlayerRow | null | undefined,
): number {
  if (!player) return POPULARITY_TIERS.rotation;
  const name = normalizeName(`${player.first} ${player.last}`);
  return POPULARITY_MAP.get(name) ?? POPULARITY_TIERS.rotation;
}
