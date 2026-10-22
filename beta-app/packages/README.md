# 空课程目录（正式交付）

这里没有预装作品、章节、人物图片或封面。

以后制作好的每部小说课程应独立作为资源包，手动审核后才放入：

`packages/<book-id>/book.json`
`packages/<book-id>/chapters/ch001/course.json`

可选内容包括 `cover.webp`、`hero.webp`、`course-guide.json`、`characters.json` 及人物/章节插画等。结构和验证规则详见 `../docs/`。

需要公开显示时，必须将作品和对应章节的 `status` 都设为 `published` 并重新运行构建流程。
