const LOG_URL = "http://4.224.186.213/evaluation-service/logs";

const stacks = ["backend", "frontend"];
const levels = ["debug", "info", "warn", "error", "fatal"];
const backendPackages = [
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
];
const frontendPackages = ["api", "component", "hook", "page", "state", "style"];
const commonPackages = ["auth", "config", "middleware", "utils"];

async function Log(stack, level, packageName, message) {
  if (!stacks.includes(stack)) throw new Error("Invalid stack");
  if (!levels.includes(level)) throw new Error("Invalid level");

  let allowedPackages = [];

  if (stack === "backend")
    allowedPackages = [...backendPackages, ...commonPackages];
  if (stack === "frontend")
    allowedPackages = [...frontendPackages, ...commonPackages];
  if (!allowedPackages.includes(packageName))
    throw new Error("Invalid package for this stack");

  const token = process.env.LOG_AUTH_TOKEN;

  if (!token) throw new Error("LOG_AUTH_TOKEN is missing");

  const response = await fetch(LOG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      stack: stack,
      level: level,
      package: packageName,
      message: message,
    }),
  });

  const data = await response.json();

  if (!response.ok) throw new Error(`Log API failed: ${response.status}`);

  return data;
}

module.exports = Log;
