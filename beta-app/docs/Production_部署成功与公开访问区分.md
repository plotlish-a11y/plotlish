# Plotlish Production · 发布成功与公共访问核验分离修复

## 修复背景
Cloudflare Wrangler 成功上传 102 个文件并完成部署，但 GitHub Actions 最后对
`https://plotlish.pages.dev/release.json` 做匿名请求时收到 HTTP 403。
旧工作流把 HTTP 403 误当成整个部署失败。**403 的具体原因尚未经 Cloudflare 控制台验证。**

## 新的验证逻辑
1. 原有构建、课程、SHA-256 文件清单、提交 SHA、项目和生产分支检查全部保留。
2. 部署后调用 Cloudflare Pages 官方 API，核查 `plotlish`、`production`、`main`、
   `GITHUB_SHA` 以及部署阶段 `success`。只有它通过才算 Cloudflare 部署成功。
3. 独立检查 `https://plotlish.pages.dev/release.json`。
   - 200 且版本匹配：公开站点验证通过。
   - HTTP 401/403 或网络不可访问：工作流产生黄色警告，注明**公开访问未验证**，
     不把已成功的 Cloudflare 部署判为文件上传失败。
   - 200 但版本不匹配：仍然失败，避免掩盖正式站指向旧版本的问题。

## 当前线上尚待确认
如果无痕窗口打开正式站也返回 403，请在 Cloudflare 控制台检查
Workers & Pages > plotlish > Settings > Access policy，以及 Zero Trust Access 和 WAF 规则。
不应为了变绿而忽略网站实际无法公开访问的情况。

## main 已经有课程时请特别注意
这个完整源码包不含课程。**不要用完整源码包覆盖 `course-packages/`**。
最安全的方式是使用另附的最小修复包，只替换
`.github/workflows/plotlish-production.yml` 并新增
`beta-app/tools/verify_live_production.py` 与 `beta-app/tests/test_live_production.py`。
GitHub `main` 提交这些文件后会触发一次新自动部署（当前启用开关为 true）。

## 本地测试
`cd beta-app && python -m unittest discover -s tests -p 'test_*.py' -v`
Cloudflare 真正的 API 和公开网站访问需要在有凭据的 GitHub Actions 上继续验证。
