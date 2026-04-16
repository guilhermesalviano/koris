---
name: weather
description: "Get current weather and forecasts via wttr.in or Open-Meteo. Use when: user asks about weather, temperature, or forecasts for any location. NOT for: historical weather data, severe weather alerts, or detailed meteorological analysis. No API key needed."
---
# Weather Skill

Get current weather conditions and forecasts.

## Location

Always include a city, region, or airport code in weather queries.

## Commands

### Current Weather

*** Example Request: ***
```bash
# Specific city
curl "wttr.in/[city]?format=3"
```
*** Example Response: ***
```bash
[city]: ⛅  +17°C
```

### Forecasts
**"What's the weather?"**

*** Example Request: ***
```bash
curl -s "wttr.in/[city]?format=%l:+%c+%t+(feels+like+%f),+%w+wind,+%h+humidity"
```
*** Example Response: ***
```bash
[city]: ⛅  +17°C (feels like +17°C), ←8km/h wind, 93% humidity%
```

**"Will it rain?"**

*** Example Request: ***
```bash
curl -s "wttr.in/[city]?format=%l:+%c+%p"
```
*** Example Response: ***
```bash
[city]: ⛅  0.0mm
```