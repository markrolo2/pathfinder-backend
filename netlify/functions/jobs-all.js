const fetch = require("node-fetch");
const xml2js = require("xml2js");

// ------------------------------
// SIMPLE KEYWORD CLASSIFIER
// ------------------------------

const SECTOR_KEYWORDS = {
  technology: ["software", "developer", "engineer", "data", "cloud", "cyber", "AI", "IT"],
  media: ["journalism", "editor", "broadcast", "content", "film", "tv", "radio", "digital"],
  business: ["manager", "strategy", "consultant", "finance", "operations", "commercial"],
  education: ["teacher", "school", "lecturer", "tutor", "curriculum", "education"],
  health: ["nurse", "doctor", "clinical", "healthcare", "mental health", "NHS"],
  arts: ["design", "creative", "illustrator", "music", "theatre", "graphic"],
  sport: ["coach", "fitness", "athlete", "sport"],
  environment: ["sustainability", "climate", "ecology", "renewable", "environment"]
};

function classifySectorsKeyword(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const scores = {};

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    scores[sector] = keywords.reduce(
      (count, kw) => count + (text.includes(kw.toLowerCase()) ? 1 : 0),
      0
    );
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([sector]) => sector);
}

// ------------------------------
// HELPERS
// ------------------------------

async function safeFetch(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message);
    return [];
  }
}

async function fetchHTML(url) {
  try {
    const res = await fetch(url);
    return await res.text();
  } catch (err) {
    console.error("❌ fetchHTML failed:", err.message);
    return "";
  }
}

// ------------------------------
// GUARDIAN JOBS (RSS)
// ------------------------------

async function fetchGuardianJobs() {
  const url = "https://jobs.theguardian.com/jobsrss/";
  const xml = await fetchHTML(url);

  if (!xml || xml.trim() === "") {
    console.error("❌ Guardian RSS returned empty XML");
    return [];
  }

  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
  const items = parsed?.rss?.channel?.item || [];

  return items.map((item, i) => ({
    id: `guardian-${i}`,
    title: item.title,
    company: "The Guardian",
    location: "UK",
    salary: null,
    applyUrl: item.link,
    category: "job",
    description: item.description || "",
    sectorPair: classifySectorsKeyword(item.title, item.description)
  }));
}

// ------------------------------
// EXAMPLE JOB
// ------------------------------

async function fetchExampleJobs() {
  return [
    {
      id: "example-001",
      title: "Example Job",
      company: "Example Co",
      location: "Remote",
      salary: null,
      applyUrl: "https://example.com",
      category: "job",
      description: "This is a placeholder job.",
      sectorPair: classifySectorsKeyword("Example Job", "This is a placeholder job.")
    }
  ];
}

// ------------------------------
// MAIN HANDLER
// ------------------------------

exports.handler = async () => {
  const guardian = await safeFetch(fetchGuardianJobs, "Guardian Jobs");
  const example = await safeFetch(fetchExampleJobs, "Example Jobs");

  const allJobs = [...guardian, ...example];

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(allJobs)
  };
};