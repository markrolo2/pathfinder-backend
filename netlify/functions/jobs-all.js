// netlify/functions/get-jobs.js

import fetch from "node-fetch";

export const handler = async () => {
  try {
    const response = await fetch(
      "https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=YOUR_ID&app_key=YOUR_KEY"
    );

    const data = await response.json();

    const jobs = data.results.map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company.display_name,
      location: job.location.display_name,
      description: job.description
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(jobs)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
