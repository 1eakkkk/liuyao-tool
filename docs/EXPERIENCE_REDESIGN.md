# 起卦、解读与复盘的交互重构

本次更新围绕同一件事的完整过程组织页面：在起卦时写下问题，带着原卦进入解读，随时查阅卦簿，之后回看登记的判断。沿用原有排盘、物理模拟、AI 协议和本地存储格式。

## 界面与操作

- 单层导航，学习与帮助按需展开。六条空间爻线构成起卦空态，完成后由真实卦盘取代；没有持续装饰动画或滚动劫持。
- 起卦入口与 AI 页面共用问题，刷新及长期返回沿用原有重置规则。
- 问卦记录使用独立原生弹层，保留工作区和搜索内容，关闭后焦点回到对应入口。删除确认进入当前弹层，反馈直接在卦簿内显示。
- 判断登记可筛选待复盘、已逾期、已有结果和全部。截止日期包含当日；尚未发生、无法判断仍留待复盘。切换筛选保留草稿，不计算预测准确率。
- 日夜主题使用一致语义；触控目标至少 44px；支持键盘、减少动态及窄屏。所有动效均可中断，原生滚动保留。

## 验证

新增 `npm run test:browser:experience`，覆盖卦簿搜索、输入保留、焦点归还、快速关闭、嵌套确认、移动端、主题和同卦往返。已有 interface、entry、theme、controls、usability 检查同步更新实际交互期望，保留业务断言。

Linux 可指定系统 Chromium，例如：

```sh
BROWSER_EXECUTABLE=/usr/bin/chromium BROWSER_ENGINE=chromium npm run test:browser:experience
```

AI 流程验证使用拦截回复；浏览器回归不代表真实模型效果验证。未新增供应商、云端账户或知识库自动注入。

## 设计参考

- [Linear 界面调整](https://linear.app/now/behind-the-latest-design-refresh)：任务与导航的注意力层级。
- [Raycast](https://www.raycast.com/)：围绕产品对象组织页面。
- [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)：从题材建立视觉识别，集中设计重点。
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)：键盘、焦点、动态偏好与触屏规范。
- [Motion 实践](https://github.com/motiondivision/ai-kit/tree/main/plugins/motion/skills/motion/best-practices)：状态反馈、可中断过渡及简单动画优先使用浏览器能力。

本次图形、样式及交互实现为项目原创，没有复制商业网站素材或引入动画运行库。
