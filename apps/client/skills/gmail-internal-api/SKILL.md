---
name: gmail-internal-api
description: The Gmail Internal API Skill enables the assistant to interact with a user's Gmail inbox through a secure internal gateway. It is optimized for triage and retrieval, allowing users to scan their most recent correspondence and access full message details without leaving the interface.
---

# Gmail Internal API Skill

Fetch and work with the user's last 15 received Gmail messages via the internal API.

## Usage

### GET `http://192.168.3.54:3000/api/emails/recent`

Returns the last 15 emails received in the personal Gmail account.
> Important: this route is summary-only and does not return the full email `body`.

**Response shape (expected):**
```json
{
  "message": "Gmail data from cache successfully",
  "data": {
    "emails": [
      {
        "id": "123dasd1234",
        "threadId": "123dasd1234",
        "snippet": "The email snippet is a short preview of the email body, typically the first 100 characters or so. It gives you a quick glimpse of the content without showing the full email.",
        "from": "From name - fromname@example.com",
        "subject": "Email subject",
        "date": "2026-04-28T15:16:08",
        "isUnread": true
      }
    ]
  }
}
```
// fix
### GET `http://192.168.3.54:3000/api/emails/message?id=[EMAIL_ID]`

Returns one specific email with full `HTML` content.
> Important: Use it to retrieve the full details(content in HTML at body response) of a message previously listed in the `/emails/recent` endpoint.

**Response shape (sample):**
```json
{
  "message": "Email retrieved successfully",
  "data": {
    "id": "19dd53e5d4398418",
    "threadId": "19dd53e5d4398418",
    "body": "<html></html>"
  }
}
```