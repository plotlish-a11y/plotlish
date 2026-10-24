# Plotlish R3.0｜纯净完整源码包（不含课程）

基于 R2.9 UI 美化版增量改进，保留已有阅读和英语学习能力。**无任何小说课程、正文、插图、封面、人物素材或演示数据**。

## 目录

- `.github/workflows/plotlish-beta.yml`：GitHub Actions 部署工作流
- `beta-app/core/`：网站源文件（HTML/JS/CSS、原版风格的近似 SVG Logo、Favicon）
- `beta-app/tools/`：课程导入、构建、站点验证工具
- `beta-app/tests/`：单元测试、课程构建及 UI 静态回归检查
- `beta-app/docs/`：课程接口约定、R3.0 变更说明
- `course-packages/`：待导入课程目录，只有 README；不会内置课程

## 改动重点

1. 作品 CTA 文字根据当前章节生成；多章节不再错误显示“第一章”。
2. 清理重复的“继续阅读”“当前剧情图”入口，以及永不显示的右栏图片组件和浮动翻译代码。
3. 阅读正文保留插图点击放大、当前句翻译及逐句对照；右侧保持语言学习笔记。
4. 阅读设置分类补齐键盘导航和 tab/tabpanel 语义；改善焦点可视、文字对比度和手机端排版。
5. 保留小说详情页的全幅人物/场景大图，不替换其背景。

具体见 `beta-app/docs/R3.0_UI_精修与验证.md`。

## 构建 / 自测

```bash
cd beta-app
python -m unittest discover -s tests -p test_build.py
python tools/build.py --packages-dir ../course-packages
python tools/verify_beta_site.py
```

源码导入新课程仍使用原先 `book.json` / `course.json` 结构和构建工具；网站只会展示实际发布的课程。上传到已含旧课程的 GitHub 分支时，**需要清理旧课程路径**，单纯覆盖源文件不会删除仓库原有小说内容。

## 说明

- SVG 标志根据既有截图复原，并非从原正式站获取的原始设计文件。
- 不包含 `dist/` 构建产物、课程测试数据或自动测试生成的缓存。
- 没有推送或部署到任何线上分支；在线词典及真实设备 TTS 需要部署后联调。
