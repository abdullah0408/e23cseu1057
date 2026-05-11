# Stage 1

## Core REST APIs

All APIs are assumed to be used by already-authorised users.

### Get notifications

`GET /api/notifications?studentId=1042&type=Placement&isRead=false&limit=20&page=1`

Headers:

```json
{
  "Content-Type": "application/json"
}
```

Response:

```json
{
  "notifications": [
    {
      "id": "n1",
      "studentId": 1042,
      "type": "Placement",
      "title": "Company hiring",
      "message": "CS Corporation hiring",
      "priority": 3,
      "isRead": false,
      "createdAt": "2026-04-22T17:51:18Z"
    }
  ],
  "page": 1,
  "limit": 20
}
```

### Create notification

`POST /api/notifications`

Request:

```json
{
  "studentIds": [1042, 1043],
  "type": "Placement",
  "title": "Company hiring",
  "message": "CS Corporation hiring",
  "priority": 3
}
```

Response:

```json
{
  "message": "notification created",
  "createdCount": 2
}
```

### Mark one notification as read

`PATCH /api/notifications/n1/read`

Response:

```json
{
  "message": "notification marked as read"
}
```

### Mark all notifications as read

`PATCH /api/students/1042/notifications/read-all`

Response:

```json
{
  "message": "all notifications marked as read"
}
```

### Delete notification

`DELETE /api/notifications/n1`

Response:

```json
{
  "message": "notification deleted"
}
```

## Real-time notifications

Use WebSocket for logged-in students. When a new notification is created, the backend saves it first, then pushes it to the connected socket for that student. If a student is offline, the notification remains in the database and is fetched on the next page load.

# Stage 2

## Suggested DB

PostgreSQL is a good fit because notifications need reliable writes, filtering, ordering, and relationships with students. It also supports indexes, enums, transactions, and partitioning if the table becomes very large.

## Schema

```sql
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  notification_type notification_type NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

## Useful queries

```sql
SELECT *
FROM notifications
WHERE student_id = 1042
ORDER BY created_at DESC
LIMIT 20;

UPDATE notifications
SET is_read = true
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE notifications
SET is_read = true
WHERE student_id = 1042 AND is_read = false;
```

As data grows, slow reads, heavy indexes, and large table scans can happen. Use pagination, proper indexes, caching for unread count, and partition old notifications by date.

# Stage 3

The query is logically correct if `studentID` and `isRead` are the exact column names. In PostgreSQL style the columns should normally be `student_id` and `is_read`.

It is slow because the database may scan many rows for one student and then sort by `createdAt`. A better index is:

```sql
CREATE INDEX idx_notifications_student_read_created
ON notifications (student_id, is_read, created_at DESC);
```

Then the unread query becomes:

```sql
SELECT *
FROM notifications
WHERE student_id = 1042
  AND is_read = false
ORDER BY created_at DESC
LIMIT 20;
```

The likely cost becomes close to `O(log n + k)` where `k` is the number of rows returned, instead of scanning and sorting a large table.

Adding indexes on every column is not good advice. Indexes take storage and slow down inserts, updates, and deletes. Only index columns used often in filters, joins, and ordering.

Students who got a placement notification in the last 7 days:

```sql
SELECT DISTINCT student_id
FROM notifications
WHERE notification_type = 'Placement'
  AND created_at >= now() - interval '7 days';
```

# Stage 4

To reduce database load, cache the unread count and first page of notifications in Redis. The app can read from cache on page load and fall back to PostgreSQL when the cache is missing.

Use WebSocket updates so the frontend does not repeatedly fetch on every page load. When a new notification arrives, push it to the student and update cache.

Use pagination or cursor-based loading for older notifications. This avoids returning thousands of rows at once.

Tradeoffs: cache adds complexity and stale data risk, WebSocket needs connection management, and pagination requires frontend changes. The benefit is much lower DB pressure and faster page loads.

# Stage 5

The pseudocode is slow and risky because it sends email, writes DB rows, and pushes app updates one student at a time. If email fails midway, some students receive messages and some do not. It also has no retry, no batching, and no status tracking.

Saving to DB and sending email should not happen as one long blocking process. First save notification jobs reliably, then workers can send email and push app messages. This is faster and easier to retry.

```text
function notify_all(student_ids, message):
  batch_id = create_batch(message)

  for each student_id in student_ids:
    save_notification(student_id, message, batch_id, status="pending")
    publish_job("send_notification", student_id, batch_id)

worker send_notification(job):
  notification = get_notification(job.student_id, job.batch_id)

  try:
    send_email(job.student_id, notification.message)
    push_to_app(job.student_id, notification.message)
    mark_notification_status(notification.id, "sent")
  catch error:
    increase_retry_count(notification.id)
    if retry_count < 3:
      publish_job_later("send_notification", job.student_id, job.batch_id)
    else:
      mark_notification_status(notification.id, "failed")
```

# Stage 6

Priority is calculated using notification type and recency. Placement has the highest weight, then Result, then Event. If two notifications have the same type, the newer one comes first.

The implementation is in `notification_app_be/src/priority.js` and the API route is `GET /priority-notifications`.

To maintain top 10 efficiently as new notifications arrive, keep a small min-heap of size 10. For each incoming notification, compare its priority score with the smallest item in the heap. If it is better, remove the smallest and insert the new one. This keeps updates cheap because the heap never grows beyond 10 items.
