# Plotlish R2.6 · 纯净核心与后续课程导入

此包是**纯净版学生网站源码**，完全不预装小说、章节或课程插图。`packages/` 内只有 README，`core/` 是通用页面与阅读器。

## 项目结构

```text
beta-app/
  core/           网页界面、阅读器、生词本、学习统计与设置
  packages/       空课程目录；后续有独立小说课程包时再导入
  docs/           课程格式/发布规范（非实际课程）
  tools/          安全导入、静态构建、发布前验证工具
  tests/          使用临时目录和模拟数据进行构建测试；没有预装测试小说
```

## 本地测试纯净网站

在 `beta-app` 文件夹运行：

```bash
python -m unittest discover -s tests -p test_build.py -v
python tools/build.py --output dist
python tools/verify_beta_site.py
python -m http.server 8000 --directory dist
```

浏览器访问 `http://localhost:8000/`。默认应当显示空书架、0 章、无小说图片。

## 以后导入课程

1. 在 `packages/<book-id>/` 创建作品文件夹，放入合法 `book.json`；章节按 `chapters/ch001/course.json` 存放。
2. 根据 `docs/R2.4_课程存储与发布标准.md` 和 `docs/R2.5_课程导读人物与单元标准.md` 制作课程数据。
3. 后续如果使用独立的小说资源 ZIP，可运行 `tools/import_chapter.py` 安全导入章节（需要先建立目标作品文件夹）。
4. 未审核完保持 `status: draft`；作品与章节都明确发布后，才会出现在公开网站。
5. 如需人物图、封面和宽幅横幅，须通过独立课程资源包放入作品目录，不能直接写死在网站核心代码里。

**重要：** 部署前应与原 GitHub beta 分支增量合并，不能直接覆盖或删除现有用户的课程目录和学习记录。仓库中已有课程需要保留时，应由维护者明确决定是否迁移或单独管理，不能因为拿到纯净源码就直接删除线上资源。

## R2.6 本次调整

- 详情页删除与右侧人物卡内容重复的“出场人物”标签；右侧人物区改为展示当前全部已解锁角色。
- 标签保留“作品介绍”和“学习说明”。
- 删除横幅类别/难度信息的二次显示；修正书架“查看章节目录”误导性标签。
- 无课程空站构建及有课程临时测试均已验证，测试课程位于最终交付包以外。
