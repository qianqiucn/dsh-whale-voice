# 04 · WeChatAgent 扩展机制与聊天授权只读审计

**状态：PLANNED。** WeChatAgent 是必需平台，不是 TTS Provider。已安装版的参考基线为 0.3.9；其他版必须重新核验。

## 目标

确定 Whale Voice 能否使用 WeChatAgent 公开支持的扩展体系，让“语音 / 唱歌 / 状态”作为可管理功能出现，同时不复制第二套微信账号、reader、session 或白名单。

## 审计要点

1. 源码与文档核验：扩展清单是动态 API、内置管理还是内部功能？安装/配置/启停/卸载/图标等扩展协议是否面向第三方？
2. DSH Plugin/Tool/Skill 与 WeChatAgent 扩展的关系，消息入口和可调用工具返回错误/状态/取消的约束。
3. 会话范围的私聊/群聊授权、撤销、目标身份校验、账号切换、版本兼容，不能通过昵称当 ID。
4. 如果正式扩展 API 不存在，推荐现有 DSH Tool + WeChatAgent Adapter 路径，不注入未公开内部扩展注册。
5. 对 0.3.9 与公开可得的新版本分别标 `SUPPORTED / INTERNAL_ONLY / UNSUPPORTED / UNKNOWN`；记录 Hook / DLL 授权边界。
6. 输出 `docs/WECHATAGENT_EXTENSION_INTEGRATION.md` 和矩阵，必要时附只读/fake 测试、PR。

## 禁止

不安装 DLL、不改真实 WeChatAgent、不读私人聊天/联系人、不发送、不替用户改变授权；完成后停止。
