// netlify/functions/daily-scrape.js

import fetch from "node-fetch";

let embedder = null;

// Load embedder dynamically at runtime
async function loadEmbedder() {
  if (!embedder) {
    const { pipeline } = await import("@xenova/transformers");

    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      {
        revision: "main",
        cache_dir: "/tmp"
      }
    );
  }
  return embedder;
}

// Example: classify job sectors
async function classifySectorsAI(title, description) {
  const embed = await loadEmbedder();

  const text = `${title}. ${description}`;
  const embedding = await embed(text, { pooling: "mean", normalize: true });

  const sectors = {
    technology: ["software", "developer", "engineer", "AI", "cloud"],
    finance: ["bank", "trading", "investment", "accounting"],
    healthcare: ["nurse", "doctor", "clinical", "medical"],
    marketing: ["SEO", "content", "brand", "social media"],
    sales: ["sales", "account manager", "business development"]
  };

  const scores = {};

  for (const [sector, keywords] of Object.entries(sectors)) {
    const keywordEmbedding = await embed(keywords.join(" "), {
      pooling: "mean",
      normalize: true
    });

    const dot = embedding.data.reduce(
      (sum, v, i) => sum + v * keywordEmbedding.data[i],
      0
    );

    scores[sector] = dot;
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([sector]) => sector);
}

export const handler = async () => {
  try {
    const response = await fetch(
      "https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=YOUR_ID&app_key=YOUR_KEY"
    );

    const data = await response.json();

    const processed = await Promise.all(
      data.results.map(async (job) => {
        const sectors = await classifySectorsAI(
          job.title,
          job.description || ""
        );

        return {
          id: job.id,
          title: job.title,
          company: job.company.display_name,
          location: job.location.display_name,
          description: job.description,
          sectors
        };
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Daily scrape complete", processed })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

