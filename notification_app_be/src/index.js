const path = require("path");

require("dotenv").config();
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const express = require("express");
const Log = require("logging_middleware");
const getPriorityNotifications = require("./priority");

const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json());

let nextId = 1;
const notifications = [];

function makeNotification(studentId, data) {
  return {
    id: `n${nextId++}`,
    studentId: Number(studentId),
    type: data.type,
    title: data.title,
    message: data.message,
    priority: data.priority || 1,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
}

function findNotification(id) {
  return notifications.find((x) => x.id === id);
}

app.get("/", async (req, res) => {
  await Log("backend", "info", "route", "Notification health check called");
  res.json({
    message: "Notification app is running",
    routes: [
      "GET /api/notifications",
      "POST /api/notifications",
      "PATCH /api/notifications/:id/read",
      "PATCH /api/students/:studentId/notifications/read-all",
      "DELETE /api/notifications/:id",
      "GET /priority-notifications",
    ],
  });
});

app.get("/api/notifications", async (req, res) => {
  try {
    await Log("backend", "info", "route", "Fetching notifications");

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const start = (page - 1) * limit;

    let data = [...notifications];

    if (req.query.studentId)
      data = data.filter((x) => x.studentId == req.query.studentId);
    if (req.query.type) data = data.filter((x) => x.type === req.query.type);
    if (req.query.isRead)
      data = data.filter((x) => String(x.isRead) === req.query.isRead);

    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      notifications: data.slice(start, start + limit),
      page: page,
      limit: limit,
    });
  } catch (error) {
    await Log("backend", "error", "handler", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/notifications", async (req, res) => {
  try {
    await Log("backend", "info", "handler", "Create notification request");

    const data = req.body;

    if (!Array.isArray(data.studentIds) || data.studentIds.length === 0) {
      await Log("backend", "warn", "handler", "Student ids missing");
      return res.status(400).json({ error: "studentIds is required" });
    }

    if (!data.type || !data.title || !data.message) {
      await Log("backend", "warn", "handler", "Notification fields missing");
      return res
        .status(400)
        .json({ error: "type, title and message are required" });
    }

    for (const studentId of data.studentIds) {
      notifications.push(makeNotification(studentId, data));
    }

    await Log(
      "backend",
      "info",
      "service",
      `Created ${data.studentIds.length} notifications`,
    );

    res.status(201).json({
      message: "notification created",
      createdCount: data.studentIds.length,
    });
  } catch (error) {
    await Log("backend", "error", "handler", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/notifications/:id/read", async (req, res) => {
  try {
    await Log("backend", "info", "handler", "Mark notification read request");

    const notification = findNotification(req.params.id);

    if (!notification) {
      await Log("backend", "warn", "handler", "Notification not found");
      return res.status(404).json({ error: "Notification not found" });
    }

    notification.isRead = true;

    res.json({ message: "notification marked as read" });
  } catch (error) {
    await Log("backend", "error", "handler", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/students/:studentId/notifications/read-all", async (req, res) => {
  try {
    await Log("backend", "info", "handler", "Mark all notifications read");

    for (const notification of notifications) {
      if (notification.studentId == req.params.studentId) {
        notification.isRead = true;
      }
    }

    res.json({ message: "all notifications marked as read" });
  } catch (error) {
    await Log("backend", "error", "handler", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/notifications/:id", async (req, res) => {
  try {
    await Log("backend", "info", "handler", "Delete notification request");

    const index = notifications.findIndex((x) => x.id === req.params.id);

    if (index === -1) {
      await Log("backend", "warn", "handler", "Notification not found");
      return res.status(404).json({ error: "Notification not found" });
    }

    notifications.splice(index, 1);

    res.json({ message: "notification deleted" });
  } catch (error) {
    await Log("backend", "error", "handler", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/priority-notifications", async (req, res) => {
  try {
    await Log("backend", "info", "route", "Fetching priority notifications");

    const limit = Number(req.query.limit) || 10;
    const data = getPriorityNotifications(notifications, limit);

    res.json({ notifications: data });
  } catch (error) {
    await Log("backend", "error", "handler", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  Log("backend", "info", "config", `Notification app started on port ${PORT}`);
});
