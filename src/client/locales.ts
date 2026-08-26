/** Simplified Chinese labels for the Lark settings section. */
export const zh = {
  section: '飞书远程开发', title: '飞书远程开发', subtitle: '把飞书变成 Harness 的远程开发入口',
  scanToConnect: '扫码连接飞书', scanDescription: '自动创建个人机器人并安全写入凭据，无需手动复制配置。',
  startQr: '生成二维码', regenerateQr: '重新生成', cancelQr: '取消扫码', qrCodeAlt: '飞书连接二维码',
  feishuChina: '飞书（中国）', larkGlobal: 'Lark（国际）', region: '账号区域',
  qrPending: '等待扫码确认', qrSucceeded: '机器人已创建', qrDenied: '已取消授权',
  qrExpired: '二维码已过期', qrFailed: '生成失败', qrPreparing: '正在生成二维码',
  userCode: '验证码', scanStep1: '使用飞书扫描二维码', scanStep2: '确认创建个人机器人',
  scanStep3: '回到机器人私聊发送 /', waitingFirstMessage: '最后一步：在新机器人私聊中发送 / 完成所有者绑定。',
  manualSetup: '手动配置', manualDescription: '扫码不可用时，填写已有机器人的 App ID 和 App Secret。',
  appId: 'App ID', appSecret: 'App Secret', saveCredentials: '保存并连接',
  pairingCode: '配对码', pair: '确认配对', pairingHelp: '手动连接后，在机器人私聊获取配对码。',
  connectedTitle: '远程开发已就绪', standaloneRelease: '飞书插件独立发布，可随时单独停用或卸载。',
  enabled: '插件状态', connected: '连接状态', pairing: '所有者配对', binding: '当前绑定', queue: '远程队列',
  project: '项目', session: '会话', projectPath: '项目路径', queuedMessages: '待处理消息',
  enable: '启用', disable: '停用', active: '已启用', disabled: '已停用', resume: '恢复队列',
  paired: '已配对', unpaired: '未配对', online: '已连接', offline: '未连接', noBinding: '尚未选择项目',
  advancedMaintenance: '高级维护', testConnection: '测试连接', cleanup: '清理临时文件',
  clear: '清除插件数据', repair: '重新配对', retry: '重试',
  actionFailed: '操作未完成，请检查配置后重试。', loadFailed: '无法读取插件状态，请重试。',
  busy: '正在处理', confirmClear: '确定清除飞书插件的绑定和队列数据吗？',
  confirmRepair: '确定清除当前所有者并重新配对吗？',
} satisfies Record<string, string>

/** Stable locale keys shared by both settings dictionaries. */
export type LarkLocaleKey = keyof typeof zh

/** English labels for the Lark settings section. */
export const en = {
  section: 'Lark Remote Development', title: 'Lark Remote Development', subtitle: 'Use Lark as a remote development entry to Harness',
  scanToConnect: 'Connect by QR code', scanDescription: 'Create a personal bot and store its credentials securely without copying configuration.',
  startQr: 'Generate QR code', regenerateQr: 'Generate again', cancelQr: 'Cancel', qrCodeAlt: 'Lark connection QR code',
  feishuChina: 'Feishu (China)', larkGlobal: 'Lark (Global)', region: 'Account region',
  qrPending: 'Waiting for scan', qrSucceeded: 'Bot created', qrDenied: 'Authorization cancelled',
  qrExpired: 'QR code expired', qrFailed: 'Could not generate', qrPreparing: 'Generating QR code',
  userCode: 'Verification code', scanStep1: 'Scan with Feishu or Lark', scanStep2: 'Confirm personal bot creation',
  scanStep3: 'Send / in the bot chat', waitingFirstMessage: 'Last step: send / to the new bot to bind its owner.',
  manualSetup: 'Manual setup', manualDescription: 'If QR setup is unavailable, enter an existing bot App ID and App Secret.',
  appId: 'App ID', appSecret: 'App Secret', saveCredentials: 'Save and connect',
  pairingCode: 'Pairing code', pair: 'Pair owner', pairingHelp: 'After manual connection, get the pairing code from the bot chat.',
  connectedTitle: 'Remote development is ready', standaloneRelease: 'The Lark plugin ships independently and can be disabled or removed on its own.',
  enabled: 'Plugin status', connected: 'Connection', pairing: 'Owner pairing', binding: 'Current binding', queue: 'Remote queue',
  project: 'Project', session: 'Session', projectPath: 'Project path', queuedMessages: 'Queued messages',
  enable: 'Enable', disable: 'Disable', active: 'Enabled', disabled: 'Disabled', resume: 'Resume queue',
  paired: 'Paired', unpaired: 'Unpaired', online: 'Connected', offline: 'Disconnected', noBinding: 'No project selected',
  advancedMaintenance: 'Advanced maintenance', testConnection: 'Test connection', cleanup: 'Clean temporary files',
  clear: 'Clear plugin data', repair: 'Re-pair owner', retry: 'Retry',
  actionFailed: 'The action did not complete. Check the configuration and retry.', loadFailed: 'Could not load plugin status. Retry.',
  busy: 'Working', confirmClear: 'Clear the Lark binding and queued data?',
  confirmRepair: 'Clear the current owner and pair again?',
} satisfies Record<LarkLocaleKey, string>
