---
name: weather
description: "Get current weather and forecasts via wttr.in or Open-Meteo. Use when: user asks about weather, temperature, or forecasts for any location. NOT for: historical weather data, severe weather alerts, or detailed meteorological analysis. No API key needed."
---
<overview>Get current weather conditions and forecasts.</overview>
 
<rules>
  <rule name="location">Always include a city, region, or airport code in weather queries.</rule>
</rules>

<commands>

  <command name="current_weather">
    <trigger>Current Weather</trigger>
    <request>
      <description>Specific city</description>
      <bash>curl "wttr.in/[city]?format=3"</bash>
    </request>
    <response>
      <bash>[city]: ⛅  +17°C</bash>
    </response>
  </command>

  <command name="forecast_general">
    <trigger>What's the weather?</trigger>
    <request>
      <bash>curl -s "wttr.in/[city]?format=%l:+%c+%t+(feels+like+%f),+%w+wind,+%h+humidity"</bash>
    </request>
    <response>
      <bash>[city]: ⛅  +17°C (feels like +17°C), ←8km/h wind, 93% humidity</bash>
    </response>
  </command>

  <command name="forecast_rain">
    <trigger>Will it rain?</trigger>
    <request>
      <bash>curl -s "wttr.in/[city]?format=%l:+%c+%p"</bash>
    </request>
    <response>
      <bash>[city]: ⛅  0.0mm</bash>
    </response>
  </command>

</commands>

<format_codes>
  <code symbol="%c">Weather condition emoji</code>
  <code symbol="%t">Temperature</code>
  <code symbol="%f">Feels like</code>
  <code symbol="%w">Wind</code>
  <code symbol="%h">Humidity</code>
  <code symbol="%p">Precipitation</code>
  <code symbol="%l">Location</code>
</format_codes>