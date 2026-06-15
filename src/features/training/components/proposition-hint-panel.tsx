import { useState } from "react";
import type { TrainingTopic } from "@/features/training/types";

interface HintSection {
  icon: string;
  iconColor: string;
  title: string;
  content: React.ReactNode;
}

function buildHintSections(topic: TrainingTopic): HintSection[] {
  return [
    {
      icon: "📋",
      iconColor: "var(--accent-purple)",
      title: "回答框架",
      content: (
        <>
          <p>
            针对「{topic.mainQuestion}」，建议采用以下结构展开回答：
          </p>
          <ol>
            <li>
              <strong>明确选边</strong> — 在「{topic.title}」这一对立结构中，必须选择一方作为核心立场，避免两边各说一半
            </li>
            <li>
              <strong>定义&quot;值得&quot;的标准</strong> — 用具体维度衡量：可迁移能力、经济独立、试错空间、长期复利效应
            </li>
            <li>
              <strong>用场景论证</strong> — 用 2-3 个具体场景支撑立场，而非抽象论述
            </li>
            <li>
              <strong>回应对方优势</strong> — 承认反方立场的合理性，再说明为何你的选择仍然更优
            </li>
          </ol>
        </>
      ),
    },
    {
      icon: "🎯",
      iconColor: "var(--accent-yellow)",
      title: "关键要点",
      content: (
        <ul>
          <li>必须选边 — 此题最常见的问题是两边各说一半，导致论证无力</li>
          <li>衡量标准要具体 — 用&quot;3 年后的能力厚度 vs 当下的生存安全感&quot;来量化&quot;值得&quot;</li>
          <li>场景要有代入感 — 比如用&quot;25 岁选择初创公司 vs 考入体制&quot;代替泛泛而谈</li>
          <li>承认对方优势 — 选成长需承认底线保障，选稳定需承认复利效应</li>
        </ul>
      ),
    },
    {
      icon: "🔭",
      iconColor: "var(--sage)",
      title: "思考角度",
      content: (
        <div className="hint-perspective-tags">
          {["试错窗口期", "可迁移能力", "经济底线与安全感", "职业早期 vs 中期差异", "家庭经济背景"].map(
            (tag) => (
              <span key={tag} className="hint-perspective-tag">
                {tag}
              </span>
            ),
          )}
        </div>
      ),
    },
  ];
}

export function PropositionHintPanel({
  topic,
  defaultCollapsed = false,
  title = "命题提示",
  subtitle = "帮助你理清回答思路与方向",
}: {
  topic: TrainingTopic;
  defaultCollapsed?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const sections = buildHintSections(topic);

  return (
    <div className={`hint-panel${collapsed ? " is-collapsed" : ""}`}>
      <button
        className="hint-header"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "展开提示" : "收起提示"}
        type="button"
      >
        <span className="hint-header-icon">💡</span>
        <span className="hint-header-text">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </span>
        <span className="hint-toggle" aria-hidden="true">
          ▲
        </span>
      </button>
      <div className="hint-body">
        {sections.map((section) => (
          <div key={section.title} className="hint-section">
            <div className="hint-section-header">
              <span
                className="hint-section-icon"
                style={{ background: section.iconColor }}
              >
                {section.icon}
              </span>
              <strong>{section.title}</strong>
            </div>
            <div className="hint-section-content">{section.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
