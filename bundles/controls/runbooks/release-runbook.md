---
id: release-runbook
type: runbook
title: "Runbook: ledger release"
status: Published
owner: Engineering Governance
links:
  - to: change-approval
    rel: implements
---
How a change reaches a production ledger system, and what it leaves behind as evidence.

1. The author opens a change with a linked ticket. The author cannot approve it.
2. A second engineer approves; the approval and approver are recorded automatically.
3. The release runs. Failure rolls back and the change returns to step 1.

The recorded approval is the evidence for [[change-approval]]. If the record is missing, the control did not operate, whatever the change log says.
