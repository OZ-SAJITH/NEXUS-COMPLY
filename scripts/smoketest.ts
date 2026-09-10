import { runAudit } from "../apps/api/src/services/auditService";
import { readFileSync } from "fs";

(async () => {
  const samples = [
    "samples/cisco/demo-secure.conf",
    "samples/cisco/demo-insecure.conf",
    "samples/fortinet/demo-secure.conf",
    "samples/fortinet/demo-insecure.conf",
    "samples/juniper/demo-secure.conf",
    "samples/juniper/demo-insecure.conf",
    "samples/unknown/custom-demo.conf",
  ];

  for (const path of samples) {
    const content = readFileSync(path, "utf-8");
    const result = await runAudit({ fileName: path, content });
    const a = result.audit;
    console.log(`\n=== ${path} ===`);
    console.log(`Vendor: ${a.vendor} (${a.vendorStatus})`);
    console.log(`Intents: ${a.intents.length}`);
    console.log(`Findings: ${a.findings.length}`);
    const byStatus: Record<string, number> = {};
    for (const f of a.findings) byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    console.log(`  Status: ${JSON.stringify(byStatus)}`);
    console.log(`  Score: ${a.compliance?.score}% passed=${a.compliance?.passed} failed=${a.compliance?.failed}`);
    console.log(`  Risk: ${a.risk?.overallScore} (${a.risk?.explanation?.slice(0, 60)})`);
    if (a.vendorStatus === "unknown") {
      console.log(`  AI interpretations: ${a.aiInterpretations?.length}`);
      const ai = a.aiInterpretations?.[0];
      if (ai) console.log(`    intent=${ai.securityIntent} confidence=${ai.confidence} provider=${ai.provider}`);
    }
    // verify evidence lines valid
    for (const f of a.findings.filter((x) => x.status === "FAIL")) {
      if (f.evidence.length === 0) console.log(`  !! FAIL finding ${f.controlId} has NO evidence`);
    }
  }
})();
