const fetch = require("node-fetch");
const xml2js = require("xml2js");

// --------------------------------------
// LOVABLE SECTOR SYSTEM — WEIGHTED CLASSIFIER
// --------------------------------------
const validSectors = [
  "technology",
  "media",
  "business",
  "education",
  "health",
  "arts",
  "sport",
  "environment"
];

// Weighted keyword system
const sectorSignals = {
  technology: {
    strong: ["software engineer", "full stack", "cybersecurity", "machine learning", "data scientist"],
    keywords: ["developer", "engineer", "programmer", "cloud", "ai", "ml", "backend", "frontend", "devops"],
    titles: ["engineer", "developer", "technician"]
  },
  media: {
    strong: ["video editor", "broadcast journalist", "radio producer"],
    keywords: ["journalist", "editor", "producer", "broadcast", "film", "tv", "content creator"],
    titles: ["editor", "producer", "journalist"]
  },
  business: {
    strong: ["management consultant", "business analyst"],
    keywords: ["strategy", "consultant", "commercial", "executive", "director"],
    titles: ["manager", "consultant", "director"]
  },
  education: {
    strong: ["head teacher", "university lecturer"],
    keywords: ["teacher", "lecturer", "tutor", "curriculum", "education"],
    titles: ["teacher", "lecturer", "tutor"]
  },
  health: {
    strong: ["registered nurse", "clinical lead"],
    keywords: ["nurse", "doctor", "clinical", "medical", "nhs", "pharmacy"],
    titles: ["nurse", "doctor", "clinician"]
  },
  arts: {
    strong: ["graphic designer", "creative director"],
    keywords: ["artist", "designer", "illustrator", "creative", "musician", "theatre"],
    titles: ["designer", "artist"]
  },
  sport: {
    strong: ["sports coach", "fitness instructor"],
    keywords: ["coach", "athlete", "fitness", "sports"],
    titles: ["coach", "trainer"]
  },
  environment: {
    strong: ["climate specialist", "sustainability officer"],
    keywords: ["sustainability", "climate", "ecology", "biodiversity", "carbon"],
    titles: ["environment officer"]
  }
};

// Balanced fallback pair
const fallbackPair = ["business", "technology"];

// Weighted scoring function
function scoreSector(text, title, sector) {
  const lowerText = text.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const signals = sectorSignals[sector];

  let score = 0;

  // Strong phrases (weight 5)
  signals.strong.forEach(phrase => {
    if (lowerText.includes(phrase)) score += 5;
  });

  // Job title patterns (weight 4)
  signals.titles.forEach(t => {
    if (lowerTitle.includes(t)) score += 4;
  });

  // Keywords (weight 2)
  signals.keywords.forEach(kw => {
    if (lowerText.includes(kw)) score += 2;
  });

  return score;
}

// Determine top two sectors
function classifySectors(title, description) {
  const text = `${title} ${description || ""}`;
  const scores = [];

  for (const sector of validSectors) {
    const score = scoreSector(text, title, sector);
    if (score > 0) scores.push({ sector, score });
  }

  // No matches → fallback
  if (scores.length === 0) return fallbackPair;

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Return top two unique sectors
  const unique = [...new Set(scores.map(s => s.sector))];
  return unique.slice(0, 2).length === 1
    ? [unique[0], fallbackPair[1]]
    : unique.slice(0, 2);
}

// --------------------------------------
// SAFE FETCH WRAPPER
// --------------------------------------
async function safeFetch(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message);
    return [];
  }
}

// --------------------------------------
// BBC JOBS (JSON API)
// --------------------------------------
async function fetchBBCJobs() {
  const url = "https://careers.api.bbc.com/v1/jobs/search?limit=50";

  const response = await fetch(url);
  if (!response.ok) throw new Error("BBC API request failed");

  const data = await response.json();
  const items = data?.data || [];

  return items.map((job) => {
    const sectors = classifySectors(job.title, job.description);

    return {
      id: `bbc-${job.id}`,
      title: job.title,
      company: "BBC",
      location: job.location?.city || "Unknown",
      salary: job.salary || null,
      applyUrl: `https://careers.bbc.co.uk/job/${job.id}`,
      category: "job",
      description: job.description || "",
      sectorPair: sectors
    };
  });
}

// --------------------------------------
// GUARDIAN JOBS (RSS)
// --------------------------------------
async function fetchGuardianJobs() {
  const url = "https://jobs.theguardian.com/jobsrss/";
  const response = await fetch(url);
  const xml = await response.text();

  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
  const items = parsed?.rss?.channel?.item || [];

  return items.map((item, index) => {
    const sectors = classifySectors(item.title, item.description);

    return {
      id: `guardian-${index}`,
      title: item.title,
      company: "The Guardian",
      location: "UK",
      salary: null,
      applyUrl: item.link,
      category: "job",
      description: item.description,
      sectorPair: sectors
    };
  });
}

// --------------------------------------
// EXAMPLE SOURCE
// --------------------------------------
async function fetchExampleJobs() {
  const sectors = classifySectors("Example Job", "This is a placeholder job.");

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
      sectorPair: sectors
    }
  ];
}

// --------------------------------------
// MAIN HANDLER
// --------------------------------------
exports.handler = async () => {
  const bbcJobs = await safeFetch(fetchBBCJobs, "BBC Jobs");
  const guardianJobs = await safeFetch(fetchGuardianJobs, "Guardian Jobs");
  const exampleJobs = await safeFetch(fetchExampleJobs, "Example Jobs");

  const allJobs = [...bbcJobs, ...guardianJobs, ...exampleJobs];

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
