# 录音上传界面 Design QA

## 对照证据

- Source visual truth: `docs/superpowers/specs/assets/recording-upload-reference.png`
- Implementation initial: `docs/superpowers/specs/assets/recording-upload-desktop-initial.png`
- Implementation selected: `docs/superpowers/specs/assets/recording-upload-desktop-selected.png`
- Mobile implementation: `docs/superpowers/specs/assets/recording-upload-mobile-initial.png`
- Combined comparison: `docs/superpowers/specs/assets/recording-upload-design-comparison.png`
- Source pixels: 1536 × 1024
- Desktop screenshots: 1440 × 1153 and 1440 × 1106; CSS viewport 1440 × 1000; deviceScaleFactor 1
- Mobile screenshot: CSS viewport 390 × 844; deviceScaleFactor 1; document scrollWidth 390
- States: initial upload, selected file before upload, consent disabled/enabled

## Full-view comparison

实现保留了产品现有导航、外层步骤和输入方式标签，把参考图中的录音卡片嵌入当前表单。卡片的标题、三步状态、虚线拖拽区、文件摘要、处理说明、授权勾选和全宽主按钮均与参考图保持同一层级。桌面端使用现有 `max-w-4xl` 表单宽度，移动端自然收窄且没有横向滚动。

## Focused region comparison

`recording-upload-design-comparison.png` 将参考图、初始状态和已选文件状态放在同一画面中比较。参考图是独立提案画板，实现图包含真实产品上下文，因此外围留白和容器比例不做逐像素匹配；核心卡片的顺序、间距、圆角、品牌渐变和说明密度保持一致。

## Required fidelity surfaces

- Fonts and typography: 沿用项目 Inter 与现有中文字体回退。标题、正文、辅助文本分别使用 18px、14px、12px 层级；没有异常截断或不可读换行。
- Spacing and layout rhythm: 卡片使用现有 24/32px 内边距、16px 圆角与轻阴影。初始和已选文件状态的纵向节奏一致；390px 下控件保持完整。
- Colors and visual tokens: 只使用项目既有 brand/slate、成功、警告和错误色；主按钮和当前步骤使用 indigo 到 violet 品牌渐变。
- Image quality and asset fidelity: 界面没有需要生成的位图资产；所有图标使用项目既有 `lucide-react`，参考图仅作为验收证据。
- Copy and content: 保留 500 MB、60 分钟、24 小时、30 分钟上传空闲终止和仅分析回答文字的真实限制。最终操作文案明确为“确认并填入面试记录”。

## Interaction and accessibility checks

- 文件选择不会触发上传；选择后主按钮保持禁用。
- 勾选授权后“上传并转写”启用；本次视觉验收未点击该按钮，避免调用真实 ASR。
- 文件输入、复选框、上传进度和三步状态均有可访问名称或语义。
- 浏览器控制台 error/warning 数量为 0。
- 390px 视口 document scrollWidth 等于 innerWidth，未出现横向溢出。

## Findings

首轮发现标题图标容器小于参考图，属于 P2 层级偏差；已将 `IconTile` 固定为 40 × 40px。修正后的标题图标、文字基线和参考图一致，当前没有未解决的 P0、P1 或 P2 差异。

P3：移动端为了避免文字拥挤，三步指示只显示数字；桌面端显示完整标签。这是有意的响应式取舍。

## Comparison history

- Pass 1: 对照参考图检查桌面初始和已选文件状态，发现标题图标容器偏小；将 `IconTile` 修正为 40 × 40px。
- Pass 2: 修正后复查标题层级，并将视口固定为 390 × 844，确认无横向溢出、主操作完整可见，没有剩余 P0/P1/P2 问题。

## Implementation checklist

- [x] 初始拖拽状态
- [x] 已选择文件状态
- [x] 授权前后主按钮状态
- [x] 桌面与移动响应式
- [x] 浏览器控制台检查

final result: passed
