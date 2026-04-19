const fetch = require("node-fetch");
const xml2js = require("xml2js");

// ------------------------------
// AI CLASSIFIER (dynamic import)
// ------------------------------

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

let embedder = null;

async function loadEmbedder() {
  if (!embedder) {
    const { pipeline } = await import("@xenova/transformers");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (magA * magB);
}

async function classifySectorsAI(title, description) {
  const embed = await loadEmbedder();
  const text = `${title}. ${description || ""}`;

  const jobEmbedding = (await embed(text, { pooling: "mean", normalize: true })).data;

  const scores = [];

  for (const sector of SECTORS) {
    const sectorEmbedding = (
      await embed(SECTOR_DESCRIPTIONS[sector], { pooling: "mean", normalize: true })
    ).data;

    scores.push({
      sector,
      score: cosineSimilarity(jobEmbedding, sectorEmbedding)
    });
  }

  scores.sort((a, b) => b.score - a.score);

  const topTwo = [...new Set(scores.map(s => s.sector))].slice(0, 2);

  return topTwo.length === 2 ? topTwo : ["business", "technology"];
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
  const res = await fetch(url);
  return await res.text();
}

// ------------------------------
// GUARDIAN JOBS (RSS)
// ------------------------------

async function fetchGuardianJobs() {
  const url = "https://jobs.theguardian.com/jobsrss/";
  const xml = await fetchHTML(url);

  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
  const items = parsed?.rss?.channel?.item || [];

  const jobs = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const job = {
      id: `guardian-${i}`,
      title: item.title,
      company: "The Guardian",
      location: "UK",
      salary: null,
      applyUrl: item.link,
      category: "job",
      description: item.description || ""
    };

    job.sectorPair = await classifySectorsAI(job.title, job.description);
    jobs.push(job);
  }

  return jobs;
}

// ------------------------------
// EXAMPLE JOB
// ------------------------------

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