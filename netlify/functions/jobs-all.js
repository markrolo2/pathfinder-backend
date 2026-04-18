// netlify/functions/jobs-all.js

const fetch = require("node-fetch");
const xml2js = require("xml2js");
const cheerio = require("cheerio");
const OpenAI = require("openai");

// ------------------------------
// OPENAI CLIENT
// ------------------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ------------------------------
// SECTOR DEFINITIONS
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

// ------------------------------
// EMBEDDINGS (OpenAI)
// ------------------------------
async function embed(text) {
  const res = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float"
  });
  return res.data[0].embedding;
}

function cosineSimilarity(a, b) {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

// ------------------------------
// CLASSIFIER USING OPENAI
// ------------------------------
async function classifySectorsAI(title, description) {
  const text = `${title}. ${description || ""}`;

  const jobEmbedding = await embed(text);

  const scores = [];

  for (const sector of SECTORS) {
    const sectorEmbedding = await embed(SECTOR_DESCRIPTIONS[sector]);
    scores.push({
      sector,
      score: cosineSimilarity(jobEmbedding, sectorEmbedding)
    });
  }

  scores.sort((a, b) => b.score - a.score);

  const topTwo = scores.slice(0, 2).map(s => s.sector);

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
// BBC SCRAPER (UPDATED DOMAIN)
// ------------------------------
async function fetchBBCMainJobs() {
  const jobs = [];

  const url = "https://careers.bbc.co.uk/search-results";
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  $(".search-result").each((i, el) => {
    const title = $(el).find(".search-result__title").text().trim();
    const link = $(el).find("a").attr("href");
    const location = $(el).find(".search-result__location").text().trim();
    const summary = $(el).find(".search-result__snippet").text().trim();

    if (!title || !link) return;

    jobs.push({
      id: `bbc-${i}`,
      title,
      company: "BBC",
      location,
      applyUrl: link.startsWith("http") ? link : "https://careers.bbc.co.uk" + link,
      description: summary || ""
    });
  });

  // Classify
  for (const job of jobs) {
    job.sectorPair = await classifySectorsAI(job.title, job.description);
    job.category = "job";
    job.salary = null;
  }

  return jobs;
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
  const bbcMain = await safeFetch(fetchBBCMainJobs, "BBC Main Jobs");
  const guardian = await safeFetch(fetchGuardianJobs, "Guardian Jobs");
  const example = await safeFetch(fetchExampleJobs, "Example Jobs");

  const allJobs = [...bbcMain, ...guardian, ...example];

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
