// Mock data placeholders for later phases (Section 6 & 10 of PRD)
export const mockInstitutions = [
  {
    id: 1,
    permanent_id: "DEMO-1042",
    name: "Example Institute of Technology (demo)",
    region: "South",
    state: "Karnataka",
    type: "Engineering",
  },
];

export const mockCases = [
  {
    id: 1,
    case_no: "PG-2026-00104",
    institution_id: 1,
    bureau: "PGRC",
    category: "faculty",
    status: "under_process",
  },
  {
    id: 2,
    case_no: "RB-2026-00219",
    institution_id: 1,
    bureau: "RB",
    category: "infrastructure",
    status: "pending",
  },
];
