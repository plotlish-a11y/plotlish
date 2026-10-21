# 每章一个 ZIP：课程格式与检查

每份 ZIP **直接包含**以下文件，不能在 ZIP 内多包一层父文件夹：

```text
book-ch02.zip
  course.json             必需：完整课程数据
  glossary.json           可选：课程专属字词释义
  cover.webp              可选：新作品首章建议提供
  images/
    example-scene-01.webp  按 course.json 的 scenes[].scene_id 命名
```

`course.json` 最少有以下七个字段：

```json
{
  "book": "Demo Story",
  "book_id": "demo-story",
  "chapter": "Chapter 02",
  "chapter_id": "demo-story-ch02",
  "sentences": ["An English sentence."],
  "ids": ["demo-02-001"],
  "translations": ["一条中文翻译。"],
  "annotations": [],
  "scenes": [],
  "paragraphBreaks": [0]
}
```

- 相同作品章节的 `book_id` 必须保持一致，每一章要有新的 `chapter_id`。
- `sentences` / `ids` / `translations` 必须一一对应、不能为空。
- 知识点 `annotations[].sentenceIndex` 从 0 开始，每条 `phrase` 必须存在对应原句。
- 插图 `scenes[].start_index` 从 0 开始；每个场景要在 ZIP 中提供 `images/<scene_id>.webp`。
- 图片目前只接受 `.webp`。如果缺图、图片命名不符、章节重复、ZIP 路径不安全，会拒绝构建。
- 单本章内句子 ID 需要稳定，已有章节不要仅为了改动外观随便重置 ID，否则会影响阅读历史及标注定位。
- 目前不支持课程 ZIP 内携带音频/视频，朗读沿用浏览器语音。

**不要直接编辑网站 `core/index.html` 或 `dist/courses/catalog.json` 来添加小说。** 新课只上传 ZIP，网站在构建时自动维护目录。
