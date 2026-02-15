# Test Report

Generated: 2026-02-14T22:01:15.825Z

## Cases
- Data integrity test: **PASS**
  - Condition: every Tier A investor has source link + activity marker.
- Risk test: **PASS**
  - Condition: no unresolved legal-risk profile inside Tier A.
- Check-size test: **PASS**
  - Condition: Tier A includes at least 1 lead + at least 4 anchor/follower roles.
- Channel test: **PASS**
  - Condition: each Tier A investor has at least one non-manual first touch path.
- Conversion simulation test: **PASS**
  - Assumption: pessimistic funnel = 10% meetings, 20% soft commits from meetings.
  - Computed: A+B investors = 36, meetings = 3, soft commits target = 1, lead-capable investors (>= $500k max check) = 9.
