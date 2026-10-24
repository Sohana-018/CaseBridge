# CaseBridge: Planted Overlap Ground Truth

This document records the exact ground truth pairs planted into the synthetic dataset.
Labels are defined by actual scenario design, never derived from similarity or heuristic algorithms.

## Summary
- Total Institutions: 25
- Total Cases: 200
- True Overlaps (Related): 30
- Near-Misses (Same institution, different bureau, unrelated issue): 30
- Trap Pairs (Different institution, highly similar wording): 10

## 1. True Overlaps (`related`)

| Case A | Case B | Institution | Planted Rationale |
|---|---|---|---|
| `PG-2026-00104` | `RB-2026-00219` | `DEMO-1042` | PRD central demo scenario: PGRC grievance and RB regulatory inquiry about mechanical faculty cadre ratio |
| `PG-2026-00501` | `RO-2026-00501` | `DEMO-1002` | Same institution (DEMO-1002), different bureaus (PGRC & RO), related topic: 'Computer Science unapproved visiting faculty' |
| `OC-2026-00501` | `RO-2026-00502` | `DEMO-1003` | Same institution (DEMO-1003), different bureaus (RO & OC), related topic: 'Biometric attendance evasion' |
| `OC-2026-00502` | `RB-2026-00501` | `DEMO-1004` | Same institution (DEMO-1004), different bureaus (RB & OC), related topic: '7th Pay Commission arrears non-payment' |
| `PG-2026-00502` | `RB-2026-00502` | `DEMO-1005` | Same institution (DEMO-1005), different bureaus (PGRC & RB), related topic: 'Electrical department faculty shortage' |
| `RB-2026-00503` | `RO-2026-00503` | `DEMO-1006` | Same institution (DEMO-1006), different bureaus (RO & RB), related topic: 'Fire safety and structural NOC missing' |
| `PG-2026-00503` | `RB-2026-00504` | `DEMO-1007` | Same institution (DEMO-1007), different bureaus (RB & PGRC), related topic: 'Hostel lift and electrical hazards' |
| `PG-2026-00504` | `RO-2026-00504` | `DEMO-1008` | Same institution (DEMO-1008), different bureaus (PGRC & RO), related topic: 'Deficient pharmacy testing laboratories' |
| `OC-2026-00503` | `RO-2026-00505` | `DEMO-1009` | Same institution (DEMO-1009), different bureaus (RO & OC), related topic: 'Civil engineering lab equipment breakdown' |
| `OC-2026-00504` | `RB-2026-00505` | `DEMO-1010` | Same institution (DEMO-1010), different bureaus (RB & OC), related topic: 'Library digital journal subscription lapse' |
| `PG-2026-00505` | `RB-2026-00506` | `DEMO-1011` | Same institution (DEMO-1011), different bureaus (PGRC & RB), related topic: 'Capitation fee retention upon withdrawal' |
| `RB-2026-00507` | `RO-2026-00506` | `DEMO-1012` | Same institution (DEMO-1012), different bureaus (RO & RB), related topic: 'Hostel caution deposit withholding' |
| `PG-2026-00506` | `RB-2026-00508` | `DEMO-1013` | Same institution (DEMO-1013), different bureaus (RB & PGRC), related topic: 'Cancelled entrance examination fee refund' |
| `PG-2026-00507` | `RO-2026-00507` | `DEMO-1014` | Same institution (DEMO-1014), different bureaus (PGRC & RO), related topic: 'Arbitrary bus and transport fee forfeiture' |
| `OC-2026-00505` | `RO-2026-00508` | `DEMO-1015` | Same institution (DEMO-1015), different bureaus (RO & OC), related topic: 'Excess tuition fee overcharge' |
| `OC-2026-00506` | `RB-2026-00509` | `DEMO-1016` | Same institution (DEMO-1016), different bureaus (RB & OC), related topic: 'Management quota merit violation' |
| `PG-2026-00508` | `RB-2026-00510` | `DEMO-1017` | Same institution (DEMO-1017), different bureaus (PGRC & RB), related topic: 'Over-intake beyond sanctioned strength' |
| `RB-2026-00511` | `RO-2026-00509` | `DEMO-1018` | Same institution (DEMO-1018), different bureaus (RO & RB), related topic: 'Reserved category seat diversion' |
| `PG-2026-00509` | `RB-2026-00512` | `DEMO-1019` | Same institution (DEMO-1019), different bureaus (RB & PGRC), related topic: 'Sports quota document forgery' |
| `PG-2026-00510` | `RO-2026-00510` | `DEMO-1020` | Same institution (DEMO-1020), different bureaus (PGRC & RO), related topic: 'NRI quota commercialization' |
| `OC-2026-00507` | `RO-2026-00511` | `DEMO-1021` | Same institution (DEMO-1021), different bureaus (RO & OC), related topic: 'Unapproved evening shift programs' |
| `OC-2026-00508` | `RB-2026-00513` | `DEMO-1022` | Same institution (DEMO-1022), different bureaus (RB & OC), related topic: 'Off-campus study center without approval' |
| `PG-2026-00511` | `RB-2026-00514` | `DEMO-1023` | Same institution (DEMO-1023), different bureaus (PGRC & RB), related topic: 'Lapse of mandatory NBA accreditation claim' |
| `RB-2026-00515` | `RO-2026-00512` | `DEMO-1024` | Same institution (DEMO-1024), different bureaus (RO & RB), related topic: 'AI and Data Science unapproved branch introduction' |
| `PG-2026-00512` | `RB-2026-00516` | `DEMO-1001` | Same institution (DEMO-1001), different bureaus (RB & PGRC), related topic: 'Failure to submit mandatory annual compliance' |
| `PG-2026-00513` | `RO-2026-00513` | `DEMO-1002` | Same institution (DEMO-1002), different bureaus (PGRC & RO), related topic: 'Revaluation result deliberate delay' |
| `OC-2026-00509` | `RO-2026-00514` | `DEMO-1003` | Same institution (DEMO-1003), different bureaus (RO & OC), related topic: 'Mass practical exam marks manipulation' |
| `OC-2026-00510` | `RB-2026-00517` | `DEMO-1004` | Same institution (DEMO-1004), different bureaus (RB & OC), related topic: 'Withholding degrees for disputed dues' |
| `PG-2026-00514` | `RB-2026-00518` | `DEMO-1005` | Same institution (DEMO-1005), different bureaus (PGRC & RB), related topic: 'Paper leakage and exam center tampering' |
| `RB-2026-00519` | `RO-2026-00515` | `DEMO-1006` | Same institution (DEMO-1006), different bureaus (RO & RB), related topic: 'Erratic internal assessment score compilation' |

## 2. Near-Misses (`not_related` - Same Institution, Different Topic)

| Case A | Case B | Institution | Planted Rationale |
|---|---|---|---|
| `OC-2026-00511` | `RO-2026-00516` | `DEMO-1042` | Same institution (DEMO-1042), different bureaus (RO & OC), but unrelated issues: 'Mechanical faculty cadre ratio deficiency' vs 'Hostel caution deposit withholding' |
| `OC-2026-00512` | `RB-2026-00520` | `DEMO-1001` | Same institution (DEMO-1001), different bureaus (RB & OC), but unrelated issues: 'Computer Science unapproved visiting faculty' vs 'Cancelled entrance examination fee refund' |
| `PG-2026-00515` | `RB-2026-00521` | `DEMO-1002` | Same institution (DEMO-1002), different bureaus (PGRC & RB), but unrelated issues: 'Biometric attendance evasion' vs 'Arbitrary bus and transport fee forfeiture' |
| `RB-2026-00522` | `RO-2026-00517` | `DEMO-1003` | Same institution (DEMO-1003), different bureaus (RO & RB), but unrelated issues: '7th Pay Commission arrears non-payment' vs 'Excess tuition fee overcharge' |
| `PG-2026-00516` | `RB-2026-00523` | `DEMO-1004` | Same institution (DEMO-1004), different bureaus (RB & PGRC), but unrelated issues: 'Electrical department faculty shortage' vs 'Management quota merit violation' |
| `PG-2026-00517` | `RO-2026-00518` | `DEMO-1005` | Same institution (DEMO-1005), different bureaus (PGRC & RO), but unrelated issues: 'Fire safety and structural NOC missing' vs 'Over-intake beyond sanctioned strength' |
| `OC-2026-00513` | `RO-2026-00519` | `DEMO-1006` | Same institution (DEMO-1006), different bureaus (RO & OC), but unrelated issues: 'Hostel lift and electrical hazards' vs 'Reserved category seat diversion' |
| `OC-2026-00514` | `RB-2026-00524` | `DEMO-1007` | Same institution (DEMO-1007), different bureaus (RB & OC), but unrelated issues: 'Deficient pharmacy testing laboratories' vs 'Sports quota document forgery' |
| `PG-2026-00518` | `RB-2026-00525` | `DEMO-1008` | Same institution (DEMO-1008), different bureaus (PGRC & RB), but unrelated issues: 'Civil engineering lab equipment breakdown' vs 'NRI quota commercialization' |
| `RB-2026-00526` | `RO-2026-00520` | `DEMO-1009` | Same institution (DEMO-1009), different bureaus (RO & RB), but unrelated issues: 'Library digital journal subscription lapse' vs 'Unapproved evening shift programs' |
| `PG-2026-00519` | `RB-2026-00527` | `DEMO-1010` | Same institution (DEMO-1010), different bureaus (RB & PGRC), but unrelated issues: 'Capitation fee retention upon withdrawal' vs 'Off-campus study center without approval' |
| `PG-2026-00520` | `RO-2026-00521` | `DEMO-1011` | Same institution (DEMO-1011), different bureaus (PGRC & RO), but unrelated issues: 'Hostel caution deposit withholding' vs 'Lapse of mandatory NBA accreditation claim' |
| `OC-2026-00515` | `RO-2026-00522` | `DEMO-1012` | Same institution (DEMO-1012), different bureaus (RO & OC), but unrelated issues: 'Cancelled entrance examination fee refund' vs 'AI and Data Science unapproved branch introduction' |
| `OC-2026-00516` | `RB-2026-00528` | `DEMO-1013` | Same institution (DEMO-1013), different bureaus (RB & OC), but unrelated issues: 'Arbitrary bus and transport fee forfeiture' vs 'Failure to submit mandatory annual compliance' |
| `PG-2026-00521` | `RB-2026-00529` | `DEMO-1014` | Same institution (DEMO-1014), different bureaus (PGRC & RB), but unrelated issues: 'Excess tuition fee overcharge' vs 'Revaluation result deliberate delay' |
| `RB-2026-00530` | `RO-2026-00523` | `DEMO-1015` | Same institution (DEMO-1015), different bureaus (RO & RB), but unrelated issues: 'Management quota merit violation' vs 'Mass practical exam marks manipulation' |
| `PG-2026-00522` | `RB-2026-00531` | `DEMO-1016` | Same institution (DEMO-1016), different bureaus (RB & PGRC), but unrelated issues: 'Over-intake beyond sanctioned strength' vs 'Withholding degrees for disputed dues' |
| `PG-2026-00523` | `RO-2026-00524` | `DEMO-1017` | Same institution (DEMO-1017), different bureaus (PGRC & RO), but unrelated issues: 'Reserved category seat diversion' vs 'Paper leakage and exam center tampering' |
| `OC-2026-00517` | `RO-2026-00525` | `DEMO-1018` | Same institution (DEMO-1018), different bureaus (RO & OC), but unrelated issues: 'Sports quota document forgery' vs 'Erratic internal assessment score compilation' |
| `OC-2026-00518` | `RB-2026-00532` | `DEMO-1019` | Same institution (DEMO-1019), different bureaus (RB & OC), but unrelated issues: 'NRI quota commercialization' vs 'Mechanical faculty cadre ratio deficiency' |
| `PG-2026-00524` | `RB-2026-00533` | `DEMO-1020` | Same institution (DEMO-1020), different bureaus (PGRC & RB), but unrelated issues: 'Unapproved evening shift programs' vs 'Computer Science unapproved visiting faculty' |
| `RB-2026-00534` | `RO-2026-00526` | `DEMO-1021` | Same institution (DEMO-1021), different bureaus (RO & RB), but unrelated issues: 'Off-campus study center without approval' vs 'Biometric attendance evasion' |
| `PG-2026-00525` | `RB-2026-00535` | `DEMO-1022` | Same institution (DEMO-1022), different bureaus (RB & PGRC), but unrelated issues: 'Lapse of mandatory NBA accreditation claim' vs '7th Pay Commission arrears non-payment' |
| `PG-2026-00526` | `RO-2026-00527` | `DEMO-1023` | Same institution (DEMO-1023), different bureaus (PGRC & RO), but unrelated issues: 'AI and Data Science unapproved branch introduction' vs 'Electrical department faculty shortage' |
| `OC-2026-00519` | `RO-2026-00528` | `DEMO-1024` | Same institution (DEMO-1024), different bureaus (RO & OC), but unrelated issues: 'Failure to submit mandatory annual compliance' vs 'Fire safety and structural NOC missing' |
| `OC-2026-00520` | `RB-2026-00536` | `DEMO-1042` | Same institution (DEMO-1042), different bureaus (RB & OC), but unrelated issues: 'Revaluation result deliberate delay' vs 'Hostel lift and electrical hazards' |
| `PG-2026-00527` | `RB-2026-00537` | `DEMO-1001` | Same institution (DEMO-1001), different bureaus (PGRC & RB), but unrelated issues: 'Mass practical exam marks manipulation' vs 'Deficient pharmacy testing laboratories' |
| `RB-2026-00538` | `RO-2026-00529` | `DEMO-1002` | Same institution (DEMO-1002), different bureaus (RO & RB), but unrelated issues: 'Withholding degrees for disputed dues' vs 'Civil engineering lab equipment breakdown' |
| `PG-2026-00528` | `RB-2026-00539` | `DEMO-1003` | Same institution (DEMO-1003), different bureaus (RB & PGRC), but unrelated issues: 'Paper leakage and exam center tampering' vs 'Library digital journal subscription lapse' |
| `PG-2026-00529` | `RO-2026-00530` | `DEMO-1004` | Same institution (DEMO-1004), different bureaus (PGRC & RO), but unrelated issues: 'Erratic internal assessment score compilation' vs 'Capitation fee retention upon withdrawal' |

## 3. Trap Pairs (`not_related` - Different Institutions, Similar Text)

| Case A | Case B | Institution A | Institution B | Planted Rationale |
|---|---|---|---|---|
| `PG-2026-00530` | `RB-2026-00540` | `DEMO-1042` | `DEMO-1007` | Trap pair: identical wording ('Fire safety and structural NOC missing'), but distinct institutions (DEMO-1042 vs DEMO-1007) |
| `PG-2026-00531` | `RB-2026-00541` | `DEMO-1001` | `DEMO-1008` | Trap pair: identical wording ('Hostel lift and electrical hazards'), but distinct institutions (DEMO-1001 vs DEMO-1008) |
| `PG-2026-00532` | `RB-2026-00542` | `DEMO-1002` | `DEMO-1009` | Trap pair: identical wording ('Deficient pharmacy testing laboratories'), but distinct institutions (DEMO-1002 vs DEMO-1009) |
| `PG-2026-00533` | `RB-2026-00543` | `DEMO-1003` | `DEMO-1010` | Trap pair: identical wording ('Civil engineering lab equipment breakdown'), but distinct institutions (DEMO-1003 vs DEMO-1010) |
| `PG-2026-00534` | `RB-2026-00544` | `DEMO-1004` | `DEMO-1011` | Trap pair: identical wording ('Library digital journal subscription lapse'), but distinct institutions (DEMO-1004 vs DEMO-1011) |
| `PG-2026-00535` | `RB-2026-00545` | `DEMO-1005` | `DEMO-1012` | Trap pair: identical wording ('Capitation fee retention upon withdrawal'), but distinct institutions (DEMO-1005 vs DEMO-1012) |
| `PG-2026-00536` | `RB-2026-00546` | `DEMO-1006` | `DEMO-1013` | Trap pair: identical wording ('Hostel caution deposit withholding'), but distinct institutions (DEMO-1006 vs DEMO-1013) |
| `PG-2026-00537` | `RB-2026-00547` | `DEMO-1007` | `DEMO-1014` | Trap pair: identical wording ('Cancelled entrance examination fee refund'), but distinct institutions (DEMO-1007 vs DEMO-1014) |
| `PG-2026-00538` | `RB-2026-00548` | `DEMO-1008` | `DEMO-1015` | Trap pair: identical wording ('Arbitrary bus and transport fee forfeiture'), but distinct institutions (DEMO-1008 vs DEMO-1015) |
| `PG-2026-00539` | `RB-2026-00549` | `DEMO-1009` | `DEMO-1016` | Trap pair: identical wording ('Excess tuition fee overcharge'), but distinct institutions (DEMO-1009 vs DEMO-1016) |
