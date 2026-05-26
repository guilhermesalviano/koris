---
name: habits-gateway
description: The Habits Gateway Skill enables the assistant to fetch and manage the user's daily habit tracker via an internal API.
read_when:
  - asked about daily habits, routines, or specific tracked activities like the gym.
---

<overview>Fetch and manage the user's habits tracker via the internal API.</overview>

<api_response_shape>
  <description>It will return a list of habits executed on the specified day. Expected gateway response format:</description>
  <json>
    {
      "message": "Habits retrieved successfully",
      "data": {
        "2026-05-26": [
          "woke_up",
          "gym",
          "study"
        ],
        "2026-05-17": [
          "woke_up"
        ]
      }
    }
  </json>
</api_response_shape>

<commands>
  <command>
    <trigger>Check if the gym habit was executed today</trigger>
    <request>
      <description>Fetch today's events. Uses a compact filter to keep only fields used by the assistant.</description>
      <bash>curl -s -X GET <GATEWAY_HOST>/api/habits/ | jq --arg today "$(date +%Y-%m-%d)" '{message, data: {($today): .data[$today]}}'</bash>
    </request>
    <response>
      <description>Returns today's executed habits.</description>
      <bash>
        {
          "message": "Habits retrieved successfully",
          "data": {
            "2026-05-26": [
              "woke_up",
              "gym",
              "study"
            ]
          }
        }
      </bash>
    </response>
  </command>
</commands>