## 工程 PR 共同检查清单（DeepSeek / ChatGPT）

- [ ] 我已阅读 [AGENTS.md](../AGENTS.md)，核对最新 main / base / head、工作区、相关 PR、CI 和权限边界；未沿用过期 SHA。
- [ ] 我已核对用户授权的技术任务范围和涉及的架构/安全契约。

## 仅 ChatGPT 计划管理 PR 的附加清单（普通工程 PR 可填“不适用”）

- [ ] 我已阅读 [EXECUTION_STANDARD.md](../EXECUTION_STANDARD.md) 与 [执行计划总表](../docs/plans/README.md)。
- [ ] 若是新想法/发送计划/完成打标，已同步计划、排序、`docs/plans/CHANGELOG.md` 与证据；`DONE` 不等于 PR `MERGED`。
- [ ] 此 PR 仅包含计划管理/协调所需的文档或相关 Git 维护，未擅自改变 DeepSeek 的生产实现。
- [ ] 我已检查 Diff、构建/测试（或明确说明未运行）、文档编码与隐私/密钥泄漏。
- [ ] 我没有未经单独授权就合并、Force Push、修改生产配置、重启服务、发送微信消息、运行 Hook/DLL、调用付费 API 或发布 Release。

## 本次变更范围

<!-- 说明涉及哪一份计划、哪个组件，以及为什么修改。 -->

## 验收证据

<!-- 当前 HEAD、测试、CI 链接；不要将 OFFLINE 冒充 INTEGRATED/VERIFIED。 -->

## 生产与权限影响

<!-- 是否修改生产配置、服务、微信、音频设备？有哪些仍需单独授权？ -->

> 此模板提醒开发者核对流程，不代表点击勾选就获得生产操作或 PR 合并授权。
