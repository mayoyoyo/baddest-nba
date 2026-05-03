export type Conference = "East" | "West";

const EAST: ReadonlySet<string> = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND",
  "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS",
]);

const WEST: ReadonlySet<string> = new Set([
  "DAL", "DEN", "GSW", "HOU", "LAC", "LAL", "MEM", "MIN",
  "NOP", "OKC", "PHX", "POR", "SAC", "SAS", "UTA",
]);

export function getConference(
  team: string | null | undefined,
): Conference | null {
  if (!team) return null;
  if (EAST.has(team)) return "East";
  if (WEST.has(team)) return "West";
  return null;
}
