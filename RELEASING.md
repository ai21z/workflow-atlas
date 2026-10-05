# Versions and releases

The app version lives in `package.json`. `package-lock.json` and `factory/version.mjs` carry the same value. Export manifests include `appVersion` so a report can identify which app produced a pack.

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The initial candidate is `0.1.0-beta.1`. While the app is in beta, compatibility is still developing. Record breaking changes explicitly and provide a migration or a clear rejection for affected project files.

The application version, project schema version, guidance definitions and JEV contract revision describe different things. An app release does not automatically change the other versions. Change those only when their own format or behavior changes.

## Local checks

Use Node.js 22 or later. CI checks Node.js 22 and 24. Node.js 24 is the development default in `.nvmrc`.

```text
npm ci --ignore-scripts
npm run check:version
npm run check:docs
npm test
npx playwright install chrome
npm run test:browser
npm run build:static
```

On Linux, browser installation can need system libraries. CI uses `npx playwright install --with-deps chrome` for that step. The app itself still runs with `node tools/serve.mjs` without installing development packages.

The automated browser checks use fictional cases and controlled provider responses. They do not need a TypeSafe key, perform live inference or establish human usability. Historical evidence recomputation and live JEV trials are separate owner-run checks because their inputs or credentials are private.

## Prepare the next version

1. Move the intended changes from Unreleased into a new section in `CHANGELOG.md`. Record useful changes and remaining limits.
2. Update the version. For the next beta, run the command below. For another release, supply its explicit version instead.

```text
npm version 0.1.0-beta.2
```

The repository `.npmrc` disables automatic Git commits and tags. npm updates the package and lockfile, then the version hook updates the app module. Review those files yourself. This keeps ordinary commit messages independent from version automation.

3. Run the local checks above. Review the actual generated artifacts and the printed static bundle.
4. Commit the reviewed change with a short message, such as `Prepare the next beta`.
5. Push the reviewed branch when ready and wait for its CI checks. The CI workflow checks pushed branches, pull requests and version tags. A successful `main` run also publishes the static site to GitHub Pages. Other branches, pull requests and tags do not deploy. No GitHub release is created automatically.

## Tag a checked commit

Create an annotated tag only after the intended commit has passed its checks. For the initial beta:

```text
node tools/version.mjs --check --tag v0.1.0-beta.1
git tag -a v0.1.0-beta.1 -m "First beta"
git push origin v0.1.0-beta.1
```

Use the same version in all three commands. Tag CI rejects a mismatch with the app version. Do not move a published tag to another commit. Prepare a new version for changes.

Create the GitHub release from that existing tag under my account. Copy the relevant changelog entry, mark beta versions as prereleases, and review the assets before publishing. There is no release bot, automatic version commit or automatic tag author.

Only the allowlisted static bundle is a public website asset. It contains manual editing and artifact generation, without a JEV service. Never attach local research, environment files or a directory containing credentials. The Pages job publishes the exact bundle produced after successful checks. Other CI artifacts are retained for review and are not website content.

## GitHub Pages

The public beta is at <https://ai21z.github.io/workflow-atlas/>. Repository Settings, Pages uses **GitHub Actions** as the source. The `github-pages` environment records deployments. Only successful runs for `main` in this repository may publish, including a manual workflow dispatch on `main`.

The build marks the workspace as static. Its UI makes no JEV status or inference requests. Manual descriptions, editing, selected file imports and downloads stay in the browser. GitHub Pages cannot run the local Node server. JEV still requires local setup with a private key.

The deployment uses pinned GitHub actions and a reviewed file allowlist, with credential pattern checks. It never publishes the repository directory itself. The browser check serves the build under `/workflow-atlas/` and exercises navigation, export and reopening before publication.

To recover from a bad deployment, revert the affected change on `main` and let the checks publish the corrected bundle. Leave published tags unchanged. The `Check and publish Atlas` workflow can also be dispatched on `main` to republish its current checked contents.

## Authorship

First party commits and tags use the repository owner's existing Git identity. Keep ordinary commit messages short. Do not add coauthor trailers. Preserve third party license notices with their code.
