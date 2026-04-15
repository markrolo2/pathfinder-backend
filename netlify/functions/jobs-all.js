const fetch = require("node-fetch");
const xml2js = require("xml2js");

// --------------------------------------
// AI SECTOR CLASSIFIER (EMBEDDING-BASED)
// --------------------------------------

// Lovable’s allowed sectors
const SECTORS = [
  "technology",
  "media",
  "business",
  "education",
  "health",
  "arts",
  "sport",
  "environment"
];

// Sector descriptions for embedding comparison
const SECTOR_DESCRIPTIONS = {
  technology: "software engineering, programming, data science, AI, cloud computing, cybersecurity",
  media: "journalism, broadcasting, content creation, film, TV, radio, digital media",
  business: "management, strategy, consulting, operations, finance, commercial roles",
  education: "teaching, lecturing, tutoring, schools, universities, curriculum development",
  health: "nursing, medicine, clinical roles, healthcare, mental health, NHS",
  arts: "creative design, illustration, music, theatre, performance, graphic design",
  sport: "coaching, athletics, fitness, physical education, sports training",
  environment: "sustainability, climate science, ecology, biodiversity, renewable energy"
};

// Lazy-loaded embedder
let embedder = null;

async function loadEmbedder() {
  if (!embedder) {
    const { pipeline } = await import("@xenova/transformers");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

// Cosine similarity
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
}

// AI classification
async function classifySectorsAI(title, description) {
  const embed = await loadEmbedder();

  const text = `${title}. ${description || ""}`;

  // Embed job text
  const jobEmbedding = (await embed(text, { pooling: "mean", normalize: true })).data;

  // Embed sectors
  const sectorScores = [];

  for (const sector of SECTORS) {
    const sectorEmbedding = (
      await embed(SECTOR_DESCRIPTIONS[sector], { pooling: "mean", normalize: true })
    ).data;

    const score = cosineSimilarity(jobEmbedding, sectorEmbedding);
    sectorScores.push({ sector, score });
  }

  // Sort by similarity
  sectorScores.sort((a, b) => b.score - a.score);

  // Top 2 unique sectors
  const topTwo = [...new Set(sectorScores.map(s => s.sector))].slice(0, 2);

  // Fallback if needed
  if (topTwo.length < 2) return ["business", "technology"];

  return topTwo;
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

  const results = [];
  for (const job of items) {
    const sectors = await classifySectorsAI(job.title, job.description);

    results.push({
      id: `bbc-${job.id}`,
      title: job.title,
      company: "BBC",
      location: job.location?.city || "Unknown",
      salary: job.salary || null,
      applyUrl: `https://careers.bbc.co.uk/job/${job.id}`,
      category: "job",
      description: job.description || "",
      sectorPair: sectors
    });
  }

  return results;
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

  const results = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sectors = await classifySectorsAI(item.title, item.description);

    results.push({
      id: `guardian-${i}`,
      title: item.title,
      company: "The Guardian",
      location: "UK",
      salary: null,
      applyUrl: item.link,
      category: "job",
      description: item.description,
      sectorPair: sectors
    });
  }

  return results;
}

// --------------------------------------
// EXAMPLE SOURCE
// --------------------------------------
async function fetchExampleJobs() {
  const sectors = await classifySectorsAI("Example Job", "This is a placeholder job.");

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
