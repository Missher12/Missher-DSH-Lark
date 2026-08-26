# @missher/dsh-lark

English | [中文](README.zh.md)

An independently installable DeepSeek Harness Bundle that gives one explicitly paired Feishu or Lark owner a private-chat Harness command center and lets that owner continue developing in an ordinary Harness Session. It reuses the Session's existing Agent, approval policy, sandbox, tools, model, history, and project directory. It does not embed OpenClaw, create a second Agent runtime, or expose project data to unpaired users.

## Install

Install the standalone release directly into the `web` Profile:

```bash
dsh plugin --profile web add https://github.com/Missher12/dsh-lark/releases/download/v0.2.0/missher-dsh-lark-0.2.0.tgz
```

Restart Harness after installation. The transaction writes both the package dependency and the `dsh.profile.bundles` layer. The package is not part of the DeepSeek Harness Desktop repository or a Desktop-managed default, and it can be disabled or removed independently. To build the same package from source, run `node scripts/run-in-harness.mjs pack`; the canonical tarball and LF-only checksum are written below `.work/artifacts/`.

### Upgrade from the legacy package

The public package name changed from `@deepseek-ai/dsh-lark` to `@missher/dsh-lark`, while the runtime Bundle ID remains `lark` and the Storage Domain remains `dsh_lark` schema 1. This preserves `$DSH_HOME/lark`, owner/binding/queue state, and credential references.

Do not install both package names in one live Profile. Stop Harness, download the canonical tarball, then use the staged migration command documented in [docs/migration.md](docs/migration.md). The migration installs into a sibling staging directory and swaps the exact Profile only after validation; it leaves the old Profile as a rollback backup and never reads or changes `$DSH_HOME/lark` or Credentials.

## Feishu/Lark app setup

The preferred setup is QR onboarding. In Harness Settings → Lark Remote Development, choose Feishu (China) or Lark (Global), select **Generate QR code**, and scan it with the matching mobile app. The official App Registration flow creates a PersonalAgent bot. Its App Secret goes directly to the Harness credential store and is never returned to the browser, plugin state, logs, or cards. After creation, send `/` in the new bot's private chat; only the scanner's exact `open_id` may become the owner on that first message.

If QR registration is unavailable, expand **Manual setup** and configure an existing self-built app:

Create a self-built app, enable its bot, and use WebSocket/long-connection event delivery. Subscribe only to:

- `im.message.receive_v1`
- `card.action.trigger`

Grant the application permission to receive and send bot messages (`im:message`). Grant `im:resource` when image/file input is required. Publish an app version and make the bot available only to the intended owner account. A bot menu item named `进入项目` is optional; it uses the same fast path as `/进入`.

Enter the App ID and App Secret in Harness Settings and choose the matching domain. Secret values follow the same write-only credential path. Manual setup retains the pairing-code fallback.

The first accepted private DM receives a short pairing code. Enter that code locally in Harness Settings. Only the exact paired `open_id` and private-chat ID can read project/session facts or submit work. Group chats, bot echoes, another account, expired/replayed card actions, and stale generations are rejected before project data is read.

## Enter a project and Session

Send exact `/` to open the complete no-model Harness command center. Send `/进入`, `/切换`, or use the `进入项目` menu item to open the no-model project card. Select the full project path, then select an existing ordinary unarchived Session by its Harness title. Internal Session IDs remain only in signed action payloads and are not shown in the picker or confirmation. Running Sessions are listed first; untitled entries appear as `未命名会话`. Archived, deleted, blank, subagent, and project-mismatched Sessions are excluded and revalidated when clicked. **暂不进入项目** closes the picker without changing or clearing the current binding. The final owner/chat/project/Session binding is durable across restart.

`/新建` creates one ordinary Session inside the currently bound workspace and immediately enters the exact returned Session after revalidating workspace membership, ordinary ownership, and cwd. A newly created blank Session is valid only through this exact create receipt; the picker still hides unrelated blank Sessions.

Ordinary text then becomes one remote Harness turn in that exact Session and appears in conversation history as the same visible user message produced by the local composer. Every accepted Feishu event is write-ahead persisted with a pre-created Harness Message ID. Messages are delivered in original Feishu order, one at a time; item N+1 is not submitted until item N is claimed by the selected Session and its exact `turn/end` is observed. Restart recovery reconciles the existing inbox and Session history before reusing that same Message ID, so it does not intentionally duplicate an indeterminate delivery.

Before an active binding exists, ordinary text is not accepted into the durable queue. The bot replies with the current binding status and directs the owner to `/进入` instead of failing the Feishu callback.

Images are downloaded only after owner admission, validated by the Harness AttachmentStore, and committed as durable image references. Generic files are limited to 30 MiB, stored with mode `0600` under `$DSH_HOME/lark/files`, described to the Agent by a private temporary path plus SHA-256, and retained for seven days by default. No attachment is written into the selected project automatically.

## Commands and output

- `/` or `/帮助`: show the complete signed Harness command-center card without invoking a model.
- `/进入` or `/切换`: choose a full-path project and ordinary Session.
- `/新建`; `/重命名 <标题>`: create and enter a Session in the bound workspace, or rename the current Session through the Host API.
- `/模型`; `/推理`: open signed selectors backed by the current Session's fresh provider/model/reasoning directory.
- `/压缩`; `/目标 <内容>`; `/计划 [内容|off]`; `/权限 [预设]`: execute only the matching currently registered Harness commands. The native aliases `/compact`, `/goal`, `/plan`, and `/permission` are also accepted.
- `/技能`; `/工具`; `/任务`; `/用量`; `/诊断`: show bounded current skill, scoped tool, owner-visible job/subagent, completed-message token, and redacted capability views.
- `/解绑`; `/状态`; `/插话 <内容>`; `/停止`: manage the exact binding, steer the existing Agent, or cancel the active remote turn while retaining unrelated inbox work.

A typed `/skill-name ...` is enqueued only when `skill-name` exactly matches the current Session's user-invocable skill catalog. It remains an ordinary visible durable user message; the Harness skill pre-step, not the Lark transport, owns invocation. Unknown slash names never pass through to the Agent, and browser-only export, arbitrary tool execution, shell shortcuts, administrative restart/configuration, and OpenClaw-only commands are not exposed.

Each Harness turn owns one Feishu interactive card. It paints a stable placeholder first, then streams the visible answer first. A separate compact execution timeline shows at most the latest eight safe tool titles/statuses, followed by an independent facts row for elapsed time, exact model ID/provider/reasoning effort, and real Harness input/output/cache token usage when available. While a turn is mutable, one-use signed **Steer** and **Stop** controls target that exact turn; an old card cannot stop a newer task. Intermediate projections coalesce to the latest state within the configured interval instead of queuing one Feishu patch per model chunk; a terminal projection cancels the pending timer and waits for at most one card request already in flight. The route comes from the selected Session's durable request header and is corrected by the actual assistant message, so a model switch is reflected in the same card. Reasoning content, system messages, environment values, raw tool arguments/results, secrets, and unrestricted logs are not projected. A bounded text reply is used once if card creation or update fails.

Harness approval requests use the existing ApiProxy approval record. Feishu exposes only Allow once and Deny; the first valid desktop or Feishu response wins. No always-allow authority is added.

## Disable, recovery, and uninstall

Disable from Harness Settings to reject new ingress, close the WebSocket and mux stream, stop card timers, and pause undispatched remote queue items. Re-enabling does not silently replay them: click Resume queue locally. Full Harness shutdown leaves no receiver or background daemon.

Clear data removes only plugin-owned owner, binding, queue/card/nonce metadata and private staged files. It does not delete Harness projects, Sessions, Session messages, credentials, or unrelated inbox entries. Uninstall with `dsh plugin --profile web remove @missher/dsh-lark`.

Restart Harness after removal. The package dependency and bundle layer disappear together; ordinary Sessions remain unchanged.

## Verification boundary and attribution

Offline tests cover owner gates, signed actions, command-center routing, created-Session validation, model/reasoning revalidation, fixed native-command admission, skill admission, bounded diagnostics, durable FIFO/restart reconciliation, cards, approvals, attachments, settings lifecycle, Loader composition, and Profile removal. A real Feishu acceptance requires App credentials entered by the user in Harness; tests must never import credentials from OpenClaw or Hermes.

The implementation uses the official `@larksuiteoapi/node-sdk`. WebSocket lifecycle and the coalescing card-flush scheduler were informed by the MIT-licensed `@larksuite/openclaw-lark` version `2026.7.16`; App Registration protocol behavior was informed by the ISC-licensed `@larksuite/openclaw-lark-tools` version `1.0.47`. This package independently implements the Harness integration and neither bundles nor depends on either OpenClaw package. See [LICENSE](LICENSE#third-party-notices).

## Model Experience

### Remote owner turns

#### What the model sees

The plugin registers no model tool, system prompt, or hidden instruction. Each accepted ordinary Feishu message, including an admitted `/skill-name ...` invocation, becomes one ordinary visible user-role turn in the selected Session with `source.kind=user`; the paired-owner and transport facts remain in plugin-owned storage rather than model context. Command-center operations run through Host services or the current command registry and do not become model messages. Admitted images appear as durable Harness image attachments; admitted generic files add only the owner text plus their private staged path, display name, SHA-256, and expiry. Feishu identity values, pairing codes, credentials, card action values, transport diagnostics, raw tool payloads, and reasoning are never added to model context.

#### Token effect

An accepted remote turn adds the same user text and admitted attachment description that a local turn would add, then the selected Agent's normal reply, tool calls, and results follow the Session's existing retention policy. The settings UI, transport, project cards, queue metadata, pairing state, and streamed Feishu projection add no model tokens. The card reports the actual Harness model route and token usage but does not feed that report back into the Session.

#### KV Cache effect

Enabling this plugin does not change the model's static prompt or tool-definition prefix. Each claimed remote message appends at the existing Session tail, so it preserves prior prefix cacheability just like a local user turn; switching the bound Session changes only which existing Session receives later tail content.

## Known Limitations and Deferred Work

- One plugin instance supports one paired owner, one exact private chat, and one active project/Session binding; group chat, multiple owners, concurrent bindings, broadcasts, and public-network control are intentionally unsupported.
- QR onboarding depends on the official App Registration service. When it is unavailable, a real Feishu/Lark acceptance requires an existing published self-built app and credentials entered locally in Harness; the package never imports legacy OpenClaw or Hermes credentials.
- Generic files use a private temporary path available only on the Harness host and expire after the configured retention period; the plugin does not upload arbitrary local project files back to Feishu or automatically copy received files into a project.
- Feishu exposes only Allow once and Deny for an existing Harness approval. Always-allow approval authority, arbitrary command/tool passthrough, archived/subagent binding, host-file upload, and autonomous background development are not implemented. `/权限` can only invoke the permission command already registered by the exact Session's Harness composition.
