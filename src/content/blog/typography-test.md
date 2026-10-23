---
title: 排版测试（可删除）
date: 2026-10-24
tags:
  - 测试
draft: false
description: 用于检查中文排版、数学公式、代码高亮和表格的测试页，确认显示正常后可以删除。
---

> **测试页。** 这篇只用来检查字体、行距、公式、代码和表格，不是正式文章，整篇都可以删除。

## 中英混排

中文阅读需要宽松一点的行距，以及大约四十个字左右的行长。The quick brown fox jumps over the lazy dog. 这一句把 Chinese clauses、English words 和数字 2026 放在同一段里，用来看标点和西文是否挤在一起。

## 行内与独立公式

质能方程 $E = mc^2$ 是行内公式。等差数列求和 $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$ 也应该嵌在句子中间，而不是独占一行。

$$
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

## 代码

```python
def greet(name: str) -> str:
    return f"你好，{name}"

print(greet("世界"))
```

## 表格

| 项目 | 期望 |
| --- | --- |
| 字体 | 系统中文字体，不从外部加载 |
| 公式 | 本地 KaTeX 样式 |
| 代码 | 随浅色与深色主题切换 |

### 小节标题

#### 更小的标题

上面两级标题用来确认层级和间距。
