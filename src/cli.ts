/**
 * Cursor OpenAI API - Standalone CLI
 *
 * Serves Cursor API as OpenAI-compatible endpoint with OAuth authentication.
 */
import { login, logout, getStoredCredentials, isAuthenticated } from "./cli-auth";
import {
  DEFAULT_PROXY_HOST,
  INBOUND_API_KEY_ENV,
  getProxyHost,
  getProxyPort,
  startProxy,
  stopProxy,
} from "./proxy";
import { getCursorModels } from "./models";
import { getTokenExpiry } from "./auth";

const PROXY_PORT = 3000;

async function cmdLogin() {
  console.log("🔐 Starting Cursor OAuth login...\n");
  try {
    const result = await login();
    console.log("\n✅ Login successful!");
    console.log(`   Access token: ${result.accessToken.slice(0, 20)}...`);
    console.log(`   Expires in: ${Math.round((getTokenExpiry(result.accessToken) - Date.now()) / 1000 / 60)} minutes`);
  } catch (error) {
    console.error("\n❌ Login failed:", error);
    process.exit(1);
  }
}

function cmdLogout() {
  logout();
  console.log("👋 Logged out successfully.");
}

async function cmdWhoami() {
  const creds = getStoredCredentials();
  if (!creds) {
    console.log("❌ Not logged in. Run `cursor-api login` to authenticate.");
    return;
  }

  const expiresIn = Math.round((creds.expires - Date.now()) / 1000 / 60);
  if (expiresIn < 0) {
    console.log("⚠️  Token expired. Run `cursor-api login` to re-authenticate.");
    return;
  }

  console.log("✅ Authenticated with Cursor");
  console.log(`   Token expires in: ${expiresIn} minutes`);
}

async function cmdModels() {
  const creds = getStoredCredentials();
  if (!creds) {
    console.log("❌ Not logged in. Run `cursor-api login` first.");
    process.exit(1);
  }

  console.log("🔍 Fetching available models...\n");
  try {
    const models = await getCursorModels(creds.access);
    console.log("Available Cursor models:\n");
    for (const model of models) {
      const reasoning = model.reasoning ? "🧠" : "   ";
      console.log(`  ${reasoning} ${model.id.padEnd(25)} ${model.name}`);
    }
  } catch (error) {
    console.error("Failed to fetch models:", error);
    process.exit(1);
  }
}

async function cmdServe(port: number, host: string) {
  const creds = getStoredCredentials();
  if (!creds) {
    console.log("❌ Not logged in. Run `cursor-api login` first.");
    process.exit(1);
  }

  if (creds.expires < Date.now()) {
    console.log("⚠️  Token expired. Run `cursor-api login` to re-authenticate.");
    process.exit(1);
  }

  console.log(`🚀 Starting Cursor OpenAI API proxy on ${host}:${port}...`);
  console.log(`   Endpoint: http://${host}:${port}/v1`);
  console.log(`   Models: http://${host}:${port}/v1/models`);
  console.log(`   Health: http://${host}:${port}/health`);
  console.log(`   Inbound auth: ${process.env[INBOUND_API_KEY_ENV] ? "required" : "disabled"}`);
  console.log(`   Press Ctrl+C to stop.\n`);

  const proxyPort = await startProxy(async () => creds.access, port, host);

  console.log(`✅ Server running at http://${host}:${proxyPort}\n`);

  process.on("SIGINT", () => {
    console.log("\n\n👋 Shutting down...");
    stopProxy();
    process.exit(0);
  });
}

function cmdStatus() {
  const port = getProxyPort();
  if (port) {
    const host = getProxyHost() ?? DEFAULT_PROXY_HOST;
    console.log(`🟢 Proxy running on ${host}:${port}`);
  } else {
    console.log("🔴 Proxy not running");
  }
}

function getServeHost(): string {
  return process.env.HOST?.trim() || DEFAULT_PROXY_HOST;
}

function getServePort(): number {
  const rawPort = process.env.PORT;
  if (!rawPort) return PROXY_PORT;

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid PORT: ${rawPort}. Using default ${PROXY_PORT}.`);
    return PROXY_PORT;
  }

  return port;
}

function showHelp() {
  console.log(`
cursor-api - Cursor OpenAI API CLI

Usage: cursor-api <command> [options]

Commands:
  login                 Authenticate with Cursor via OAuth
  logout                Clear stored credentials
  whoami                Show current authentication status
  models                List available Cursor models
  serve                 Start the OpenAI-compatible proxy server (default: ${DEFAULT_PROXY_HOST}:${PROXY_PORT})
  status                Show proxy server status
  help                  Show this help message

Examples:
  cursor-api login
  cursor-api models
  HOST=127.0.0.1 PORT=3000 cursor-api serve
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";

  switch (command) {
    case "login":
      await cmdLogin();
      break;
    case "logout":
      cmdLogout();
      break;
    case "whoami":
      await cmdWhoami();
      break;
    case "models":
      await cmdModels();
      break;
    case "serve": {
      await cmdServe(getServePort(), getServeHost());
      break;
    }
    case "status":
      cmdStatus();
      break;
    case "help":
    case "--help":
    case "-h":
    default:
      showHelp();
      break;
  }
}

main();
