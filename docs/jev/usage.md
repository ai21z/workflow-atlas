# Historical facilitator harness

This page retains the earlier separate harness procedure and its recording behavior. For the current start-screen suggestion and local server, use [the integrated usage guide](integration.md). Do not use this historical harness guide as the integrated trial protocol.

## Choose how to fund the trial

| Route | How it works | Status |
| --- | --- | --- |
| Participant's TypeSafe key | Run the frozen direct TypeSafe pilot on a participant-controlled machine, with their key in that process environment | Requires a participant bundle, account access and machine setup checks |
| Owner operated TypeSafe key | The owner runs the pilot on their machine, shows the participant the request and discusses the answer | Simplest facilitated route, no credential is distributed |
| Separate capped OpenRouter keys | Create a distinct inference key for each participant, with a budget and expiry | Provider documented option, Atlas pilot adapter not implemented or exercised |

TypeSafe's [customer agreement, section 2.4](https://typesafe.ai/legal/mca) requires access credentials to be kept confidential and not shared. Use personal keys or an owner operated session. Do not copy the owner's main direct TypeSafe key to everyone.

OpenRouter documents [per-key spending limits and expiry](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key). Its management key stays with the owner. OpenRouter is a separate API route and account, the direct TypeSafe measurements do not validate it. Direct TypeSafe per-key budget and expiry controls were not verified in the reviewed public documentation.

## Before inviting someone

1. Read [the people trial](trial.md) and choose the tasks.
2. For current local reading, start Atlas with `node tools/serve.mjs`. It serves the public app without exposing the private harness folder. Replaying an old trial also requires that trial's matching frozen interface.
3. Open [the workspace](../../factory/). Use fictional or deliberately approved trial content.
4. Check `node --version`. The harness needs a Node runtime with built-in fetch and AbortSignal.timeout. The installed pilot runtime worked, other machines have not been exercised.
5. Confirm the private pilot files are present. `local-knowledge/jev-pilot/` is excluded from Git and is not supplied by an ordinary clone.
6. Agree that the selected brief and questions will go to a remote inference provider. Local execution does not mean offline inference.

**Historical trial readiness:** this separate harness requires private owner-local files that are absent from an ordinary clone. It does not provide a self-service participant bundle. The current app now has [integrated suggestions](integration.md), which do not require those private files. Entering a participant's personal key on the owner's machine exposes it to that machine, so it is not the proposed personal-key route.

## Set a key for this PowerShell session

This example asks for hidden input and sets only the current process environment. It does not write a key to the repository or a persistent environment setting.

```powershell
$trialSecret = Read-Host 'TypeSafe API key' -AsSecureString
$trialPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($trialSecret)
try {
    $env:TYPESAFE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($trialPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($trialPointer)
    $trialSecret.Dispose()
}
```

After the session, clear it with `Remove-Item Env:TYPESAFE_API_KEY`. A process environment is still a credential source. Never put the value in screenshots, notes, request JSON, downloaded packs or command examples.

## Try one participant brief

Create `local-knowledge/jev-pilot/optimization/human-trial.json`. The following is an **illustrative fixture**, not an observed participant result. Replace the brief and answers with the agreed trial text. The optional practice selects one practice to assess, it is not a model-selected practice.

```json
{
  "name": "Facilitated person trial",
  "labelStatus": "Unlabelled real-user input, review manually",
  "cases": [
    {
      "id": "person-01-task-01",
      "brief": "Add an export summary so reviewers can see what files are included. Only the export review screen changes. We have not agreed the acceptance examples.",
      "projectAnswers": {},
      "practice": { "id": "specification-first" },
      "reorderOptions": false
    }
  ]
}
```

For the current fixed seven-card round, follow [the identical test guide](repeatable-trial.md), which selects and freezes v8. The following command is a separate exploratory brief using the earlier v7 harness. It is not one of the fixed round's steps.

```text
node local-knowledge/jev-pilot/optimization/run.mjs --dataset=human-trial.json --name=person-trial --prompt=questions-v7.mjs --repeats=1
```

**This command calls the paid remote API and saves the supplied brief, requests, responses and timing locally.** Read the file before running it. The pilot does not save the current Atlas project or apply its output to the editor.

The new run appears under `local-knowledge/jev-pilot/optimization/runs/`. Inspect `records.json` for `decision.intent`, `decision.clarification`, `decision.coverage` and `decision.practice`. Compare them with the participant's intended task. Record corrections in the [session template](session-record.md).

Do not run the synthetic benchmark scorer on this unlabelled file. A participant review and an authored benchmark target are different evidence.

New local runs record `evidenceType` from the dataset's `labelStatus`, defaulting to unspecified when no label status is supplied. Historical snapshots retain their original synthetic scope wording. A participant run is not automatically a scored human benchmark.

## What happens on failure

| Observation | What to do |
| --- | --- |
| No credential in the process | Set the key locally, do not send it in a chat |
| HTTP 401 or 403 | Stop and check that account's credential and access |
| Rate limit, server error or network failure | The harness has bounded retries, record the failure and actual elapsed time |
| Invalid model, question IDs or answer values | Reject the response, keep the failure in the record |
| Repeated question, missed gap or wrong suggestion | Keep the raw answer, record the correction, continue manually in Atlas |

The existing transport permits up to three attempts with a 15 second timeout per attempt. Retries and waits can make the full request substantially longer than 15 seconds. The pilot stops when the reported input-token estimate exceeds $0.50, checked after responses with three concurrent workers. Usage from failed or retried calls without a returned usage record can be absent. This is not a provider-enforced hard spending cap. The final measured run had complete returned usage and zero retries.
