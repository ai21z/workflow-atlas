# Describe work, then review a draft

Use **Suggest my workflow** on the start screen. Describe the work in your own words. JEV suggests an investigation, feature or bug workflow. Atlas supplies the existing template stages, roles and skills. You review them before creating the project.

[[diagram:decision-flow]]

## Start and stay in control

1. Enter **What do you want to achieve?** Include the immediate task and anything already known.
2. Read **What gets sent?** Your description and recorded answers go to TypeSafe with the frozen question definitions. Selecting a practice includes its definition. Atlas does not automatically send your files or the entire Knowledge map. Keep credentials and private material you cannot share out of the text you enter.
3. Select **Suggest my workflow**. Wait for the draft, or use **Cancel suggestion**.
4. Read the suggested workflow and its stages. **Change workflow** lets you choose another. Your choice takes priority over the model.
5. Answer the optional question if useful. Typing keeps a pending edit. **Record this answer** adds it to the project. **Continue without this** discards that pending edit and prevents an immediate repeat. If something is already recorded, **Keep my answer** retains that answer and discards the replacement you were typing.
6. Select **Create this draft**. Unrecorded optional answer text stays out of the files. Edit the workflow, inspect **Files** and choose **Download**.

You can create a draft with missing details. Stages and planned owners are template defaults, not findings about your team. Technologies, repository paths and commands remain open until you supply them.

## A description is not an extracted answer

JEV assesses whether your description covers a question. It does not extract text into that field. **Appears covered in your description** means a model assessment, not a recorded requirement.

Open **Review answer** to see your exact description in an editable field. Shorten or edit it, then select **Use this answer**. Only that deliberate action records the text for that question. Until then, the relevant exported field remains unresolved.

You can do this after creating the draft too. When the next question was assessed as covered, **Review wording** opens your original description in Project details. Edit it and choose **Use this answer**, or choose **Leave unanswered** to discard the pending wording and move on. The wording review is kept only in the current session. Changing the project outcome or workflow clears that earlier assessment. Reopening a pack restores recorded answers, not an old model assessment.

A feature's user need and an investigation's desired outcome can already use your overall result. A bug still needs its own expected behavior. A goal such as fix checkout does not establish how checkout should work.

**Name and recorded answers** shows the current wording. Changing the wanted result retains the original description as a note when needed. User confirmation does not independently verify a fact.

## Check one practice

Before creating the draft, open **Check one practice, optional**. Choose Requirements before implementation, Smallest necessary change or Source backed project wiki. Select **Check this practice**.

The result can suggest it, decline it or need more context. A suggested practice has an explicit checkbox to add it. This checks one designated practice, not the entire catalog. No tool is installed and no policy is enforced by selecting guidance.

Earlier selected practices stay visible when the description changes. Remove them explicitly if they no longer fit. A later negative assessment does not silently erase your selection. **Review my description again** deliberately reopens deferred questions. Checking a practice alone keeps those deferrals.

The Knowledge map's contextual actions remain separate. A suggestion can add a supported practice to a repair or investigation even when the map's implementation-specific action is not shown.

## What stays local

Project editing remains in memory in this tab. Download and upload keep your work. Asking for a suggestion sends selected text to TypeSafe through the local server. The application does not automatically save prompts, responses or projects to disk or a database.

TypeSafe states that requests and responses are not used for training. Its zero data retention offering is described for enterprise customers. Standard API retention is not promised to be zero here. [Provider data handling](https://docs.typesafe.ai/legal).

The local server authenticates its request to TypeSafe with the configured key. Atlas does not return that value to the browser or insert it into project files or downloads. Text you type into project fields can be exported, so those fields are not a place to store secrets. The current app has no participant accounts or remote sharing server.

## Owner setup

Install [Node.js](https://nodejs.org/) 22 or later. Open a terminal in the repository folder. You can first try manual mode without a key:

```text
node tools/serve.mjs
```

Open [Workflow Atlas](http://127.0.0.1:8780/factory/). The server listens on 127.0.0.1 only. It serves the public application and documents, not private research folders or repository credentials.

If a previous server occupies the port, stop that server in its own terminal. Do not terminate an unrelated process. Alternatively:

```text
node tools/serve.mjs --port 8781
```

Open http://127.0.0.1:8781/factory/ for that run. Use Ctrl+C in the server terminal to stop it.

To use JEV, obtain your own API key from the [TypeSafe dashboard](https://console.typesafe.ai/), as described in its [quick start](https://docs.typesafe.ai/introduction/quickstart). Requests use that account's access and billing. Stop the manual server before restarting with one of the options below.

### Option A. Hidden input for this terminal session

Set `TYPESAFE_API_KEY` in the server's process environment before starting. This PowerShell example reads hidden input without placing a credential in command history:

```powershell
$atlasSecret = Read-Host 'TypeSafe API key' -AsSecureString
$atlasPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($atlasSecret)
try {
    $env:TYPESAFE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($atlasPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($atlasPointer)
    $atlasSecret.Dispose()
}
node tools/serve.mjs
```

Stop the server before clearing the shell variable with Remove-Item Env:TYPESAFE_API_KEY. Do not distribute the owner's main credential to participants. An owner can facilitate a session on their machine, or someone can run their own local server with their own key.

### Option B. An explicit local environment file

1. Copy `.env.example` to `.env.local` in the repository root. Keep the example file unchanged.
2. Open `.env.local` in a local text editor. Add your own value after `TYPESAFE_API_KEY=` and save that file. The empty example is a placeholder, not a working credential.
3. Start the server with:

```text
node --env-file=.env.local tools/serve.mjs
```

For another port, append `--port 8781`. Node loads this file only when the `--env-file` option is supplied. A value already set in the shell takes precedence. [Node environment file behavior](https://nodejs.org/api/cli.html#--env-filefile).

`.env.local` is ignored by Git and denied by the local web server. It still stores a credential on disk. Keep it out of screenshots, support reports and shared repository archives. Use Option A if you do not want a key file.

### Check the connection

Open the address printed by the server, reload the start screen and enter a small fictional task. Select **Suggest my workflow**. A returned suggestion confirms that request succeeded. An available server status alone only confirms a nonempty key is configured, not that the provider accepted it. The manual choices remain usable if the request fails.

### Sharing this beta

Share the code and setup instructions. Each person can run locally with their own key, or join a facilitated session on the owner's machine. Do not publish or tunnel the local server with an owner's credential. Its loopback and browser-origin checks are local protections, not participant authentication or public spending controls.

A static website can offer the manual workspace and downloads. From the repository root, prepare its public files with:

```text
node tools/build-docs-guide.mjs
node tools/build-static.mjs
```

The build prints a new `dist/public-<suffix>/` directory. Review and publish only that directory's contents. Its explicit asset list excludes the local server, credentials and private research. It checks common credential patterns and exact occurrences of the key when `TYPESAFE_API_KEY` is set in the build process environment. These are additional checks, not proof that every possible secret is absent. Do not share an owner's entire working directory.

The static bundle has no JEV API. Someone who wants suggestions runs the local app with their own key, or uses a facilitated session on the owner's machine. Hosted JEV assistance needs a separate server design for access, usage limits and credential ownership. The current server is not that service. Preparing a bundle does not deploy it.

## Recovery

| What happens | What to do |
| --- | --- |
| Suggestions need a configured local server | Start the Node server with its environment key, or choose a workflow yourself |
| Authentication fails | The owner checks the configured account and key. The browser never needs its value |
| The service is busy or takes too long | Your description stays in the tab. Retry deliberately or choose manually |
| Too many suggestions were requested | Wait a minute or continue manually. The local limit is shared across tabs |
| The response cannot be checked | Atlas rejects it. Continue manually or make a new request |
| The workflow is wrong | Use Change workflow. The manual choice wins |
| No supported workflow fits | Read the explanation, refine the description or choose an available workflow yourself |
| The next optional question disappears after an answer action | Keyboard focus moves to the next question, the next wording review or Create this draft. A status message confirms the action |
| A question repeats recorded information | Keep my answer, or Continue without this if you want to finish it later |
| You edit or change direction during a request | The pending request is cancelled and an old response cannot overwrite the new text |

The local request budget is ten seconds, with at most one transient retry inside that budget. Cancellation is best effort. It does not guarantee that the provider performed no work or billed nothing.

The local server accepts up to two concurrent suggestion requests and 30 accepted submissions in a rolling 60 seconds, shared across tabs. A submission can make up to two provider attempts. This is request pacing, not a per-person quota or a spending cap. The provider can also apply its own limits.

The compiler and manual editor still work under static hosting without a key. Missing suggestion endpoints do not make the manual app unusable. Downloaded project HTML remains a readable offline artifact.

## Implementation and evidence

The frozen decision contract pins jev-1.13.0 and the v8 prompt. Ten independent Choice questions assess intent and coverage. One designated practice adds three questions. Code validates the response and combines the practice need and rejection boundary. The compiler generates files from your accepted project, not model-authored prose.

Safe response metadata includes contract versions, definition digest, attempts, reported usage and server timing. The browser separately measures request start through response validation. That measurement excludes the later render and participant reading time. Neither is the older research harness p95.

The view also measures request start through the first render frame of the result. That includes the browser request and rendering handoff, not participant reading time. These diagnostics remain in memory and are not attached to ordinary project downloads.

Historical [metrics](metrics.md) remain synthetic pilot results. The [integrated trial](integrated-trial.md) evaluates this journey separately. Human usefulness and comprehension remain to be measured.

Setup, provider data-handling links and local server behavior reviewed on 5 October 2026.
