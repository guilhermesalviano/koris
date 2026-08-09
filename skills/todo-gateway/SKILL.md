---
name: todo-gateway
description: The Todo Gateway Skill enables the assistant to interact with a user's to-do list through a secure internal gateway. It is optimized for daily task management, allowing users to see their tasks for the day, review unfinished tasks, confirm specific tasks, and mark tasks as checked once they are done.
read_when:
  - asked about tasks of the day
  - asked about unchecked tasks of the day
  - asked to 'check' some specific task
  - asked to review today's priorities
---

<overview>Fetch and manage the user's to-do tasks via the internal API.</overview>

<api_response_shape>
  <description>Expected gateway response format:</description>
  <json>{"message":"Todos data retrieved from cache","data": [{"id": 100,"title": "sample - drink water","checked": 0,"priority": "medium","sponsor": "human x","usualCompletionTime": "20:00"}]}
  </json>
</api_response_shape>

<rules>
  <rule name="data_enforcement">You MUST base your response strictly on the data returned from the API response. Do not hallucinate, guess, or invent tasks, times, or priorities under any circumstances.</rule>
  <rule name="checked_field">The <code>checked</code> field indicates completion status: <code>0</code> means the task is unchecked (still to do), <code>1</code> means it is checked (done). Only present unchecked tasks as outstanding.</rule>
  <rule name="confirm_before_check">Before marking a task as checked, confirm the exact task with the user using its title and id. Never check a task on your own initiative.</rule>
  <rule name="empty_data_handling">If <code>data</code> is empty or the API returns no todos, explicitly state that there are no tasks for today. Do not invent tasks to fill the gap.</rule>
  <rule name="priority_order">When presenting tasks, respect the <code>priority</code> field (e.g. high before medium before low) so the most important tasks are shown first.</rule>
  <rule>Include todo IDs in your internal logic whenever referencing specific tasks, so follow-up actions (like confirming or checking a task) target the correct entry.</rule>
</rules>

<commands>
  <command>
    <trigger>Get Today's Tasks</trigger>
    <request>
      <description>Fetch all of the user's to-do tasks. Uses a compact filter to keep only the fields used by the assistant.</description>
      <bash>curl -k -X GET <GATEWAY_HOST>/api/todo/ | jq '{message, data: [.data[] | {id, title, checked, priority, sponsor, usualCompletionTime}]}'</bash>
    </request>
    <response>
      <description>Returns all today's tasks with their completion status.</description>
      <bash>{"message":"Todos data retrieved from cache","data":[{"id":100,"title":"sample - drink water","checked": 1,"priority": "medium","sponsor": "human x","usualCompletionTime": "09:00"},{"id": 101,"title": "sample2 - drink water","checked": 1,"priority": "medium","sponsor": "human x","usualCompletionTime": "09:01"}]}
      </bash>
    </response>
  </command>

  <command>
    <trigger>Get Unchecked Tasks</trigger>
    <request>
      <description>Fetch only the tasks that are still pending (<code>checked == 0</code>). Use this when the user asks what still needs to be done today.</description>
      <bash>curl -k -X GET <GATEWAY_HOST>/api/todo/?onlyUnchecked=1 | jq '{message, data: [.data[] | select(.checked == 0) | {id, title, checked, priority, sponsor, usualCompletionTime}]}'</bash>
    </request>
    <response>
      <description>Returns only the unchecked tasks.</description>
      <bash>{"message":"Todos data retrieved from cache","data": [{"id": 100,"title": "sample - drink water","checked": 0,"priority": "medium","sponsor": "human x","usualCompletionTime": "09:00"}]}
      </bash>
    </response>
  </command>

  <command>
    <trigger>Check a Task</trigger>
    <request>
      <description>Mark a specific task as checked (<code>checked == 1</code>) once it is done. Always use the task id returned by the API and confirm the task with the user before updating.</description>
      <bash>curl -k -X PUT <GATEWAY_HOST>/api/todo -H 'Content-Type: application/json' -d '{"id": <TASK_ID>,"checked": 1}'</bash>
    </request>
    <response>
      <description>Returns the updated task with <code>checked</code> set to 1.</description>
      <bash>{"message":"Todo updated successfully","data": {"id": 100,"title": "sample - drink water","checked": 1,"priority": "medium","sponsor": "human x","usualCompletionTime": "09:00"}}
      </bash>
    </response>
  </command>

</commands>
