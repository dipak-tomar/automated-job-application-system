import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import puppeteer from 'puppeteer';

const searchLinkedInJobs = async ({
  jobTitle,
  experience,
  logger
}) => {
  logger?.info("\u{1F50D} [JobSearch] Starting LinkedIn job search", { jobTitle, experience });
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(jobTitle)}&location=India&f_TPR=r604800&f_E=${experience === "entry" ? "1" : experience === "mid" ? "2,3" : "4,5,6"}`;
    logger?.info("\u{1F310} [JobSearch] Navigating to LinkedIn", { searchUrl });
    await page.goto(searchUrl, { waitUntil: "networkidle2" });
    await page.waitForSelector(".job-search-card", { timeout: 1e4 });
    const jobs = await page.evaluate(() => {
      const jobCards = document.querySelectorAll(".job-search-card");
      return Array.from(jobCards).slice(0, 10).map((card) => {
        const titleElement = card.querySelector(".base-search-card__title");
        const companyElement = card.querySelector(".base-search-card__subtitle");
        const locationElement = card.querySelector(".job-search-card__location");
        const linkElement = card.querySelector("a");
        const timeElement = card.querySelector(".job-search-card__listdate");
        return {
          title: titleElement?.textContent?.trim() || "",
          company: companyElement?.textContent?.trim() || "",
          location: locationElement?.textContent?.trim() || "",
          url: linkElement?.href || "",
          postedDate: timeElement?.textContent?.trim() || "",
          experience: "",
          description: "",
          source: "LinkedIn"
        };
      });
    });
    await browser.close();
    logger?.info("\u2705 [JobSearch] LinkedIn search completed", { jobCount: jobs.length });
    return jobs;
  } catch (error) {
    logger?.error("\u274C [JobSearch] LinkedIn search failed", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
};
const searchNaukriJobs = async ({
  jobTitle,
  experience,
  logger
}) => {
  logger?.info("\u{1F50D} [JobSearch] Starting Naukri job search", { jobTitle, experience });
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
    const experienceMap = {
      "entry": "0-2",
      "mid": "2-5",
      "senior": "5-10"
    };
    const searchUrl = `https://www.naukri.com/jobs-in-india?k=${encodeURIComponent(jobTitle)}&experience=${experienceMap[experience] || "0-10"}`;
    logger?.info("\u{1F310} [JobSearch] Navigating to Naukri", { searchUrl });
    await page.goto(searchUrl, { waitUntil: "networkidle2" });
    await page.waitForSelector(".jobTuple", { timeout: 1e4 });
    const jobs = await page.evaluate(() => {
      const jobCards = document.querySelectorAll(".jobTuple");
      return Array.from(jobCards).slice(0, 10).map((card) => {
        const titleElement = card.querySelector(".title");
        const companyElement = card.querySelector(".companyInfo .subTitle");
        const locationElement = card.querySelector(".locationsContainer .location");
        const linkElement = card.querySelector(".title a");
        const experienceElement = card.querySelector(".expwdth");
        const timeElement = card.querySelector(".jobTupleFooter .fleft");
        return {
          title: titleElement?.textContent?.trim() || "",
          company: companyElement?.textContent?.trim() || "",
          location: locationElement?.textContent?.trim() || "",
          url: linkElement && "href" in linkElement && typeof linkElement.href === "string" ? `https://www.naukri.com${linkElement.href}` : "",
          postedDate: timeElement?.textContent?.trim() || "",
          experience: experienceElement?.textContent?.trim() || "",
          description: "",
          source: "Naukri"
        };
      });
    });
    await browser.close();
    logger?.info("\u2705 [JobSearch] Naukri search completed", { jobCount: jobs.length });
    return jobs;
  } catch (error) {
    logger?.error("\u274C [JobSearch] Naukri search failed", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
};
const jobSearchTool = createTool({
  id: "job-search-tool",
  description: "Searches for tech jobs posted this week on LinkedIn and Naukri based on job title and experience level",
  inputSchema: z.object({
    jobTitle: z.string().default("Software Developer").describe("Job title to search for (e.g., 'Software Developer', 'Full Stack Developer', 'React Developer')"),
    experienceLevel: z.enum(["entry", "mid", "senior"]).default("mid").describe("Experience level: entry (0-2 years), mid (2-5 years), senior (5+ years)")
  }),
  outputSchema: z.object({
    jobs: z.array(z.object({
      title: z.string(),
      company: z.string(),
      location: z.string(),
      description: z.string(),
      url: z.string(),
      postedDate: z.string(),
      experience: z.string(),
      source: z.string()
    })),
    totalCount: z.number()
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { jobTitle, experienceLevel } = context;
    logger?.info("\u{1F527} [JobSearchTool] Starting job search execution", { jobTitle, experienceLevel });
    try {
      const [linkedInJobs, naukriJobs] = await Promise.all([
        searchLinkedInJobs({ jobTitle, experience: experienceLevel, logger }),
        searchNaukriJobs({ jobTitle, experience: experienceLevel, logger })
      ]);
      const allJobs = [...linkedInJobs, ...naukriJobs];
      const oneWeekAgo = /* @__PURE__ */ new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const recentJobs = allJobs.filter((job) => {
        const postedText = job.postedDate.toLowerCase();
        return postedText.includes("day") || postedText.includes("hour") || postedText.includes("today") || postedText.includes("yesterday") || postedText.includes("1 week") || postedText.includes("2 day") || postedText.includes("3 day") || postedText.includes("4 day") || postedText.includes("5 day") || postedText.includes("6 day");
      });
      logger?.info("\u2705 [JobSearchTool] Job search completed successfully", {
        totalJobs: allJobs.length,
        recentJobs: recentJobs.length,
        linkedInCount: linkedInJobs.length,
        naukriCount: naukriJobs.length
      });
      return {
        jobs: recentJobs,
        totalCount: recentJobs.length
      };
    } catch (error) {
      logger?.error("\u274C [JobSearchTool] Job search failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
});

export { jobSearchTool };
//# sourceMappingURL=1bf9c02d-5349-448f-9ad0-54eeea78309e.mjs.map
