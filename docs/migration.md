# Migrating from `@deepseek-ai/dsh-lark`

The package name changed, but the runtime Bundle ID (`lark`), Storage Domain (`dsh_lark`, schema 1), credential references, and `$DSH_HOME/lark` data boundary did not.

1. Quit DeepSeek Harness completely. Profile directory replacement is intentionally refused as an in-app operation.
2. Download `missher-dsh-lark-0.2.0.tgz` and verify it against `SHA256SUMS.txt` from the same GitHub Release.
3. From this standalone source checkout, run the migration with exact absolute paths:

   ```bash
   node scripts/migrate-profile.mjs \
     --profile-dir /absolute/path/to/.dsh/profiles/web \
     --package /absolute/path/to/missher-dsh-lark-0.2.0.tgz
   ```

4. Keep the printed `backupDir` until the new plugin has passed your Feishu/Lark acceptance. Then restart Harness.

The migration rejects a Profile containing both package names or another installed `id: lark` Bundle. It copies the exact Profile without `node_modules`, installs the new package in a sibling staging directory, validates the package manifest and patch, and swaps directories only after success. A staging failure leaves the original Profile bytes unchanged. It never reads, copies, moves, deletes, or rewrites `$DSH_HOME/lark` or the Harness credential store.

For a Profile without the legacy package, use the normal `dsh plugin --profile web add ...` install command instead.
