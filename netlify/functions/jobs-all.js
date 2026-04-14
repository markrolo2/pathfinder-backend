const fetch = require("node-fetch");
const xml2js = require("xml2js");

// --------------------------------------
// LOVABLE SECTOR SYSTEM (Bias-Reduced)
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

// Tighter, more precise keyword lists
const sectorKeywords = {
  technology: [
    "software", "developer", "engineer", "programmer", "devops",
    "cybersecurity", "cloud", "ai", "machine learning", "ml",
    "data scientist", "full stack", "backend", "frontend"
  ],
  media: [
    "journalist", "editor", "producer", "broadcast", "radio",
    "television", "tv", "film", "video editor", "content creator"
  ],
  business: [
    "strategy", "consultant", "commercial", "business analyst",
    "management consultant", "executive", "director"
  ],
  education: [
    "teacher", "lecturer", "tutor", "professor", "curriculum",
    "education", "school", "university"
  ],
  health: [
    "nurse", "doctor", "clinical", "medical", "nhs", "patient care",
    "pharmacy", "mental health"
  ],
  arts: [
    "artist", "designer", "illustrator", "creative", "musician",
    "performer", "theatre", "graphic design"
  ],
  sport: [
    "coach", "athlete", "fitness", "sports", "physical education"
  ],
  environment: [
    "sustainability", "climate", "environment", "ecology",
    "biodiversity", "carbon", "renewable"
  ]
};

// Balanced, non-circular pairings
const sectorPairMap = {
  technology: "media",
  media: "arts",
  business: "technology",
  education: "arts",
  health: "education",
  arts: "media",
  sport: "health",
  environment: "business"
};

// Neutral fallback
const fallbackPair = ["business", "education"];

// Match sectors with minimum threshold
function matchSectors(text) {
  const lower = text.toLowerCase();
  const matches = [];

  for (const [sector, keywords] of Object.entries(sectorKeywords)) {
    let count = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) count++;
    }
    if (count >= 2) matches.push({ sector, score: count });
  }

  // Sort by strongest match
  matches.sort((a, b) => b.score - a.score);

  return matches.map(m => m.sector);
}

// Always return exactly TWO unique sectors
function enforceSectorPair(sectors) {
  if (sectors.length >= 2) {
    return [...new Set(sectors.slice(0, 2))];
  }

  if (sectors.length === 1) {
    const primary = sectors[0];
    const pair = sectorPairMap[primary] || fallbackPair[1];
    return [primary, pair];
  }

  return fallbackPair;
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
    const text = `${job.title} ${job.description || ""}`;
    const sectors = enforceSectorPair(matchSectors(text));

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
    const text = `${item.title} ${item.description}`;
    const sectors = enforceSectorPair(matchSectors(text));

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
  const text = "Example Job Placeholder";
  const sectors = enforceSectorPair(matchSectors(text));

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
