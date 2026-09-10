import { runAudit } from "../apps/api/src/services/auditService";
import { getRepository } from "../apps/api/src/storage/jsonRepo";
import { readFileSync } from "fs";
import { fingerprintSyntax } from "../apps/api/src/utils/helpers";
import { uniqueId } from "../apps/api/src/utils/helpers";

(async () => {
  const repo = getRepository();
  await repo.reset();

  const custom1 = readFileSync("samples/unknown/custom-demo.conf", "utf-8");
  const custom2 = readFileSync("samples/unknown/custom-demo-branch.conf", "utf-8");
  const custom3 = readFileSync("samples/unknown/custom-demo-partner.conf", "utf-8");

  const fp1 = fingerprintSyntax(custom1);
  const fp2 = fingerprintSyntax(custom2);
  const fp3 = fingerprintSyntax(custom3);

  // 1. First run — unknown, no approved mapping yet
  const run1 = await runAudit({ fileName: "custom-demo.conf", content: custom1 });
  const ai1 = run1.audit.aiInterpretations?.[0];
  console.log(`Run1: vendor=${run1.audit.vendor} usedMapping=${run1.usedApprovedMapping} ai=${ai1?.id} conf=${ai1?.confidence} status=${ai1?.status}`);

  // 2. Approve the mapping
  await repo.saveMapping({
    id: uniqueId("map"),
    syntaxFingerprint: fp1,
    aiInterpretationId: ai1?.id ?? "n/a",
    securityIntent: ai1?.securityIntent ?? "RESTRICT_ADMIN_ACCESS",
    protocol: ai1?.protocol,
    sourceRestriction: ai1?.sourceRestriction ?? false,
    loggingEnabled: ai1?.loggingEnabled ?? false,
    approvedAt: new Date().toISOString(),
    approvedBy: "test",
  });

  // 3. Run the SAME config again — should reuse mapping
  const run1b = await runAudit({ fileName: "custom-demo.conf", content: custom1 });
  console.log(`Run1b: vendor=${run1b.audit.vendor} usedMapping=${run1b.usedApprovedMapping} aiInterpretations=${run1b.audit.aiInterpretations?.length}`);

  // 4. Run the branch + partner variants with same syntax — same structural fingerprint.
  console.log(`fp1=${fp1} fp2=${fp2} fp3=${fp3} allSame=${fp1 === fp2 && fp2 === fp3}`);

  const run2 = await runAudit({ fileName: "custom-demo-branch.conf", content: custom2 });
  console.log(`Run2 (branch): vendor=${run2.audit.vendor} usedMapping=${run2.usedApprovedMapping} aiInterpretations=${run2.audit.aiInterpretations?.length}`);
  const ai2 = run2.audit.aiInterpretations?.[0];
  console.log(`  run2 ai = ${ai2?.status} / ${ai2?.securityIntent} conf=${ai2?.confidence}`);

  const run3 = await runAudit({ fileName: "custom-demo-partner.conf", content: custom3 });
  console.log(`Run3 (partner): vendor=${run3.audit.vendor} usedMapping=${run3.usedApprovedMapping} aiInterpretations=${run3.audit.aiInterpretations?.length}`);

  const mappings = await repo.allApprovedMappings();
  console.log(`Total approved mappings in store: ${mappings.length}`);
})();