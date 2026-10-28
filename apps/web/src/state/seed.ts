// The team itself lives in the database (seeded by the server). This is only staging:
// who is away from their desk when the office first loads, and what they're saying.
export const SEED_AWAY: Record<string, { poi: string; says?: string }> = {
  linus: { poi: 'coffee', says: 'did you miss me?' },
  maya: { poi: 'couch-1', says: 'pretending to read my notes' },
  kenji: { poi: 'table-west' },
};
