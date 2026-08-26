# 从 `@deepseek-ai/dsh-lark` 迁移

公开包名已经改变，但运行时 Bundle ID（`lark`）、Storage Domain（`dsh_lark`，schema 1）、凭据引用和 `$DSH_HOME/lark` 数据边界都没有改变。

1. 完整退出 DeepSeek Harness。Profile 目录替换有意不允许在应用运行时执行。
2. 下载 `missher-dsh-lark-0.2.0.tgz`，并使用同一个 GitHub Release 中的 `SHA256SUMS.txt` 校验。
3. 在本独立源码仓库中，用精确绝对路径运行迁移：

   ```bash
   node scripts/migrate-profile.mjs \
     --profile-dir /absolute/path/to/.dsh/profiles/web \
     --package /absolute/path/to/missher-dsh-lark-0.2.0.tgz
   ```

4. 保留命令输出的 `backupDir`，直到新版插件完成你的飞书/Lark 实际验收，然后重启 Harness。

如果 Profile 同时包含新旧包名，或已经存在另一个 `id: lark` Bundle，迁移器会拒绝继续。它会复制精确 Profile 但不复制 `node_modules`，在同级 staging 目录安装新包，校验包清单和 patch，成功后才交换目录。staging 失败时，原 Profile 字节保持不变。迁移器绝不会读取、复制、移动、删除或改写 `$DSH_HOME/lark` 和 Harness 凭据库。

如果 Profile 中没有旧包，请直接使用普通的 `dsh plugin --profile web add ...` 安装命令。
