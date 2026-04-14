const fetch = require("node-fetch");
const xml2js = require("xml2js");

// --------------------------------------
// SECTOR MATCHING LOGIC
// --------------------------------------
const sectorKeywords = {
  technology: ["software", "developer", "engineer", "tech", "data", "cloud", "ai", "machine learning"],
  media: ["journalist", "editor", "producer", "broadcast", "media", "content", "digital"],
  finance: ["finance", "accountant", "banking", "investment", "analyst"],
  healthcare: ["nurse", "doctor", "clinical", "healthcare", "medical"],
  education: ["teacher", "lecturer", "education", "school", "university"],
  marketing: ["marketing", "brand", "seo", "social media", "advertising"],
  operations: ["operations", "logistics", "supply chain", "project manager"],
  sales: ["sales", "business development", "account manager"]
};

// Returns an array of matching sectors for a job
function matchSectors(text) {
  const lower = text.toLowerCase();
  const matches = [];

  for (const [sector, keywords] of Object.entries(sectorKeywords)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matches.push(sector);
    }
  }

  return matches.length > 0 ? matches : ["general"];
}

// Helper: safely run any fetch function without breaking the whole endpoint
async function safeFetch(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message);
    return []; // return empty array so the rest still works
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
    return {
      id: `bbc-${job.id}`,
      title: job.title,
      company: "BBC",
      location: job.location?.city || "Unknown",
      salary: job.salary || null,
      applyUrl: `https://careers.bbc.co.uk/job/${job.id}`,
      category: "job",
      description: job.description || "",
      sectorPair: matchSectors(text)
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
    return {
      id: `guardian-${index}`,
      title: item.title,
      company: "The Guardian",
      location: "UK",
      salary: null,
      applyUrl: item.link,
      category: "job",
      description: item.description,
      sectorPair: matchSectors(text)
    };
  });
}

// --------------------------------------
// EXAMPLE SOURCE (placeholder)
// --------------------------------------
async function fetchExampleJobs() {
  const text = "Example Job Placeholder";
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
      sectorPair: matchSectors(text)
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
      "Content-Type": "application/json"
    },
    body: JSON.stringify(allJobs)
  };
};
