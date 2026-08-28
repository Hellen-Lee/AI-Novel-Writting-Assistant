【输出 JSON 字段约定】
- worldview: 字符串，世界背景/时代/力量体系/地理等。
- story_core: 对象，含 theme/conflict/plotline 三个字符串字段。
- characters: 数组，元素为 {name, role, profile, relationship}，relationship 为 {type, target} 数组（type 可用中文，如 师徒/宿敌/恋人）。
- synopsis: 字符串，全书概要。
- volumes: 数组，元素为 {name, summary}。
仅输出以上 JSON 对象本身。
