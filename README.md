# Plotlish Beta R2.7 · 完整纯净核心（A+B+C + 个人书架UI优化）

当前源码包含首页运营、发现故事、真正的个人书架以及阅读器 4:3 图文精读。
网站通用核心保持纯净（`beta-app/packages/` 不含具体小说）；仓库根目录 `course-packages/` 独立保存已经确认的第一章阅读资源，供 GitHub Beta 自动部署。

## 项目
- `beta-app/core/`：通用网站页面、样式与交互；不内置小说。
- `beta-app/packages/README.md`：本目录保持纯净，仅用于本地临时测试。
- `course-packages/the-runaway-bride/`：独立正式课程资源；第一章包含249句、52条注释与9张新剧情图。
- `beta-app/templates/homepage.empty.json`：首页运营配置的空模板。
- `beta-app/tools/`：构建/校验课程资源；`.github/` 是原部署工作流。
- `beta-app/tests/`：源码/数据/构建自动化测试。

## 本轮阅读器改变
- 桌面端：4:3 画面使用右侧学习面板；当前句翻译、知识点在同一栏。
- 关闭右侧讲解后：图片在正文的剧情位置展示，不会消失。
- 手机/窄屏：连续阅读时全尺寸比例插入原文；分页时在场景开始处显示全比例插图，空间允许时与正文同页。
- 插图始终只在剧情到达后解锁；可以独立选择隐藏插图。
- 修复由滚动模式返回分页模式后，因隐藏容器导致计算出异常数量分页的问题。
- 保留原句子 ID、原本地数据键、朗读、词汇和章节完成机制。

## 使用
```sh
cd beta-app
python tools/build.py --packages-dir ../course-packages   # 构建第一章
python tools/verify_beta_site.py --site dist --require-book the-runaway-bride --require-chapter the-runaway-bride-ch001 --require-sentences 249 --require-scenes 9
python -m unittest discover -s tests -p test_build.py -v
cd dist
python -m http.server 8000
```
访问 http://localhost:8000/ 。`beta` 分支推送后，工作流会从 `course-packages/` 构建并验证；Cloudflare 已部署网页若缺失第一章，Actions 会标记失败。请保持现有 Cloudflare Beta Secrets。

**不要将整个 ZIP 当作一个 GitHub 文件上传**：解压并将 `.github/`、`beta-app/`、`course-packages/` 合并到仓库根目录后提交。原有 `.git` 不要删除。
目前未修改线上网站，亦未经过正式部署与真机验收。

## 个人书架 UI 修订（2026-10-22）
- 改为单列限宽的横向书籍条目：左侧竖版封面，右侧标题、阅读状态、进度与操作。
- 手机上保持横向结构，隐藏冗长简介并压缩操作布局。
- 取消单本小说时巨大横幅式封面，收紧顶部标题区和筛选栏。
- 阅读百分比仅在已知准确进度时显示，无法可靠计算时不虚构进度。
- 未改变个人书架本地存储格式、课程数据格式、学习进度键或发布流程。

真实浏览器截图位于本次交付之外，课程演示与测试插画不会被打入本源码。

## 第一章发布修复（2026-10-22）
- 阅读器章末只保留“阅读完成”和导航，不再出现复述、答题、教师答案。旧反思记录保留在数据兼容层。
- 原 GitHub Actions 只从 `beta-app/packages/` 构建而发布空目录；现在从 `course-packages/` 读取。
- 本地构建仍允许空网站；测试站部署必须包含 `the-runaway-bride-ch001`、249句及9张场景图。
- 部署后通过测试站真实 `catalog.json` 进行远程确认；若未发布成功，Actions 不显示绿色成功。
- 本源码包不包含构建产物、无关截图或额外预览站点。
