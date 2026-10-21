# Plotlish Beta · 共用 GitHub 仓库正式接入说明

现有仓库：`https://github.com/plotlish-a11y/plotlish`。

目标：只在 `beta` 分支维护 R2.3.1 新版课程网站，让上传章节 ZIP 后自动更新已经存在且大陆可访问的 `https://plotlish-test.pages.dev/`。

**不能把这个总 ZIP 直接上传 GitHub 后期待自动安装；请先解压。**

## 一次性接入（按顺序）

1. **确认 GitHub 分支是 beta**：打开 `https://github.com/plotlish-a11y/plotlish/tree/beta`。
2. 在仓库根目录选择 **Add file → Upload files**。将解压出来的 **整个 `beta-app` 文件夹**拖入网页（GitHub 官方支持拖入文件夹），确保提交后路径是 `beta-app/core/index.html`、`beta-app/packages/last-platform-01.zip` 等，而不是根目录多套了一个大文件夹。将变更 **直接提交到 beta**。
3. 到仓库 **Settings → Secrets and variables → Actions → New repository secret** 配置：
   - `CLOUDFLARE_API_TOKEN_BETA`：拥有 Pages 编辑权限的 Cloudflare API Token。
   - `CLOUDFLARE_ACCOUNT_ID_BETA`：拥有当前 `plotlish-test` Pages 项目的账户 ID。
   - 不发送 Token 给聊天、不要把密钥写到仓库源码里。如果你没有仓库 Settings 权限，让管理员配置。
4. 在**beta 分支**选择 **Add file → Create new file**，路径输入 `.github/workflows/plotlish-beta.yml`，文件内容复制本包中的 `工作流_复制用_plotlish-beta.yml`，提交到 **beta**。如你熟悉上传文件夹，也可以直接把解压包中的 `.github/workflows/plotlish-beta.yml` 按路径上传，但要注意不要覆盖旧的 `deploy.yml`。
5. 打开 GitHub **Actions**，等待 `Plotlish Beta - 自动部署到测试站` 全部通过，再在浏览器验证 `https://plotlish-test.pages.dev/`。自动构建 + Cloudflare 校验 + Wrangler 部署都成功才算完成。

GitHub 新工作流只监听 **beta** 分支，部署参数固定 `plotlish-test`，生产分支从 Cloudflare 项目 API 获取，不会把 GitHub 的 beta 错当成 Pages 的生产分支。旧 `main`、其 `deploy.yml`、旧站 `plotlish.pages.dev` 都不变。

注意：原来的旧 `deploy.yml` 在 beta 上复制自 main，虽然 push 只监听 main，但它含手动触发选项；不要在 Beta 上手动运行旧 `Deploy to Cloudflare Pages` 工作流，避免误更新旧站。我们新建的专用工作流没有手动触发按钮。

## 之后添加课程（每次只有一个 GitHub 上传操作）

1. 做好单章 ZIP，例如 `course-evil-supporting-role-ch02.zip`。
2. 打开 `https://github.com/plotlish-a11y/plotlish/tree/beta/beta-app/packages`，确认分支仍为 **beta**。
3. **Add file → Upload files**，拖入 ZIP，**Commit changes** 到 beta。
4. GitHub 自动测试、生成网站并发布到同一个 `plotlish-test.pages.dev`；旧小说和旧站不受影响。请在 Actions 看到成功后才认为发布完成。

## 更新、回滚与安全

- 更新已有章节：尽量保持 ZIP **文件名和 chapter_id 都不变**，直接替换 `beta-app/packages/` 中对应文件；CI 校验冲突和原有章节保留。
- 错误部署：通过 GitHub beta 分支历史回退此前成功提交，再由新 commit 触发部署；也可以在 Cloudflare Pages 部署记录中恢复此前正常的部署（按控制台实际可用操作）。
- 仓库是 **公开仓库**。已上传的文件即使删除也可能保留在提交历史中；不要上传未公开的原创小说草稿。测试站 Pages 也不带访问密码。
- 自动发布意味着新的提交通过结构检测就会更新测试站，不含人工审批。翻译语义、版权、小说内容准确性需在提交前人工审核。
- 第一次线上执行、Cloudflare 授权与实际更新还**未验收**。目前仅对源码做了本地构建和测试。
- 这不是网站内的管理后台，而是 GitHub 网页操作的课程上传。Beta 接通后，再决定是否需要可视化网页后台。

## 你遇到错误时

- `缺少 ..._BETA`：检查 Secrets 拼写和操作权限。
- `Cloudflare 正式分支缺失`：可能直接上传项目的 API 字段特殊，发我无密钥的 Actions 错误截图，不要自行更改目标域名。
- `重复章节 ID`：同一章上传了两个 ZIP 或改章时忘记替换旧文件。
- `不安全的 ZIP 路径`：压缩包层级错误或包含不允许的文件。
- GitHub 主页仍显示旧版：请确认访问的是 beta 目标 `https://plotlish-test.pages.dev/` 而不是旧站 `plotlish.pages.dev`，并检查 Actions 及 Cloudflare 部署记录。
