# Plotlish Beta R2.5 · 完整学生端（课程文件夹版）

本目录是**独立的完整学生网站工程**。保留 R2.3.1 学生界面、阅读器、翻译、朗读、生词本、阅读记录，以及现有 Cloudflare Pages 测试站的专用部署工作流。**不包含旧版创作者工作台，不预装任何书籍。**

## 本地目录

```text
beta-app/
  core/                     学生网站程序（不直接编辑课程到这里）
  packages/                 课程源仓库；带第 1 章 draft 测试稿，默认不公开
    <book-id>/
      book.json             书名/简介/难度/发布状态
      course-guide.json     课程导读与学习说明（可选）
      characters.json       人物档案（可选）
      characters/           人物 WebP 立绘（可选）
      cover.webp            整本书封面（可选）
      chapters/
        ch001/
          course.json       该章正文、逐句翻译、知识点、场景、units 单元锚点
          glossary.json     该章的悬浮词典（可选）
          images/           仅该章的 WebP 剧情插图（可选）
        ch002/
          course.json
  templates/novel-template/  供复制使用的草稿模板（不参与构建）
  tools/build.py            验证、扫描、构建公开站点
  tools/import_chapter.py   导入现有的单章节 ZIP（默认导入为草稿）
  tools/verify_beta_site.py 检查生成的网站是否完整
  tests/test_build.py       自动测试
  dist/                     自动生成，禁止手动编辑或上传源稿
```

## 第一次建立自己的小说

1. 复制 `templates/novel-template/` 到 `packages/`，将新文件夹改为全小写的英文作品 ID，例如 `my-first-book`。
2. 修改其 `book.json` 的 `book_id` 为 `my-first-book`，填写作品标题、简介等。
3. 修改 `chapters/ch001/course.json` 中的 `chapter_id` 为 `my-first-book-ch001`，并为每句设置**稳定且唯一**的 `ids`（如 `my-first-book-ch001-s001`）。
4. 把 `sentences`、`ids`、`translations` 按相同数量逐句填写，并按需加入语法、词汇与插图。
5. 编辑阶段保持 **`status: "draft"`**。当审核完成时，把 `book.json` 及要发布的章节都改为 **`status: "published"`**。
6. 使用 GitHub Desktop 提交并 Push `beta`，GitHub Actions 自动构建、检查并更新 `plotlish-test.pages.dev`。

只有**作品和章节均为 published** 时，课程才会出现。草稿不会进入公开站点，但会保存在你的 GitHub 私有仓库中。

## 本地测试（Windows，要求 Python 3.10+）

在 `beta-app` 文件夹打开 PowerShell 或命令行，依次运行：

```powershell
python -m unittest discover -s tests -p test_build.py -v
python tools/build.py
python tools/verify_beta_site.py
python -m http.server 8000 --directory dist
```

在浏览器打开 `http://localhost:8000/`。按 Ctrl+C 停止本地服务器。

## 已有单章 ZIP 怎么办？

先建立对应作品文件夹和 `book.json`，然后运行：

```powershell
python tools/import_chapter.py --book my-first-book --zip "C:\Courses\chapter-01.zip"
```

导入后章节默认为 `draft`，不会自动出现在学生网站。要覆盖已存在章节必须明确使用 `--replace`；要导入后直接发布必须显式增加 `--publish`。导入程序不依赖旧版发布器。

**不要把 ZIP 直接放进 `packages/` 根目录**：R2.5 的标准是可编辑的作品/章节文件夹。更多详情请看 `docs/R2.4_课程存储与发布标准.md` 和 `docs/R2.5_课程导读人物与单元标准.md`。

## 重要限制

- 每个章节最大 999，目录必须为 `ch001`、`ch002` 等三位数字。作品 ID 使用小写英文字母、数字和 `-`。
- 同一小说封面保存在作品根目录；场景图片位于独立章节目录，必须是 WebP。
- 修改已发布句子的文字时尽量**不要更换句子 ID、章节 ID**，否则用户的本地学习记录可能无法正确关联。
- GitHub Actions 每次都会重新构建整个站点，但你只需编辑被修改的章节。
- 生成站点仅包含已发布课程，**不代表已经从 Git 历史中删除旧内容**。不要把敏感、未授权的小说原稿提交到共享仓库。
- 保持 `.github/workflows/plotlish-beta.yml` 及 GitHub Secrets 不变；只部署到 `plotlish-test`，不会触发旧正式站的工作流。

## R2.5 新增：第一章真实草稿与预览

本包额外包含 `packages/the-runaway-bride/`，有来自此前已制作的第一章英文精读数据：
249 句中英对应、160 个原文段落、10 条知识点、4 张已压缩的 WebP 场景图、3 个单元，以及导读和人物说明。
**该书和第一章都是 `draft`**，执行构建后公开站点仍会显示空书架，这是有意的发布保护。

如果希望看到新界面的实际效果，请先使用单独交付的「R2.5 第一章预览站点 ZIP」。预览版独立于 beta 分支，不会自动部署。
正式准备在 `plotlish-test.pages.dev` 上验收时，再**自行**把 `book.json` 和 `chapters/ch001/course.json` 的 `status` 改为 `published` 并提交到 beta 分支。
本版没有生成整本 24 章的英文精读课程，课程第一章的英文文学质量、人物称谓、剧情图一致性仍有必要继续编辑审核。

旧版课程没有 `course-guide.json`、`characters.json` 或 `units` 时仍能加载。旧课程的数据不需要重新导出或更换句子 ID。新增单元的 `start_id` 必须使用原有稳定句子 ID。

**升级现有 beta 仓库时，请先备份并合并已有 `beta-app/packages/`。不要直接删除你过去自行制作的书籍和章节。**
