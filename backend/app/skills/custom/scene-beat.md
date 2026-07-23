---
name: scene-beat
description: 根据当前章节与用户补充，列出 3-5 个场景节拍。手动调用：/scene-beat
kind: skill
disable-model-invocation: true
---
请根据以下信息，列出 3-5 个场景节拍（每条一行，简洁，不要写完整正文）。

全局规则：
$global_rules

世界观：
$worldview

人物：
$characters

当前章节内容：
$current_content

用户补充：
$user_input
