# Plan 12 · SVC-B AI 翻唱与 WeChatAgent 扩展入口

**状态：PLANNED；前置：SVC-A、Shared Core-C、WeChatAgent 扩展审计。**

## 引擎与流水线
选经过许可审计的 Seed-VC/RVC，隔离进程进行已有歌声音色转换；原曲→（按需）人声分离→转换→校验→混音→试听→保存/可选发送。必须分别显示生成、预处理、转换、混音、交付的状态；不能声称 Seed-VC 直接从歌词作曲。

## UI
在 Whale Voice 内复用音色库、任务与日志、Provider 选择、组件管理；可增加唱歌专属工作区，不另造第二套 Core。展示来源素材、参考音色、引擎、进度、试听、输出格式、来源授权说明。

## WeChatAgent 集成
若第 04 阶段证实受支持的扩展注册 API，可设计 Whale Voice 扩展卡片与指定聊天授权；否则继续 DSH Tool/Plugin + WeChatAgent Adapter，不擅改内部清单。WeChatAgent 保有会话身份和授权职责。

## 安全
不得自动接受外部任意文件链接，不得未经授权克隆他人声音或默认公开参考音频；真实转换、安装扩展、微信发送各需单独授权。长歌曲能否发微信语音气泡取决于已验证后端能力，必要时支持本地保存/文件交付。先 Fake SVC 和 Fake Relay 测试，再分步实现。