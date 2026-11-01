# H0 · 两套计划对照与单一入口整理

核验日期：2026-10-25。职责：ChatGPT 计划管理；本次未派发 DeepSeek 工程任务。

## 结论

以 PR #17 的 [计划总表](README.md) 为唯一当前计划/状态入口，保留原 01–14 文件名、顺序和分工；选择性吸收 #18 的验收细节。不引入 TASK_STATUS 第二张当前状态表，不复制第二套任务文件。

PR #18 仍 OPEN/DRAFT，本次未修改其分支或关闭它。建议用户后续授权关闭重复 PR #18，保留 Git 历史；PR #17 另行审查合并。**整理提交不等于两个 PR 已合并或重复 PR 已关闭。**

## 实时 Git 证据（整理前）

| 对象 | HEAD | 状态 | 当前 HEAD CI |
|---|---|---|---|
| main | bf9cf66807e12d0b25872a0fa3869962dde04818 | 主干 | 本次未重跑 |
| #16 | 1fd2ccaed3ee7e1c90c7caee1f22a7458ad1c184 | OPEN / mergeable | [40160267636 SUCCESS](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40160267636) |
| #17 | 2c4a01afe8c69a0735e429dd8115df19a74a40fc | OPEN / mergeable | [40161821455 SUCCESS](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40161821455) |
| #18 | 42cec57ae7018735cb6c65a4ef8b0a1d80473810 | OPEN / DRAFT / mergeable | [40159114676 SUCCESS](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40159114676) |

三份 PR 的 reviews API 均为空；CI 成功不代表人工批准。上述 #17 是本次提交的父版本，后续提交 CI 必须按新 HEAD 查询，不能沿用父版本结果。

## 逐项对应（全部 14 对已阅读）

| ID | #17 唯一正文 | #18 历史来源文件 | 处理 |
|---|---|---|---|
| 01 | [01-gui-coverage-closeout.md](01-gui-coverage-closeout.md) | `01-gui-test-coverage.md` | 范围等价；保留 #17 已发送版本。#18 的八个 fixture 数量不是新增完成证据，实施时以真实测试为准。 |
| 02 | [02-tts-a-complete-review.md](02-tts-a-complete-review.md) | `02-tts-a-pr16-review.md` | #18 旧 head/PLANNED 过时；保留 #17 v2 终审，不重新开发候选。 |
| 03 | [03-merge-tts-a-pr16.md](03-merge-tts-a-pr16.md) | `03-merge-pr16.md` | 合并门禁等价；保留 #17，仍须终审和单独授权。 |
| 04 | [04-wechatagent-extensions-audit.md](04-wechatagent-extensions-audit.md) | `04-wechatagent-extensions.md` | 吸收安装/卸载/图标公开性与禁止昵称作为目标 ID。 |
| 05 | [05-unified-core-a.md](05-unified-core-a.md) | `05-unified-core-architecture.md` | 吸收实例、隐私、取消字段审查及回执/恢复矩阵；作为设计要求。 |
| 06 | [06-provider-core-b.md](06-provider-core-b.md) | `06-provider-core.md` | 吸收无 GPU、迁移、脱敏、artifact 校验和健康语义。 |
| 07 | [07-svc-a-seed-vc-rvc-audit.md](07-svc-a-seed-vc-rvc-audit.md) | `07-svc-a-research.md` | 吸收固定研究文档路径、权重分发许可和五类负向场景。 |
| 08 | [08-shared-core-c-voice-audio-tasks.md](08-shared-core-c-voice-audio-tasks.md) | `08-shared-audio-voice-task.md` | 吸收校验和/清理、clip/大小、云端资源独立、后端锁定和重复恢复。 |
| 09 | [09-phase4b2b2b-config-ux.md](09-phase4b2b2b-config-ux.md) | `09-config-ui-4b2b2b.md` | OFFLINE 草稿与 Owner 写入拆分已覆盖；不把 Sender PUT 能力变成授权。 |
| 10 | [10-tts-c-local-providers.md](10-tts-c-local-providers.md) | `10-local-tts.md` | 三类本地路线、逐 Provider PR、Fake→单项授权已覆盖；不额外修改。 |
| 11 | [11-tts-d-cloud-custom-api.md](11-tts-d-cloud-custom-api.md) | `11-cloud-custom-tts.md` | 吸收取消、重定向拒绝、独立健康与不支持能力禁用测试。 |
| 12 | [12-svc-b-singing-wechatagent.md](12-svc-b-singing-wechatagent.md) | `12-svc-b-singing.md` | 吸收四个 Fake 的 E2E、时长/体积限制与清理。 |
| 13 | [13-whale-relay-a-b-c.md](13-whale-relay-a-b-c.md) | `13-whale-relay.md` | 吸收回执反例、auto 禁用及前端状态来源；A/B/C 拆分不变。 |
| 14 | [14-onboarding-release-quality.md](14-onboarding-release-quality.md) | `14-install-release.md` | 吸收版本化音色 manifest、离线导入/导出和安装生命周期验收；不采用要求全部可选 SVC 完成才发布基本 TTS 的过强依赖。 |

#18 来源固定为 [42cec57](https://github.com/qianqiucn/dsh-whale-voice/tree/42cec57ae7018735cb6c65a4ef8b0a1d80473810/docs/plans)，避免后续分支变化抹去对照依据。

## 重叠文件与台账处理

- AGENTS.md：#17 已有更明确的 ChatGPT-only 计划流程与 DeepSeek 工程分工。#18 的泛化计划职责不覆盖它。
- docs/README.md：保留 #17 入口，不添加指向第二套 TASK_STATUS 的当前权威链接。
- docs/plans/README.md：唯一状态表，追加 H0 结果入口；不改变 01–14 顺序。
- #18 TASK_STATUS.md：没有新增可核实的 Plan 01 完成证据；Plan 02 的 PLANNED 已落后于 #16 的实际实现。其真实 GUI 验收限制保留在本报告：原始 v3 envelope、真实 Console/Network、异常注入、780px 实机仍未验证。这来自既往报告，非本次运行观察。
- 两套计划名称不同但语义重复；分别可合并并不证明顺序合并安全。本轮未模拟合并，未断言 Git 必然冲突。

## 保持的状态与下一步

- Plan 01：SENT。仓库 PR 搜索未找到对应 GUI coverage PR，但搜索为空不能证明本地提交不存在；506fe3b 与 26/26 仍是待核实历史报告。
- Plan 02：IN PROGRESS / REVIEW_REQUIRED。只读核对 #16 两个 Registry 确认 10 个 TTS 和 2 个 SVC 候选均 NOT_IMPLEMENTED / selectable:false；本轮未执行 T01–T10 全部终审，不标 DONE。
- Plan 03：等待 Plan 02 终审和用户单独合并授权。
- 2B-2a：按历史用户报告保持 INTEGRATED / NOT VERIFIED；本轮没有访问运行中的 DSH。
- TTS-A：DESIGN / OFFLINE；2B-2b 未开始；Hook 研究态；Worker NEVER_WRITE；SAVED 不等于 APPLIED；UNKNOWN 不自动重发。

H0 文档整理完成后停止。下一项建议是 Plan 02 的 TTS-A/TTS-A-H 终审，同时等待 Plan 01 的测试 PR 证据；不会自动再派一份或开始生产实现。

## 验证范围

本次只改 docs/plans 文档；检查改动路径、UTF-8 字符、Markdown 相对文件链接、尾随空白和常见秘密/私人路径模式。运行代码与 UI 未改，本轮不在本机运行 Node/UI 测试；新 HEAD 的 GitHub CI 另行核对并在对话报告。未修改 main、生产配置、服务、音频设备或微信，未合并、关闭、删除或强推任何 PR/分支。
