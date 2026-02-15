# Data Contracts

## InvestorRecord
- `id`: number
- `name`: string
- `geo`: string
- `thesis_tags`: string
- `check_range`: string
- `source_type`: `media_high | community_medium | directory_medium | community_low | directory_low | unknown`
- `source_link`: string (URL)
- `contact_channels`: object
- `notes`: string

## ValidationRecord
- `activity_date`: string
- `activity_proof_url`: string (URL)
- `proof_quality`: `high | medium | low`
- `legal_risk_flag`: boolean

## ScoreBreakdown
- `check_fit`: number (0-35)
- `thesis_fit`: number (0-25)
- `recency`: number (0-20)
- `source_reliability`: number (0-10)
- `intro_access`: number (0-10)
- `risk_penalty`: number (0 to -40)
- `total`: number

## TierAssignment
- `tier`: `A | B | C`
- `reason_codes`: string[]
- `first_touch_channel`: string
- `owner`: string
- `deadline`: string
