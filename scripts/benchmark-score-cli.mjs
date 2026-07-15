import { scoreBenchmarkOutput } from "./benchmark-score.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

try {
  const request = JSON.parse(await readStdin());
  process.stdout.write(JSON.stringify(scoreBenchmarkOutput(request)));
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
