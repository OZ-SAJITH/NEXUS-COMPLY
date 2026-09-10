import { runAudit } from "../apps/api/src/services/auditService";
import { readFileSync } from "fs";

(async () => {
  const path = process.argv[2] ?? "samples/fortinet/demo-secure.conf";
  const content = readFileSync(path, "utf-8");
  const result = await runAudit({ fileName: path, content });
  for (const i of result.audit.intents) {
    console.log(`INTENT ${i.intentType} proto=${i.protocol} src=${i.source?.type}:${i.source?.value} logging=${i.loggingRequired} enabled=${i.enabled} desc=${i.description} lines=${i.evidence.map(e=>e.lineStart+"-"+e.lineEnd)}`);
  }
})();