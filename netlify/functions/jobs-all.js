const fetch = require("node-fetch");
const xml2js = require("xml2js");
const cheerio = require("cheerio");

// ------------------------------
// CONFIG
// ------------------------------

const MAX_BBC_JOBS = 20;
const CONCURRENCY = 5; // limit parallel embedding calls
const GLOBAL_TIMEOUT_MS = 20000; // 20s safety cutoff

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
// EMBEDDING PIPELINE (cached)
// ------------------------------

let embedder = null;
let cachedSectorEmbeddings = null;

async function loadEmbedder() {
  if (!embedder) {
    const { pipeline } = await import("@xenova/transformers");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

async function getSectorEmbeddings() {
  if (cachedSectorEmbeddings) return cachedSectorEmbeddings;

  const embed = await loadEmbedder();
  cachedSectorEmbeddings = {};

  for (const sector of SECTORS) {
    const emb = await embed(SECTOR_DESCRIPTIONS[sector], {
      pooling: "mean",
      normalize: true
    });
    cachedSectorEmbeddings[sector] = emb.data;
  }

  return cachedSectorEmbeddings;
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function classifySectorsAI(title, description) {
  const embed = await loadEmbedder();
  const sectorEmbeddings = await getSectorEmbeddings();

  const text = `${title}. ${description || ""}`;
  const jobEmbedding = (await embed(text, { pooling: "mean", normalize: true })).data;

  const scores = Object.entries(sectorEmbeddings).map(([sector, emb]) => ({
    sector,
    score: cosineSimilarity(jobEmbedding, emb)
  }));

  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, 2).map(s => s.sector);
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function processInBatches(items, fn, batchSize = CONCURRENCY) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ------------------------------
// BBC MAIN JOB SCRAPER (20 jobs)
// ------------------------------

async function fetchBBCMainJobs() {
  const jobs = [];

  for (let page = 1; page <= 5 && jobs.length < MAX_BBC_JOBS; page++) {
    const url = `https://careerssearch.bbc.co.uk/jobs/search?page=${page}`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    $(".lister__item").each((_, el) => {
      if (jobs.length >= MAX_BBC_JOBS) return;

      const title = $(el).find(".lister__header a").text().trim();
      const link = "https://careerssearch.bbc.co.uk" + $(el).find(".lister__header a").attr("href");
      const location = $(el).find(".lister__meta-item").first().text().trim();
      const summary = $(el).find(".lister__body").text().trim();

      jobs.push({
        id: `bbc-main-${jobs.length}`,
        title,
        company: "BBC",
        location,
        applyUrl: link,
        description: summary || ""
      });
    });
  }

  // classify in batches
  await processInBatches(jobs, async job => {
    job.sectorPair = await classifySectorsAI(job.title, job.description);
    job.category = "job";
    job.salary = null;
    return job;
  });

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

  await processInBatches(jobs, async job => {
    job.sectorPair = await classifySectorsAI(job.title, job.description);
    job.category = "job";
    job.salary = null;
    return job;
  });

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

  const jobs = items.map((item, i) => ({
    id: `guardian-${i}`,
    title: item.title,
    company: "The Guardian",
    location: "UK",
    salary: null,
    applyUrl: item.link,
    category: "job",
    description: item.description || ""
  }));

  await processInBatches(jobs, async job => {
    job.sectorPair = await classifySectorsAI(job.title, job.description);
    return job;
  });

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
  const timeoutPromise = new Promise(resolve =>
    setTimeout(() => resolve({ timeout: true }), GLOBAL_TIMEOUT_MS)
  );

  const workPromise = (async () => {
    const bbcMain = await safeFetch(fetchBBCMainJobs, "BBC Main Jobs");
    const bbcEarly = await safeFetch(fetchBBCEarlyCareers, "BBC Early Careers");
    const guardian = await safeFetch(fetchGuardianJobs, "Guardian Jobs");
    const example = await safeFetch(fetchExampleJobs, "Example Jobs");

    return [...bbcMain, ...bbcEarly, ...guardian, ...example];
  })();

  const result = await Promise.race([timeoutPromise, workPromise]);

  const jobs = result.timeout ? [] : result;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(jobs)
  };
};