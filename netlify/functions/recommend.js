// netlify/functions/recommend.js

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

// Compute embedding for a job
async function embedText(text) {
  const embed = await loadEmbedder();
  return embed(text, { pooling: "mean", normalize: true });
}

// Cosine similarity
function cosineSimilarity(a, b) {
  return a.data.reduce((sum, v, i) => sum + v * b.data[i], 0);
}

export const handler = async (event) => {
  try {
    const { jobTitle, jobDescription } = JSON.parse(event.body || "{}");

    if (!jobTitle || !jobDescription) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing jobTitle or jobDescription" })
      };
    }

    // Embed the target job
    const targetEmbedding = await embedText(`${jobTitle}. ${jobDescription}`);

    // Fetch jobs
    const response = await fetch(
      "https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=YOUR_ID&app_key=YOUR_KEY"
    );
    const data = await response.json();

    // Score each job
    const scored = await Promise.all(
      data.results.map(async (job) => {
        const emb = await embedText(
          `${job.title}. ${job.description || ""}`
        );

        return {
          job,
          score: cosineSimilarity(targetEmbedding, emb)
        };
      })
    );

    // Sort by similarity
    const recommendations = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((item) => ({
        id: item.job.id,
        title: item.job.title,
        company: item.job.company.display_name,
        location: item.job.location.display_name,
        description: item.job.description,
        similarity: item.score
      }));

    return {
      statusCode: 200,
      body: JSON.stringify(recommendations)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
