// Force Xenova to use Netlify's writable temp directory
process.env.XENOVA_CACHE_DIR = "/tmp";
process.env.TRANSFORMERS_CACHE = "/tmp";

const fetch = require("node-fetch");
const xml2js = require("xml2js");
const cheerio = require("cheerio");

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
    const mod = await import("@xenova/transformers");
    embedder = await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
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
  try {
    const res = await fetch(url);
    return await res.text();
  } catch (err) {
    console.error("❌ fetchHTML failed:", err.message);
    return "";
  }
}

// ------------------------------
// BBC MAIN JOB SCRAPER (20 jobs)
// ------------------------------

async function fetchBBCMainJobs() {
  const jobs = [];
  const MAX_JOBS = 20;

  for (let page = 1; page <= 5 && jobs.length < MAX_JOBS; page++) {
    const url = `https://careers.bbc.co.uk/search?page=${page}`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    $(".search-results__item").each((_, el) => {
      if (jobs.length >= MAX_JOBS) return;

      const title = $(el).find(".search-results__item-title").text().trim();
      const link = $(el).find("a").attr("href");
      const location = $(el).find(".search-results__item-location").text().trim();
      const summary = $(el).find(".search-results__item-description").text().trim();

      if (!title || !link) return;

      jobs.push({
        id: `bbc-main-${jobs.length}`,
        title,
        company: "BBC",
        location,
        applyUrl: link.startsWith("http") ? link : "https://careers.bbc.co.uk" + link,
        description: summary || ""
      });
    });
  }

  for (const job of jobs) {
    job.sectorPair = await classifySectorsAI(job.title, job.description);
    job.category = "job";
    job.salary = null;
  }

  return jobs;
}

// --------------------------------------
// BBC EARLY CAREERS SCRAPER
// --------------------------------------

async function fetchBBCEarlyCareers() {
  const url = "https://www.bbc.co.uk/careers/trainee-schemes-and-apprenticeships";
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const jobs = [];

  $(".promo").each((i, el) => {
    const title = $(el).find(".promo__title").text().trim();
    const link = $(el).find("a").attr("href");
    const summary = $(el).find(".promo__summary").text().trim();

    if (!title || !link) return;

    jobs.push({
      id: `bbc-early-${i}`,
      title,
      company: "BBC Early Careers",
      location: "UK",
      applyUrl: link.startsWith("http") ? link : "https://www.bbc.co.uk" + link,
      description: summary || ""
    });
  });

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

  if (!xml || xml.trim() === "") {
    console.error("❌ Guardian RSS returned empty XML");
    return [];
  }

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
  const bbcEarly = await safeFetch(fetchBBCEarlyCareers, "BBC Early Careers");
  const guardian = await safeFetch(fetchGuardianJobs, "Guardian Jobs");
  const example = await safeFetch(fetchExampleJobs, "Example Jobs");

  const allJobs = [...bbcMain, ...bbcEarly, ...guardian, ...example];

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
