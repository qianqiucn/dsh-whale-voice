# 12 · SVC-B：AI 翻唱工作流与 WeChatAgent 扩展入口

**状态：PLANNED。** 前置：04 扩展审计、05/08 统一 Core、07 SVC 候选审计。

## 工作流

按来源分支：纯人声→SVC→验证→混音；完整歌曲→人声分离→转换→混音→试听→交付。SVC 需要源歌声或其他真实歌声合成步骤；不能仅输入歌词就假装 Seed-VC 能演唱。

为每步提供状态、进度、取消、时长/体积限制、临时文件删除及版权/克隆授权提示。长歌曲默认不强制送微信语音气泡，需验证文件交付后端能力。

## UI

在 Whale Voice 现有音色中心/任务日志/组件管理基础上引入唱歌专属区域，不重复建立第二个完整应用。共享 Voice Profile，但各 SVC 模型资产独立。

## WeChatAgent

如 04 证实存在第三方正式 Extension API，才设计“Whale Voice/唱歌”扩展卡、会话授权与 DSH 深链接；否则采用既有 DSH Tool + WeChatAgent Adapter，不私改内部注册或注入文件。

## 验收

先 Fake SVC/Audio/WeChatAgent/Relay E2E；模型、真实音频/微信消息和扩展安装需各自授权。独立 PR，成功不等于真实发送完成；完成停止。
