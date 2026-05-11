require("dotenv").config();

const express = require("express");
const Log = require("logging_middleware");

const API_BASE_URL = "http://4.224.186.213/evaluation-service";
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

async function getData(path) {
  const token = process.env.LOG_AUTH_TOKEN;

  if (!token) throw new Error("LOG_AUTH_TOKEN is missing");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok)
    throw new Error(
      `Test server request failed with status ${response.status}`,
    );

  return response.json();
}

function planMaintenance(vehicles, mechanicHours) {
  const maxHours = mechanicHours;
  const dp = Array(maxHours + 1).fill(0);
  const picked = Array.from({ length: maxHours + 1 }, () => []);

  for (const v of vehicles) {
    const time = v.Duration;
    const score = v.Impact;

    for (let h = maxHours; h >= time; h--) {
      const withThis = dp[h - time] + score;

      if (withThis > dp[h]) {
        dp[h] = withThis;
        picked[h] = [...picked[h - time], v];
      }
    }
  }

  const ans = picked[maxHours];
  let usedHours = 0;

  for (const v of ans) {
    usedHours += v.Duration;
  }

  return {
    totalImpact: dp[maxHours],
    totalDuration: usedHours,
    remainingHours: maxHours - usedHours,
    selectedVehicles: ans,
  };
}

app.get("/", async (req, res) => {
  await Log("backend", "info", "route", "Health check route called");
  res.json({
    message: "Vehicle maintenance scheduler is running",
    routes: ["GET /depots", "POST /schedule"],
  });
});

app.get("/depots", async (req, res) => {
  try {
    await Log("backend", "info", "route", "Fetching depot list");
    const data = await getData("/depots");
    res.json(data);
  } catch (error) {
    await Log("backend", "error", "handler", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/schedule", async (req, res) => {
  try {
    const id = req.body.depotId;

    await Log("backend", "info", "handler", "Schedule request received");

    if (!id) {
      await Log("backend", "warn", "handler", "Depot id missing");
      return res.status(400).json({ error: "depotId is required" });
    }

    const d1 = await getData("/depots");
    const d2 = await getData("/vehicles");

    const depot = d1.depots.find((x) => x.ID == id);

    if (!depot) {
      await Log("backend", "warn", "handler", `Depot ${id} not found`);
      return res.status(404).json({ error: "Depot not found" });
    }

    const hours = depot.MechanicHours;
    const ans = planMaintenance(d2.vehicles, hours);

    await Log(
      "backend",
      "info",
      "service",
      `Schedule created with impact ${ans.totalImpact}`,
    );

    res.json({
      depotId: depot.ID,
      mechanicHours: hours,
      totalImpact: ans.totalImpact,
      totalDuration: ans.totalDuration,
      remainingHours: ans.remainingHours,
      selectedCount: ans.selectedVehicles.length,
      selectedVehicles: ans.selectedVehicles,
    });
  } catch (error) {
    await Log("backend", "error", "handler", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  Log("backend", "info", "config", `Server started on port ${PORT}`);
});
