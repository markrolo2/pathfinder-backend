const fetch = require("node-fetch");
const xml2js = require("xml2js");

// --------------------------------------
// EXPANDED SECTOR KEYWORDS
// --------------------------------------
const sectorKeywords = {
  technology: [
    "software", "developer", "engineer", "engineering", "tech", "data", "cloud",
    "ai", "machine learning", "ml", "cyber", "security", "infrastructure",
    "full stack", "backend", "frontend", "devops", "qa", "testing", "database"
  ],
  media: [
    "journalist", "editor", "producer", "broadcast", "media", "content",
    "digital", "video", "audio", "radio", "tv", "creative", "storytelling"
  ],
  finance: [
    "finance", "accountant", "banking", "investment", "analyst", "financial",
    "audit", "tax", "credit", "risk", "wealth", "trading"
  ],
  healthcare: [
    "nurse", "doctor", "clinical", "healthcare", "medical", "nhs", "patient",
    "pharmacy", "mental health", "care", "surgery"
  ],
  education: [
    "teacher", "lecturer", "education", "school", "university", "training",
    "curriculum", "tutor", "teaching assistant"
  ],
  marketing: [
    "marketing", "brand", "seo", "social media", "advertising", "campaign",
    "communications", "public relations", "copywriting"
  ],
  operations: [
    "operations", "logistics", "supply chain", "project manager", "pm",
    "coordinator", "planning", "delivery", "compliance"
  ],
  sales: [
    "sales", "business development", "account manager", "bdm", "lead generation",
    "client", "customer", "crm"
  ],
  business: [
    "strategy", "management", "consultant", "business", "commercial",
    "operations", "planning", "director", "executive"
  ],
  socialcare: [
    "support worker", "care assistant", "social care", "community support",
    "youth worker", "family support"
  ]
};

// --------------------------------------
// SECTOR PAIRING MAP (NO DUPLICATES)
// --------------------------------------
const sectorPairMap = {
  technology: "business",
  media: "technology",
  finance: "business",
  healthcare: "education",
  education: "socialcare",
  marketing: "business",
  operations: "business",
  sales: "business",
  business: "operations",
  socialcare: "education"
};

// Fallback if nothing matches
const fallbackPair = ["business", "operations"];

// --------------------------------------
// MATCH SECTORS
// --------------------------------------
function matchSectors(text) {
  const lower = text.toLowerCase();
  const matches = [];

  for (const [sector, keywords] of Object.entries(sectorKeywords)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matches.push(sector);
    }
  }

  return matches;
}

// --------------------------------------
// ALWAYS RETURN TWO UNIQUE SECTORS
// --------------------------------------
function enforceSectorPair(sectors) {
  if (sectors.length >= 2) {
    return [...new Set(sectors.slice(0, 2))];
  }

  if (sectors.length === 1) {
    const primary = sectors[0];
    const pair = sectorPairMap[primary] || "business";
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(allJobs)
  };
};
