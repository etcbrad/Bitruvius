import { access } from "node:fs/promises";
import path from "node:path";

const requiredBins = ["tsx", "vite", "tsc"];

async function main() {
  const missing = [];

  for (const bin of requiredBins) {
    const binPath = path.join(process.cwd(), "node_modules", ".bin", bin);
    try {
      await access(binPath);
    } catch {
      missing.push(`${bin} (expected at ${binPath})`);
    }
  }

  if (missing.length > 0) {
    console.error("Missing required tooling:");
    for (const item of missing) console.error(`- ${item}`);
    process.exit(1);
  }

  console.log("Environment OK.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
