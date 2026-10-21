# Plotlish Beta 课程网站源代码

本文件夹在共用 GitHub 仓库的 beta 分支中独立存在，不覆盖旧的 site/、author/、lessons/、tools/ 等路径。

- `core/`：无小说内容的 R2.3.1 阅读程序。
- `packages/`：每个 ZIP 一章课程；已包含两章经测试的示例数据。
- `tools/build.py`：从 core 与 packages 自动生成 `dist/`，不要手改 dist。
- `tools/verify_beta_site.py`：检查课程及公开资源完整性。
- `tools/check_beta_cloudflare_target.py`：用 GitHub Secrets 读取 Cloudflare Pages 生产分支，核验只能更新 plotlish-test 项目。
- `tests/test_build.py`：构建单元测试。

新增章节：切到 GitHub `beta`，进入 `beta-app/packages/`，选择 **Add file → Upload files**，直接上传新章节 ZIP。新增文件只需一次提交，自动部署。

警告：此仓库为 Public。beta 中的课程 ZIP 可以被任何人下载；只上传已确认公开的小说。GitHub Secrets 不得写入此文件夹。
