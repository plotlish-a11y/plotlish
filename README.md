# Plotlish｜Production 自动部署 + 隐藏文件修复版（无课程）

**本版专门修正自动部署额外拦截，与 Beta 的操作方式保持一致。**

## 改动
- **RC 版本不会再被人为阻止**：`RELEASE_VERSION=v1.0.0-rc.3` 可进入完整构建和部署流程。
- **允许先部署空书架**：不含课程的纯源码构建也可以发布；以后导入课程再自动更新。
- **保留实际必要检查**：自动测试、已有课程的 JSON 和资源完整性验证、SHA-256 产物校验、Cloudflare 正式项目/生产分支验证、避免旧提交覆盖新提交。
- Beta 工作流与网页核心代码均不修改；独立 Production Secrets 不变。

## 注意：推送到 main 的实际效果
如果 GitHub Actions 变量 `PLOTLISH_PROD_AUTO_ENABLED=true`，向 `main` 推送本源码会**尝试自动覆盖 `plotlish.pages.dev` 的当前构建**。

此包不包含任何课程，因此首次成功部署后，网站会显示**空书架**。若目前正式站已经有课程，它们会从新版本目录消失；确认这一点符合你的计划后再推送。如果希望保留当前课程，请先将课程同步到仓库 `course-packages/`。此前浏览器内的 localStorage 数据不会被本次构建自动清空，但旧进度可能因目录为空暂时无法匹配。

`plotlish-production` GitHub Environment 必须能访问 `CLOUDFLARE_API_TOKEN_PROD` 和 `CLOUDFLARE_ACCOUNT_ID_PROD`。

Cloudflare 项目仍需符合 `plotlish` / `plotlish.pages.dev` / `main`，如果它连接了原生 Git 自动发布，则应避免同时执行两套部署；代码保留这项防冲突检查（可能需要 `ALLOW_GIT_INTEGRATED_PROD=true`，并关闭原生 Cloudflare Production 自动部署）。

## 本地验证
```bash
cd beta-app
python -m unittest discover -s tests -p 'test_*.py' -v
python tools/build.py --packages-dir ../course-packages
python tools/verify_beta_site.py
python tools/verify_production_site.py --allow-empty
```

正式版仍有跨浏览器/真机等尚未完成的验收项目。此版是按你的要求解除额外部署限制，并不表示所有浏览器兼容性问题都已验证。

## 本次 Production Artifact 修复

在具有课程的正式站构建中，`build.py` 会生成 `beta-app/dist/.plotlish-generated`。
文件完整性清单也包含它；GitHub `actions/upload-artifact@v4` 默认会跳过隐藏文件，导致 `deploy` 阶段出现 `Files missing or unexpectedly added: ['.plotlish-generated']`。

已在 `.github/workflows/plotlish-production.yml` 的 `Save validated immutable build` 步骤添加 `include-hidden-files: true`，并新增对应自动测试。保留原有 SHA-256 产物校验，**没有删除校验**；Beta 工作流和核心阅读功能均未改。

**如果 `main` 已有 10 章课程，不要删除或覆盖 `course-packages/<作品ID>/`。** 最安全的操作是只把 ZIP 内 `.github/workflows/plotlish-production.yml` 上传到仓库同名路径，其余源码保持当前线上版本。此完整源码 ZIP 不包含课程，整包覆盖可能导致课程文件被移除。修复工作流后需要新提交才能触发新流程，单纯重试旧提交不会修复原 Artifact。
