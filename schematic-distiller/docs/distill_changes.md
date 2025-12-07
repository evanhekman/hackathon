# Distill pipeline changes

Summary of recent updates to the distillation output and proximities.

## Components
- Properties are flattened to `name -> value` (location/font/hidden metadata removed).
- Missing pin names fall back to the library symbol, reducing `NULL` pin names.
- Power/net label symbols (`#PWR*`, `Net-*`, `power:*`, `net:*`) are excluded from distilled components and proximities.

## Nets
- `nets` is a map keyed by net name; each reference maps to a list of pin objects: `{ "Pin": <number> }`.
  - Example: `"VBUS": { "D4": [{ "Pin": 2 }], "J1": [{ "Pin": 1 }] }`.

## Proximities
- IC-to-capacitor pairs get higher weight (extra boost for `U?` refs).
- IC-cap pairs use an extended radius (1.5×) so nearby decoupling caps are included.

## Notes
- Tests were not re-run here because the environment lacked the `sexpdata` dependency; run `python -m pytest tests/unit/test_distill.py` after installing it to verify locally.

