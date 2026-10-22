# Plotlish R2.8 — 阅读交互优化 · 完整源码

基线：R2.7.1 完整源码；本包为**完整仓库根目录**（不是覆盖补丁）。

## 本次修改
- 顶部一键选择发音人、语速并试听；默认优先浏览器提供的 Brian，其他情况自动回退。
- 顶部快速设置中文显示：隐藏、当前句、逐句中英对照。
- 设置分类重组为阅读外观、朗读行为、翻译与查词，移除会覆盖单独偏好的模式预设。
- 删除站内本地词典、站内词典详情和无释义卡片，仅保留剑桥/必应**在线网页查询跳转**（不能把官网词义嵌入悬浮框）。
- 词典选择与悬浮开关保存在原有阅读偏好中；手机查词按钮在阅读器顶栏。
- 原本的章节精讲、逐句翻译、生词本、书架、图片及阅读进度保留。

## 上传
把 `.github/`、`beta-app/`、`course-packages/` 合并到仓库的 `beta` 分支根目录（含点开头的文件夹）。删除旧版本残留 `beta-app/packages/the-runaway-bride/`，避免课程资源重复。

构建验证命令：
```bash
cd beta-app
python -m unittest discover -s tests -p test_build.py
python tools/build.py --packages-dir ../course-packages
python tools/verify_beta_site.py
```

## 朗读说明
Brian 不是网站自带语音。只有 Windows/Edge 等浏览器向网页提供对应的 Web Speech 语音时，才可使用；否则自动回退英语声音，不会调用付费 Azure Speech。

## 查词说明
只支持打开剑桥、必应的公开词典网页；网站不会爬取第三方词典、内嵌第三方释义或使用收费 API。移动端须开启「查词」模式后点击单词；关闭后点击句子恢复朗读/选句。
