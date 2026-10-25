# Production 工作流修正记录

这次更正了此前与用户要求冲突的发布门禁：

1. 用户希望 Production 与 Beta 一样推送自动部署，RC 标签不应自动导致错误。修改 `check_production_release_policy.py`，仅校验版本字段格式，不判断发布阶段。
2. 用户要求纯源码先上线、课程之后导入。Production 工作流现在对空目录使用 `--allow-empty`。一旦存在已发布课程，仍逐章校验英文句子、译文、ID、资源引用。
3. 保留正式项目名、生产分支、独立凭据以及 Git 集成重复发布防护。
4. Beta 工作流、网页核心 JS/CSS、课程导入数据结构未改动。

## 对现有网站的影响

- 用户当前 `PLOTLISH_PROD_AUTO_ENABLED=true`，只要将代码提交到 `main` 且其它部署设置正确，Action 将立即尝试发布。
- 此包没有课程。发布成功后，正式站的新 `courses/catalog.json` 为零课程。若原站有内容，旧课程不会出现在新的目录中。
- 部署前应检查正式项目的 Cloudflare production branch 是否为 `main`。在 Git 集成项目中，还应避免 Cloudflare 原生构建与 GitHub Actions 重复发布。

## 验证命令

`python -m unittest discover -s tests -p 'test_*.py' -v`

`python tools/build.py --packages-dir ../course-packages`

`python tools/verify_production_site.py --allow-empty`

`python tools/check_production_release_policy.py`
