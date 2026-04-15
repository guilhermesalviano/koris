---
name: cat-fact
description: Random cat facts and breed information from catfact.ninja (free, no API key)
read_when:
  - asked random cat facts
---

# Cat Fact

Random cat facts from catfact.ninja (no API key required).

## Usage

```bash
# Get a random cat fact
curl -s "https://catfact.ninja/fact"

# Get a random fact (short)
curl -s "https://catfact.ninja/fact?max_length=100"
```

## Programmatic (JSON)

```bash
curl -s "https://catfact.ninja/fact" | jq '.fact'
```

## One-liner examples

```bash
# Random fact
curl -s "https://catfact.ninja/fact" --header "Accept: application/json" | jq -r '.fact'

# Multiple facts
for i in {1..3}; do curl -s "https://catfact.ninja/fact" --header "Accept: application/json" | jq -r '.fact'; done
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /fact` | Random cat fact |

Docs: https://catfact.ninja