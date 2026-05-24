---
name: calendar-gateway
description: The Calendar Gateway Skill enables the assistant to interact with a user's Google Calendar through a secure internal gateway. It is optimized for schedule management, allowing users to view upcoming events, check availability, and retrieve specific meeting details.
read_when:
  - asked about upcoming meetings or events
  - asked what is on the schedule for a specific day
  - asked for event locations or attendee lists
  - asked to check availability
---

<overview>Fetch and manage the user's calendar events and schedule via the internal API.</overview>

<api_response_shape>
  <description>Expected gateway response format:</description>
  <json>
    {
      "message": "Calendar data retrieved successfully",
      "data": {
        "todayEvents": [
          {
            "id": "event_id",
            "start": "HH:mm",
            "end": "HH:mm",
            "title": "Event title",
            "color": "#RRGGBB",
            "type": "default"
          }
        ],
        "importantEvents": [
          {
            "id": "event_id",
            "start": "DD/MM - HH:mm",
            "end": "HH:mm",
            "title": "Event title",
            "type": "default"
          }
        ]
      }
    }
  </json>
</api_response_shape>

<rules>
  <rule name="data_enforcement">You MUST base your response strictly on the data returned from the API response. Do not hallucinate, guess, or invent meetings, times, or locations under any circumstances.</rule>
  <rule name="empty_data_handling">If both <code>data.todayEvents</code> and <code>data.importantEvents</code> are empty, explicitly state that the calendar is clear for today and has no important upcoming events.</rule>
  <rule name="priority_handling">When both collections are present, present today's events first, then upcoming important events.</rule>
  <rule>Include Event IDs in your internal logic whenever referencing specific entries to ensure follow-up actions (like descriptions or attendee checks) target the correct event.</rule>
</rules>

<commands>
  <command>
    <trigger>Get Today's Schedule</trigger>
    <request>
      <description>Fetch today's and important upcoming events. Uses a compact filter to keep only fields used by the assistant.</description>
      <bash>curl -X GET <GATEWAY_HOST>/api/calendar/ | jq '{message, data: {todayEvents: [.data.todayEvents[]? | {id, start, end, title, color, type}], importantEvents: [.data.importantEvents[]? | {id, start, end, title, type}]}}'</bash>
    </request>
    <response>
      <description>Returns today's events and important upcoming events.</description>
      <bash>
        {
          "message": "Calendar data retrieved successfully",
          "data": {
            "todayEvents": [
              {
                "id": "jngldmek83ds86uk27rr0h4ikk_20260514T220000Z",
                "start": "19:00",
                "end": "20:00",
                "title": "Terapia",
                "color": "#6EE7B7",
                "type": "default"
              }
            ],
            "importantEvents": [
              {
                "id": "522rh0836vu5s113b2dmo28v1s_20260515T220000Z",
                "start": "15/05 - 19:00",
                "end": "20:00",
                "title": "Aulas de Inglês",
                "type": "default"
              }
            ]
          }
        }
      </bash>
    </response>
  </command>

</commands>