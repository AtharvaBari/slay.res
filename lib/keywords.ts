/* Deterministic keyword / skill extraction shared by the parser and the
 * alignment engine. No external calls — a curated lexicon plus phrase and
 * capitalized-token heuristics so common skills are caught even when a JD
 * phrases them loosely. */

// Curated multi-word and single-word skills. Multi-word entries are matched
// first so "machine learning" isn't split into "machine" + "learning".
export const SKILL_LEXICON: string[] = [
  // languages
  "javascript", "typescript", "python", "java", "c++", "c#", "go", "golang", "rust",
  "ruby", "php", "swift", "kotlin", "scala", "sql", "html", "css", "bash", "r",
  // frontend
  "react", "react native", "next.js", "nextjs", "vue", "angular", "svelte", "redux",
  "tailwind", "tailwind css", "figma", "webpack", "vite", "sass", "graphql", "storybook",
  // backend / infra
  "node", "node.js", "express", "django", "flask", "fastapi", "spring", "spring boot",
  ".net", "rails", "laravel", "grpc", "rest", "rest api", "microservices", "kafka",
  "rabbitmq", "redis", "elasticsearch", "nginx",
  // data / cloud / devops
  "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "terraform", "ansible",
  "jenkins", "github actions", "ci/cd", "cicd", "linux", "serverless", "lambda",
  "postgresql", "postgres", "mysql", "mongodb", "dynamodb", "snowflake", "spark",
  "hadoop", "airflow", "dbt", "tableau", "power bi", "looker",
  // data science / ml
  "machine learning", "deep learning", "nlp", "natural language processing",
  "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy", "data analysis",
  "data engineering", "etl", "computer vision", "llm", "generative ai",
  // practices / pm
  "agile", "scrum", "kanban", "jira", "confluence", "git", "unit testing",
  "test driven development", "tdd", "system design", "distributed systems",
  "product management", "stakeholder management", "a/b testing", "seo",
  "project management", "leadership", "mentoring", "code review", "roadmap",
];

// Strong action verbs — used to detect JD-preferred verbs for the "rephrased
// alignment" signal.
export const ACTION_VERBS: string[] = [
  "led", "built", "designed", "developed", "architected", "launched", "shipped",
  "owned", "drove", "delivered", "implemented", "optimized", "scaled", "migrated",
  "automated", "reduced", "increased", "improved", "created", "managed", "mentored",
  "collaborated", "spearheaded", "streamlined", "engineered", "deployed", "integrated",
  "analyzed", "researched", "orchestrated", "championed", "accelerated",
];

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "have", "this", "that",
  "your", "who", "all", "can", "not", "but", "from", "they", "their", "them", "has",
  "was", "were", "job", "role", "team", "work", "working", "years", "year", "experience",
  "ability", "strong", "excellent", "good", "great", "plus", "must", "should", "would",
  "about", "into", "over", "such", "using", "used", "use", "help", "including",
]);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Escape a string for safe use inside a RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract a de-duplicated, ranked list of skills/keywords from arbitrary text.
 * Combines lexicon matches (highest confidence) with capitalized proper-noun
 * tokens and salient bigrams so novel tools are still surfaced.
 */
export function extractKeywords(text: string, limit = 40): string[] {
  const lower = norm(text);
  const found = new Map<string, number>(); // display -> weight

  const add = (display: string, weight: number) => {
    const key = norm(display);
    if (!key || key.length < 2) return;
    found.set(key, Math.max(found.get(key) ?? 0, weight));
  };

  // 1. Lexicon (multi-word first).
  const ordered = [...SKILL_LEXICON].sort((a, b) => b.length - a.length);
  for (const skill of ordered) {
    const re = new RegExp(`(?:^|[^a-z0-9+.#-])${escapeRegExp(skill)}(?:$|[^a-z0-9+.#-])`, "i");
    if (re.test(lower)) add(skill, 100 + skill.length);
  }

  // 2. Capitalized proper nouns from the ORIGINAL casing (tools, frameworks).
  const capTokens = text.match(/\b[A-Z][a-zA-Z0-9.+#/-]{2,}\b/g) ?? [];
  for (const t of capTokens) {
    const low = norm(t);
    if (STOPWORDS.has(low) || /^\d+$/.test(low)) continue;
    add(t, 40);
  }

  return [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

/** Prettify a lowercase skill token for display. */
export function prettySkill(s: string): string {
  const specials: Record<string, string> = {
    "javascript": "JavaScript", "typescript": "TypeScript", "nextjs": "Next.js",
    "next.js": "Next.js", "node.js": "Node.js", "node": "Node.js", "css": "CSS",
    "html": "HTML", "sql": "SQL", "aws": "AWS", "gcp": "GCP", "ci/cd": "CI/CD",
    "cicd": "CI/CD", "nlp": "NLP", "llm": "LLM", "api": "API", "rest api": "REST API",
    "tdd": "TDD", "etl": "ETL", "a/b testing": "A/B Testing", "graphql": "GraphQL",
    "postgresql": "PostgreSQL", "mongodb": "MongoDB", "tailwind css": "Tailwind CSS",
    "react native": "React Native", "power bi": "Power BI", ".net": ".NET",
    "spring boot": "Spring Boot", "generative ai": "Generative AI",
  };
  const key = norm(s);
  if (specials[key]) return specials[key];
  // Keep known ALL-CAPS acronyms; otherwise title-case words.
  return s
    .split(" ")
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Does the text contain the keyword as a whole token/phrase? */
export function textHasKeyword(text: string, keyword: string): boolean {
  const re = new RegExp(`(?:^|[^a-z0-9+.#-])${escapeRegExp(norm(keyword))}(?:$|[^a-z0-9+.#-])`, "i");
  return re.test(norm(text));
}
