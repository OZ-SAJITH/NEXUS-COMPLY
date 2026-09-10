import { runAudit } from "../apps/api/src/services/auditService";
import { readFileSync } from "fs";

(async () => {
  const path = process.argv[2] ?? "samples/cisco/demo-secure.conf";
  const content = readFileSync(path, "utf-8");
  const result = await runAudit({ fileName: path, content });
  const a = result.audit;
  console.log(`=== ${path} vendor=${a.vendor} ===`);
  for (const f of a.findings) {
    if (f.status === "FAIL" || f.status === "WARNING") {
      console.log(`[${f.status}] ${f.controlId} ${f.controlName} (sev ${f.severity}) risk=${f.risk}`);
      for (const e of f.evidence.slice(0, 3)) {
        console.log(`   L${e.lineStart}-${e.lineEnd} ${e.reason?.slice(0, 100)}`);
      }
    }
  }
})();