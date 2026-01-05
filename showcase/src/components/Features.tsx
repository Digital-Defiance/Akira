import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { FaGithub } from "react-icons/fa";
import "./Features.css";

interface Feature {
  title: string;
  description: string;
  icon: string;
  tech: string[];
  github?: string;
  npm?: string;
  stats?: {
    tests?: string;
    coverage?: string;
  };
  highlights: string[];
  category:
    | "Workflow"
    | "Requirements"
    | "Testing"
    | "Integration"
    | "Management";
}

const features: Feature[] = [
  {
    title: "Structured Workflow",
    icon: "📋",
    description:
      "Guided spec-driven development through four distinct phases: Requirements → Design → Tasks → Execution. Each phase requires explicit approval before proceeding to ensure quality and correctness at every step.",
    tech: [
      "EARS Patterns",
      "INCOSE Rules",
      "Phase Approvals",
      "Progress Tracking",
    ],
    category: "Workflow",
    highlights: [
      "Requirements Phase: EARS-compliant user stories with acceptance criteria",
      "Design Phase: Technical designs with correctness properties",
      "Tasks Phase: Actionable implementation plans with 2-level hierarchy",
      "Execution Phase: Task execution with full context loading",
      "Visual progress tracking with sidebar tree view and status indicators",
    ],
  },
  {
    title: "Adaptive Reflection Loop",
    icon: "🔄",
    description:
      "Automatically retry failed tasks with failure-aware re-planning. The system iteratively executes, evaluates, and adjusts strategies up to 3 times, learning from each failure to find the right approach.",
    tech: [
      "Iterative Re-planning",
      "Failure Context",
      "Pattern Detection",
      "User Escalation",
    ],
    category: "Workflow",
    highlights: [
      "Up to 3 adaptive retry iterations with failure context",
      "LLM receives detailed failure information to avoid repeating mistakes",
      "Distinguishes transient errors (retry) from strategic failures (reflection)",
      "Detects persistent failure patterns and escalates to user",
      "Full observability: all iterations logged to reflection.md",
    ],
  },
  {
    title: "EARS Requirements",
    icon: "✅",
    description:
      "All requirements follow the Easy Approach to Requirements Syntax (EARS) with six supported patterns: ubiquitous, event-driven, state-driven, unwanted-event, optional, and complex.",
    tech: [
      "EARS Patterns",
      "User Stories",
      "Acceptance Criteria",
      "Validation",
    ],
    category: "Requirements",
    highlights: [
      "Ubiquitous: 'The system shall...'",
      "Event-driven: 'WHEN [trigger] THEN the system SHALL [response]'",
      "State-driven: 'WHILE [state] the system SHALL [behavior]'",
      "Unwanted-event: 'IF [unwanted condition] THEN the system SHALL...'",
      "Automatic validation against INCOSE semantic quality rules",
    ],
  },
  {
    title: "Property-Based Testing",
    icon: "🧪",
    description:
      "Generate correctness properties from acceptance criteria that can be implemented with PBT libraries. Properties include universal quantification, requirement references, and minimum 100 iterations.",
    tech: ["fast-check", "Hypothesis", "jqwik", "QuickCheck"],
    category: "Testing",
    highlights: [
      "Universal quantification: 'For any X, Y should Z'",
      "Reference to validated requirements",
      "Support for multiple PBT libraries across languages",
      "Automatic round-trip property detection",
      "Minimum 100 test iterations with automatic shrinking",
    ],
  },
  {
    title: "Model Context Protocol",
    icon: "🔌",
    description:
      "Persistent context management through MCP integration. Spec documents remain accessible across chat sessions with structured tools for programmatic access to all spec operations.",
    tech: ["MCP", "Persistent Context", "State Management", "File Operations"],
    category: "Integration",
    highlights: [
      "Spec documents accessible across all Copilot sessions",
      "Programmatic tools for create, update, read operations",
      "Workflow state tracking with .state.json files",
      "Task progress monitoring and completion percentage",
      "Full context loading for execution phase",
    ],
  },
  {
    title: "Glossary Management",
    icon: "📚",
    description:
      "Automatic extraction and definition of technical terms from requirements. Ensures consistent terminology across specs and helps maintain clear, unambiguous documentation.",
    tech: ["Term Extraction", "Definition Management", "Consistency Checks"],
    category: "Requirements",
    highlights: [
      "Automatic detection of domain-specific terms",
      "Centralized glossary per spec",
      "Reference linking from requirements to definitions",
      "Terminology consistency validation",
      "Export capabilities for team sharing",
    ],
  },
  {
    title: "INCOSE Validation",
    icon: "✔️",
    description:
      "Automatic validation of all requirements against INCOSE semantic quality rules. Ensures requirements are clear, complete, consistent, correct, and testable before proceeding to design phase.",
    tech: ["INCOSE Standards", "Quality Rules", "Semantic Analysis"],
    category: "Requirements",
    highlights: [
      "Checks for ambiguous or weak language",
      "Validates completeness and consistency",
      "Ensures requirements are testable",
      "Identifies circular dependencies",
      "Provides actionable feedback for improvements",
    ],
  },
  {
    title: "CodeLens Integration",
    icon: "🔍",
    description:
      "Execute tasks directly from task documents using CodeLens. Click to run individual tasks or entire workflows with full context from requirements and design phases.",
    tech: ["VS Code CodeLens", "Task Execution", "Context Loading"],
    category: "Integration",
    highlights: [
      "Execute individual tasks from document",
      "Run entire workflows with one click",
      "Real-time task status updates",
      "Preserve document formatting during updates",
      "Skip optional tasks unless explicitly requested",
    ],
  },
  {
    title: "@spec Chat Participant",
    icon: "💬",
    description:
      "Dedicated Copilot Chat participant for all spec operations. Create, list, update, execute, and approve specs through natural language commands in the chat interface.",
    tech: ["GitHub Copilot", "Chat Participant", "Natural Language"],
    category: "Integration",
    highlights: [
      "'@spec create <name>' - Create new specs",
      "'@spec list' - View all specs with status",
      "'@spec execute <task>' - Run specific tasks",
      "'@spec approve <phase> <name>' - Approve workflow phases",
      "'@spec status <name>' - Check detailed spec progress",
    ],
  },
  {
    title: "Sidebar Tree View",
    icon: "🌲",
    description:
      "Visual representation of all specs with phase indicators, progress tracking, and quick navigation. See at a glance which specs are in progress, completed, or need attention.",
    tech: ["VS Code Tree View", "Status Indicators", "Progress Tracking"],
    category: "Management",
    highlights: [
      "Hierarchical view of all spec directories",
      "Phase indicators for each spec",
      "Completion percentage for tasks",
      "Quick navigation to requirements, design, tasks",
      "Real-time updates as specs progress",
    ],
  },
];

const Features = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <section className="features section" id="features" ref={ref}>
      <motion.div
        className="features-container"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6 }}
      >
        <h2 className="section-title">
          Key <span className="gradient-text">Features</span>
        </h2>
        <p className="features-subtitle">
          A structured approach to spec-driven development integrated with
          GitHub Copilot Chat
        </p>

        <motion.div
          className="suite-intro"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h3>
            Transform your development workflow with{" "}
            <em>requirements engineering</em>, <em>property-based testing</em>,
            and <em>persistent context</em>
          </h3>
          <p>
            <strong>
              Akira brings enterprise-grade requirements engineering to VS Code.
            </strong>{" "}
            This isn't just another extension—it's a complete workflow system
            that guides you through a structured development process with{" "}
            <strong>EARS-compliant requirements</strong>,{" "}
            <strong>INCOSE validation</strong>, and{" "}
            <strong>Model Context Protocol integration</strong>.
          </p>
          <div className="problem-solution">
            <div className="problem">
              <h4>❌ The Problem: Unstructured Development</h4>
              <ul>
                <li>Requirements are scattered across documents and chat</li>
                <li>Design decisions are lost between sessions</li>
                <li>Tasks lack proper context from requirements</li>
                <li>Testing is ad-hoc without clear correctness properties</li>
                <li>Progress tracking is manual and error-prone</li>
              </ul>
              <p>
                <strong>Result:</strong> You waste time searching for context
                instead of building features.
              </p>
            </div>
            <div className="solution">
              <h4>✅ The Solution: Structured Spec-Driven Workflow</h4>
              <p>
                <strong>Akira</strong> provides a{" "}
                <strong>4-phase structured workflow</strong> that keeps all
                context accessible: Requirements (EARS patterns), Design
                (correctness properties), Tasks (actionable plans), and
                Execution (context-aware implementation).
              </p>
              <p>
                Built for GitHub Copilot Chat with TypeScript and extensively
                tested, Akira uses the <strong>Model Context Protocol</strong>{" "}
                for persistent context, <strong>EARS patterns</strong> for clear
                requirements, and <strong>INCOSE rules</strong> for quality
                validation.
              </p>
            </div>
          </div>
          <div className="value-props">
            <div className="value-prop">
              <strong>📋 Structured Workflow</strong>
              <p>
                Four-phase approach with explicit approvals ensures quality at
                every step
              </p>
            </div>
            <div className="value-prop">
              <strong>🔄 Adaptive Reflection</strong>
              <p>
                Automatically retry failed tasks with failure-aware re-planning
                up to 3 iterations
              </p>
            </div>
            <div className="value-prop">
              <strong>✅ EARS Compliance</strong>
              <p>
                Six EARS patterns with automatic INCOSE validation for clear,
                testable requirements
              </p>
            </div>
            <div className="value-prop">
              <strong>🧪 Property-Based Testing</strong>
              <p>
                Generate correctness properties from acceptance criteria with
                universal quantification
              </p>
            </div>
            <div className="value-prop">
              <strong>🔌 MCP Integration</strong>
              <p>
                Persistent context across sessions with structured tools for
                programmatic access
              </p>
            </div>
          </div>
        </motion.div>

        <div className="features-grid">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="feature-card card"
              initial={{ opacity: 0, y: 50 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: index * 0.1, duration: 0.6 }}
            >
              <div className="feature-header">
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <span
                  className={`feature-badge ${feature.category.toLowerCase()}`}
                >
                  {feature.category}
                </span>
              </div>

              <p className="feature-description">{feature.description}</p>

              <ul className="feature-highlights">
                {feature.highlights.map((highlight, i) => (
                  <li key={i}>{highlight}</li>
                ))}
              </ul>

              <div className="feature-tech">
                {feature.tech.map((tech) => (
                  <span key={tech} className="tech-badge">
                    {tech}
                  </span>
                ))}
              </div>

              {feature.github && (
                <div className="feature-links">
                  <a
                    href={feature.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="feature-link"
                  >
                    <FaGithub />
                    GitHub
                  </a>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
};

export default Features;
