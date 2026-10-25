# Plotlish｜正式站源码候选包 v1.0.0-rc.3（无课程）

面向 `plotlish.pages.dev` 的可维护源码与独立自动部署工程。**尚未正式上线，不是稳定 v1.0.0。**

## 本包包含
- `beta-app/core/`：Plotlish 网站程序、UI、Logo/Favicon。
- `beta-app/tools/`：课程导入、构建、发布校验、完整性校验。
- `beta-app/tests/`：单元测试、浏览器冒烟测试、249 句长章节合成压力测试。
- `.github/workflows/plotlish-beta.yml`：测试站原有自动部署工作流，**未更改**。
- `.github/workflows/plotlish-production.yml`：正式站独立凭据、独立项目/分支校验及自动部署。
- `course-packages/README.md`：仅课程导入说明；**没有课程正文、小说封面或剧情插图**。

## 本次关键修复
- 修复 `prefers-reduced-motion` 场景下长章节快速变更字号，极短过渡造成分页测量尺寸滞后的问题。
- 新增长章节合成自动回归，确保配置、当前计算字号、分页、阅读位置同步。
- 新增“**候选版本禁止正式部署**”门禁：即使你已把 GitHub `PLOTLISH_PROD_AUTO_ENABLED` 设置为 `true`，当前 `v1.0.0-rc.3` 也不会进入正式发布阶段。

## 本地测试
```bash
cd beta-app
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/browser_smoke.py
python tests/browser_long_pagination.py
python tools/build.py --packages-dir ../course-packages
python tools/verify_beta_site.py
```

`python tools/verify_production_site.py` 对本包的空课程构建预期**拒绝发布**。

## 正式上线前的必备步骤

1. 在 Cloudflare 确认正式项目 `plotlish`、生产分支 `main`、Git 自动构建是否与 GitHub Actions 冲突。
2. GitHub 设置独立 Production Token 和 Account ID；推荐放在 `plotlish-production` Environment 中，限制允许 `main` 部署。
3. 合并已经完成审核的正式课程并验收所有真实站点功能；确保课程目录不为空。
4. 先在测试/预览环境完成完整回归与学习数据迁移演练，保留正式站回滚点。
5. 完成发布批准后，将 `RELEASE_VERSION` 由 `v1.0.0-rc.3` 明确改为稳定版 `v1.0.0`，提交 `main` 后才允许自动尝试正式部署。

详细证据与遗留问题：`beta-app/docs/R3.1.0_RC3_正式站源码交付与验收.md`。
